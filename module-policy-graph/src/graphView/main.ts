import cytoscape from "cytoscape";
import dagreLayout from "cytoscape-dagre";
import type { ToWebviewMessage } from "./protocol";
import type { Channel, ModulePolicy } from "../schema";
import "./graph.css";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

cytoscape.use(dagreLayout);

const vscode = acquireVsCodeApi();

const HINT =
  "总览：箭头=数据流，淡显无箭头=悬空；点击模块 → 只看它的依赖子图；点击 policy 条目 → 只看该通道";

const TYPE_LABEL: Record<string, string> = {
  command: "命令",
  query: "查询",
  viewquery: "视图查询",
};

/** 固定消息类型的视觉编码：颜色 × 线型 × 箭头形状 三重冗余 */
interface TypeSpec {
  line: string;
  style: "solid" | "dashed" | "dotted";
  width: number;
  arrow: cytoscape.Css.ArrowShape;
  sampleClass: string;
}

function typeSpecs(dark: boolean): Record<string, TypeSpec> {
  return {
    command: {
      line: dark ? "#e57373" : "#c62828",
      style: "solid",
      width: 3,
      arrow: "triangle-tee",
      sampleClass: "",
    },
    query: {
      line: dark ? "#81c784" : "#2e7d32",
      style: "dashed",
      width: 2,
      arrow: "triangle",
      sampleClass: "dashed",
    },
    viewquery: {
      line: dark ? "#64b5f6" : "#1565c0",
      style: "dotted",
      width: 2,
      arrow: "vee",
      sampleClass: "dotted",
    },
  };
}

const TIER_LABEL: Record<string, string> = {
  entry: "入口",
  feature: "功能",
  domain: "领域",
  infra: "基础设施",
};

function tierColors(dark: boolean): Record<string, string> {
  return {
    entry: dark ? "#4dd0e1" : "#00838f",
    feature: dark ? "#7986cb" : "#3949ab",
    domain: dark ? "#bcaaa4" : "#6d4c41",
    infra: dark ? "#90a4ae" : "#546e7a",
  };
}

interface ThemePalette {
  dark: boolean;
  foreground: string;
  background: string;
  muted: string;
  nodeFill: string;
  fontFamily: string;
  danger: string;
  warn: string;
  types: Record<string, TypeSpec>;
  tiers: Record<string, string>;
}

function resolveTheme(): ThemePalette {
  const kind = document.body.dataset.vscodeThemeKind ?? "vscode-dark";
  const dark = kind.includes("dark") || kind === "vscode-high-contrast";
  const style = getComputedStyle(document.body);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    dark,
    foreground: read("--vscode-editor-foreground", dark ? "#cccccc" : "#333333"),
    background: read("--vscode-editor-background", dark ? "#1e1e1e" : "#ffffff"),
    muted: read("--vscode-descriptionForeground", dark ? "#9d9d9d" : "#6f6f6f"),
    nodeFill: dark ? "#262b30" : "#f5f5f5",
    fontFamily: read("--vscode-font-family", "system-ui, sans-serif"),
    danger: dark ? "#ff5252" : "#d32f2f",
    warn: dark ? "#ffb74d" : "#e65100",
    types: typeSpecs(dark),
    tiers: tierColors(dark),
  };
}

interface GraphData {
  modules: ModulePolicy[];
  channels: Channel[];
}

/** 三级聚焦：总览 → 模块（ego-network）→ 消息（单条通道） */
type Mode =
  | { kind: "overview" }
  | { kind: "module"; id: string }
  | { kind: "channel"; edgeId: string; moduleId?: string };

let cy: cytoscape.Core | undefined;
let graphData: GraphData | undefined;
let mode: Mode = { kind: "overview" };
let dragging = false;
let cycleOn = false;
let danglingOn = false;
/** 图例过滤状态：消息类型 / 模块层级 */
const hiddenTypes = new Set<string>();
const hiddenTiers = new Set<string>();

function report(message: string): void {
  vscode.postMessage({ type: "webviewError", message });
}

function showInfo(text: string): void {
  const info = document.getElementById("info");
  if (info) {
    info.textContent = text;
  }
}

/** 出入通道总数 = 模块耦合度，映射节点字号 */
function degreeMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of graphData?.channels ?? []) {
    map.set(c.source, (map.get(c.source) ?? 0) + 1);
    map.set(c.target, (map.get(c.target) ?? 0) + 1);
  }
  return map;
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 布局自适应：聚焦子图用宽松间距，全局大图收紧并关动画 */
function runLayout(eles: cytoscape.Collection): void {
  if (!cy || eles.length === 0) {
    return;
  }
  const graphLarge = (graphData?.modules.length ?? 0) > 60;
  const airy = eles.length <= 30;
  const opts = airy
    ? { rankSep: 90, nodeSep: 55, edgeSep: 25, animate: true, animationDuration: 400 }
    : graphLarge
      ? { rankSep: 60, nodeSep: 35, edgeSep: 12, animate: false, animationDuration: 0 }
      : { rankSep: 80, nodeSep: 50, edgeSep: 20, animate: true, animationDuration: 400 };
  cy.layout({
    name: "dagre",
    rankDir: "TB",
    ...opts,
    eles,
  } as cytoscape.LayoutOptions).run();
}

function buildStylesheet(palette: ThemePalette): cytoscape.StylesheetJson {
  const maxDegree = Math.max(1, ...degreeMap().values());
  const sheet: cytoscape.StylesheetJson = [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": palette.nodeFill,
        width: "label",
        height: "label",
        padding: "10px",
        "border-width": 2,
        "border-color": palette.muted,
        label: "data(id)",
        color: palette.foreground,
        "font-family": palette.fontFamily,
        "font-size": `mapData(degree, 0, ${maxDegree}, 11, 14)`,
        "text-valign": "center",
        "text-halign": "center",
        // 语义缩放：缩到全图时自动隐藏节点文字，只看结构
        "min-zoomed-font-size": 6,
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        "line-color": palette.muted,
        "target-arrow-color": palette.muted,
        // 总览压噪音：边默认低透明度，聚焦/悬停/环强调时恢复
        opacity: 0.35,
      },
    },
    // 消息类型文字默认不显示：悬停连线 / 聚焦时才标注
    {
      selector: "edge.labeled",
      style: {
        opacity: 1,
        label: "data(label)",
        color: palette.foreground,
        "font-family": palette.fontFamily,
        "font-size": 10,
        "text-rotation": "autorotate",
        "text-background-color": palette.background,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "min-zoomed-font-size": 6,
      },
    },
    { selector: ".dim", style: { opacity: 0.12 } },
    { selector: ".filtered", style: { display: "none" } },
    // 子图隔离：聚焦时无关元素直接离场，而不是淡化占位
    { selector: ".offscreen", style: { display: "none" } },
    { selector: "node.focus", style: { "border-width": 3, "font-size": 14 } },
    { selector: "edge.cycle", style: { opacity: 1, "line-color": palette.danger, "target-arrow-color": palette.danger, width: 4 } },
    { selector: "node.cycle", style: { "border-color": palette.danger, "border-width": 3 } },
  ];
  for (const [type, spec] of Object.entries(palette.types)) {
    sheet.push({
      selector: `edge[type = "${escapeSelectorValue(type)}"]`,
      style: {
        "line-color": spec.line,
        "target-arrow-color": spec.line,
        "target-arrow-shape": spec.arrow,
        "line-style": spec.style,
        width: spec.width,
        color: spec.line,
      },
    });
  }
  for (const [tier, color] of Object.entries(palette.tiers)) {
    sheet.push({
      selector: `node[tier = "${escapeSelectorValue(tier)}"]`,
      style: { "border-color": color },
    });
  }
  // 悬空授权（放在类型规则后）：淡显、无箭头、常显琥珀色提示文字
  sheet.push({
    selector: "edge.dangling",
    style: {
      opacity: 0.5,
      "target-arrow-shape": "none",
      "line-style": "dotted",
      label: "data(dangLabel)",
      color: palette.warn,
      "font-family": palette.fontFamily,
      "font-size": 9,
      "text-rotation": "autorotate",
      "text-background-color": palette.background,
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
      "min-zoomed-font-size": 6,
    },
  });
  return sheet;
}

function isFilterHidden(kind: "type" | "tier", key: string): boolean {
  return (kind === "type" ? hiddenTypes : hiddenTiers).has(key);
}

function toggleFilter(kind: "type" | "tier", key: string): void {
  const hidden = kind === "type" ? hiddenTypes : hiddenTiers;
  if (hidden.has(key)) {
    hidden.delete(key);
  } else {
    hidden.add(key);
  }
  applyFilters();
  render();
  if (cycleOn) {
    highlightCycles();
  }
}

/** 显隐作用到元素 class；节点隐藏时其连带边自动不渲染 */
function applyFilters(): void {
  for (const item of document.querySelectorAll<HTMLButtonElement>("#legend .toggle")) {
    const key = item.dataset.key ?? "";
    item.classList.toggle("off", isFilterHidden(item.dataset.kind === "tier" ? "tier" : "type", key));
  }
  if (!cy) {
    return;
  }
  const g = cy;
  g.batch(() => {
    g.nodes().forEach((n) => {
      n.toggleClass("filtered", hiddenTiers.has(String(n.data("tier"))));
    });
    g.edges().forEach((e) => {
      e.toggleClass("filtered", hiddenTypes.has(String(e.data("type"))));
    });
  });
}

function buildLegend(palette: ThemePalette): void {
  const legend = document.getElementById("legend");
  if (!legend) {
    return;
  }
  legend.textContent = "";
  const addToggle = (kind: "type" | "tier", key: string, label: string): void => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `item toggle${isFilterHidden(kind, key) ? " off" : ""}`;
    item.dataset.kind = kind;
    item.dataset.key = key;
    item.title = "点击显示 / 隐藏";
    if (kind === "type") {
      const spec = palette.types[key];
      const swatch = document.createElement("span");
      swatch.className = `swatch-line ${spec?.sampleClass ?? ""}`.trim();
      if (spec) {
        swatch.style.borderTopColor = spec.line;
      }
      item.appendChild(swatch);
    } else {
      const swatch = document.createElement("span");
      swatch.className = "swatch-tier";
      swatch.style.borderColor = palette.tiers[key] ?? palette.muted;
      item.appendChild(swatch);
    }
    item.appendChild(document.createTextNode(label));
    item.addEventListener("click", () => toggleFilter(kind, key));
    legend.appendChild(item);
  };
  for (const type of Object.keys(palette.types)) {
    addToggle("type", type, `${TYPE_LABEL[type] ?? type} ${type}`);
  }
  for (const tier of Object.keys(palette.tiers)) {
    addToggle("tier", tier, `${TIER_LABEL[tier] ?? tier} ${tier}`);
  }
  const hint = document.createElement("span");
  hint.className = "item";
  hint.textContent = "箭头 = 数据流方向";
  legend.appendChild(hint);
}

function typeText(type: string): string {
  return `${TYPE_LABEL[type] ?? type}(${type})`;
}

function accessSentence(edge: cytoscape.EdgeSingular): string {
  const s = edge.source().id();
  const t = edge.target().id();
  const type = String(edge.data("type"));
  const status = String(edge.data("status"));
  const label = TYPE_LABEL[type] ?? type;
  if (status === "sendOnly") {
    return `悬空发送：${s} 声明发送「${label}」至 ${t}，但 ${t} 的 policy 未声明接受`;
  }
  if (status === "receiveOnly") {
    return `悬空订阅：${t} 声明接受来自 ${s} 的「${label}」，但 ${s} 未声明发送`;
  }
  return `${s} → ${t} · ${label}（双方声明已对齐）`;
}

// ---------- 三级聚焦 ----------

function enterOverview(): void {
  exitDangling();
  mode = { kind: "overview" };
  render();
}

function enterModule(id: string): void {
  exitDangling();
  mode = { kind: "module", id };
  render();
}

function enterChannel(edgeId: string): void {
  exitDangling();
  // 从模块模式进入且通道与该模块相关 → 面包屑保留模块上下文
  let moduleId: string | undefined;
  if (mode.kind === "module") {
    const edge = cy?.getElementById(edgeId);
    const keep = mode.id;
    const touches =
      edge && !edge.empty()
        ? edge.connectedNodes().some((n) => (n as cytoscape.NodeSingular).id() === keep)
        : false;
    moduleId = touches ? keep : undefined;
  }
  mode = { kind: "channel", edgeId, moduleId };
  render();
}

/** 按 mode 统一重绘聚焦态：聚焦 = 隐藏无关元素 + 只对子图重新布局 */
function render(): void {
  updateCrumb();
  const side = document.getElementById("side");
  if (!cy) {
    return;
  }
  const g = cy;
  g.elements().removeClass("dim focus labeled offscreen");
  if (mode.kind === "overview") {
    side?.classList.remove("show");
    showInfo(HINT);
    const visible = g.elements(":visible");
    runLayout(visible);
    g.fit(undefined, 40);
    return;
  }
  if (mode.kind === "module") {
    const node = g.getElementById(mode.id);
    if (node.empty() || node.hidden()) {
      mode = { kind: "overview" };
      render();
      return;
    }
    const hood = node.closedNeighborhood().filter(":visible");
    g.elements().not(hood).addClass("offscreen");
    hood.edges().addClass("labeled");
    node.addClass("focus");
    renderPolicyPanel(mode.id);
    side?.classList.add("show");
    showInfo(`${mode.id} 的依赖子图：点击右侧 policy 条目下钻单条通道；点空白处返回总览`);
    runLayout(hood);
    g.fit(hood, 60);
    return;
  }
  const edge = g.getElementById(mode.edgeId);
  if (edge.empty() || edge.hidden() || !edge.isEdge()) {
    mode = { kind: "overview" };
    render();
    return;
  }
  const hood = edge.union(edge.connectedNodes()).filter(":visible");
  g.elements().not(hood).addClass("offscreen");
  edge.addClass("labeled");
  edge.connectedNodes().addClass("focus");
  if (mode.moduleId) {
    renderPolicyPanel(mode.moduleId);
    side?.classList.add("show");
  } else {
    side?.classList.remove("show");
  }
  showInfo(accessSentence(edge));
  runLayout(hood);
  g.fit(hood, 80);
}

function updateCrumb(): void {
  const crumb = document.getElementById("crumb");
  if (!crumb) {
    return;
  }
  crumb.textContent = "";
  const parts: Array<{ label: string; onClick?: () => void }> = [
    { label: "全部", onClick: () => enterOverview() },
  ];
  if (mode.kind === "module") {
    parts.push({ label: mode.id });
  } else if (mode.kind === "channel") {
    const mid = mode.moduleId;
    if (mid) {
      parts.push({ label: mid, onClick: () => enterModule(mid) });
    }
    const edge = cy?.getElementById(mode.edgeId);
    const type = edge && !edge.empty() ? String(edge.data("type")) : "";
    parts.push({ label: `${mode.edgeId.replace(`:${type}`, "")} · ${TYPE_LABEL[type] ?? type}` });
  }
  parts.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "/";
      crumb.appendChild(sep);
    }
    const span = document.createElement("span");
    span.textContent = p.label;
    if (p.onClick) {
      span.className = "link";
      span.addEventListener("click", p.onClick);
    }
    crumb.appendChild(span);
  });
}

/** 右侧 policy 审计面板：条目可点击 → 进入该通道聚焦 */
function renderPolicyPanel(moduleId: string): void {
  const side = document.getElementById("side");
  const m = graphData?.modules.find((x) => x.id === moduleId);
  if (!side || !m) {
    return;
  }
  side.textContent = "";
  const title = document.createElement("div");
  title.className = "side-title";
  title.textContent = m.id;
  side.appendChild(title);
  const sub = document.createElement("div");
  sub.className = "side-sub";
  sub.textContent = `${m.tier} · ${TIER_LABEL[m.tier] ?? m.tier}`;
  side.appendChild(sub);
  if (m.description) {
    const desc = document.createElement("p");
    desc.className = "side-desc";
    desc.textContent = m.description;
    side.appendChild(desc);
  }
  const section = (heading: string, dir: "send" | "receive"): void => {
    const h = document.createElement("h4");
    h.textContent = heading;
    side.appendChild(h);
    const ul = document.createElement("ul");
    const entries = m[dir];
    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "（无）";
      ul.appendChild(li);
    }
    for (const e of entries) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `entry ${e.matched ? "ok" : "bad"}`;
      btn.title = e.matched ? "通道已对齐，点击聚焦" : "悬空授权，点击聚焦";
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = e.matched ? "✓" : "✗";
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = `${dir === "send" ? "→" : "←"} ${e.peer} · ${typeText(e.type)}`;
      btn.appendChild(mark);
      btn.appendChild(text);
      const edgeId =
        dir === "send" ? `${m.id}->${e.peer}:${e.type}` : `${e.peer}->${m.id}:${e.type}`;
      btn.addEventListener("click", () => enterChannel(edgeId));
      li.appendChild(btn);
      ul.appendChild(li);
    }
    side.appendChild(ul);
  };
  section("发送 SEND", "send");
  section("接受 RECEIVE", "receive");
  const hint = document.createElement("div");
  hint.className = "side-hint";
  hint.textContent = "点击条目聚焦该通道；✗ = 悬空授权";
  side.appendChild(hint);
}

// ---------- 循环依赖（仅已对齐通道构成真实数据流环） ----------

function cyclicEdges(g: cytoscape.Core): cytoscape.EdgeSingular[] {
  const edges = g.edges().filter((e) => e.visible() && e.data("status") === "matched");
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    const list = adj.get(e.source().id()) ?? [];
    list.push(e.target().id());
    adj.set(e.source().id(), list);
  });
  const reaches = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      if (cur === to) {
        return true;
      }
      if (seen.has(cur)) {
        continue;
      }
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) {
        stack.push(next);
      }
    }
    return false;
  };
  const result: cytoscape.EdgeSingular[] = [];
  edges.forEach((e) => {
    if (reaches(e.target().id(), e.source().id())) {
      result.push(e);
    }
  });
  return result;
}

function highlightCycles(): void {
  if (!cy) {
    return;
  }
  cy.elements().removeClass("cycle");
  const cyclic = cyclicEdges(cy);
  for (const e of cyclic) {
    e.addClass("cycle");
    e.connectedNodes().addClass("cycle");
  }
  if (cyclic.length === 0) {
    showInfo("未发现循环依赖 ✓");
    return;
  }
  const modules = new Set<string>();
  cyclic.forEach((e) => {
    modules.add(e.source().id());
    modules.add(e.target().id());
  });
  showInfo(`循环依赖：${[...modules].join("、")}（${cyclic.length} 条通道在环上）`);
}

function toggleCycleMode(): void {
  if (!cy) {
    return;
  }
  cycleOn = !cycleOn;
  document.getElementById("cycleBtn")?.classList.toggle("active", cycleOn);
  if (cycleOn) {
    highlightCycles();
  } else {
    cy.elements().removeClass("cycle");
    showInfo(HINT);
  }
}

// ---------- 悬空授权聚焦 ----------

function toggleDangling(): void {
  if (!cy) {
    return;
  }
  danglingOn = !danglingOn;
  document.getElementById("danglingBtn")?.classList.toggle("active", danglingOn);
  if (!danglingOn) {
    render();
    return;
  }
  mode = { kind: "overview" };
  updateCrumb();
  document.getElementById("side")?.classList.remove("show");
  const g = cy;
  g.elements().removeClass("dim focus labeled offscreen");
  g.elements().addClass("offscreen");
  const dangling = g.edges(".dangling").filter(":visible");
  const related = dangling.union(dangling.connectedNodes());
  related.removeClass("offscreen");
  const sends = g.edges('[status = "sendOnly"]').filter(":visible").length;
  const recvs = g.edges('[status = "receiveOnly"]').filter(":visible").length;
  showInfo(`悬空授权：发送 ${sends} 条 / 订阅 ${recvs} 条；点击模块或空白处退出`);
  if (dangling.nonempty()) {
    runLayout(related);
    g.fit(related, 80);
  }
}

function exitDangling(): void {
  if (!danglingOn) {
    return;
  }
  danglingOn = false;
  document.getElementById("danglingBtn")?.classList.remove("active");
}

// ---------- 事件与建图 ----------

function relayout(): void {
  if (!cy) {
    return;
  }
  const visible = cy.elements(":visible");
  runLayout(visible);
  cy.fit(undefined, 40);
}

function wireEvents(c: cytoscape.Core): void {
  // 拖拽节点松手也会触发 tap，用标记区分"拖完"与"点击"
  c.on("drag", "node", () => {
    dragging = true;
  });
  c.on("tap", "node", (event: cytoscape.EventObject) => {
    if (dragging) {
      dragging = false;
      return;
    }
    enterModule((event.target as cytoscape.NodeSingular).id());
  });
  c.on("tap", "edge", (event: cytoscape.EventObject) => {
    if (dragging) {
      dragging = false;
      return;
    }
    enterChannel((event.target as cytoscape.EdgeSingular).id());
  });
  c.on("tap", (event: cytoscape.EventObject) => {
    if (event.target === c) {
      enterOverview();
    }
  });
  // 悬停临时聚焦：仅在总览态且非悬空模式下生效，不做视口跳转
  c.on("mouseover", "node", (event: cytoscape.EventObject) => {
    if (mode.kind !== "overview" || danglingOn || dragging) {
      return;
    }
    const node = event.target as cytoscape.NodeSingular;
    c.elements().removeClass("dim focus labeled");
    const hood = node.closedNeighborhood().filter(":visible");
    c.elements().not(hood).addClass("dim");
    hood.edges().addClass("labeled");
    node.addClass("focus");
  });
  c.on("mouseout", "node", () => {
    if (mode.kind !== "overview" || danglingOn) {
      return;
    }
    c.elements().removeClass("dim focus labeled");
  });
  c.on("mouseover", "edge", (event: cytoscape.EventObject) => {
    if (mode.kind !== "overview" || danglingOn) {
      return;
    }
    (event.target as cytoscape.EdgeSingular).addClass("labeled");
  });
  c.on("mouseout", "edge", (event: cytoscape.EventObject) => {
    if (mode.kind !== "overview" || danglingOn) {
      return;
    }
    (event.target as cytoscape.EdgeSingular).removeClass("labeled");
  });
}

function buildCy(): void {
  if (!graphData) {
    return;
  }
  cy?.destroy();
  const container = document.getElementById("cy");
  if (!container) {
    report("找不到 #cy 容器");
    return;
  }
  const degree = degreeMap();
  cy = cytoscape({
    container,
    elements: {
      nodes: graphData.modules.map((m) => ({
        data: {
          id: m.id,
          tier: m.tier,
          degree: degree.get(m.id) ?? 0,
        },
      })),
      edges: graphData.channels.map((c) => ({
        data: {
          id: c.id,
          source: c.source,
          target: c.target,
          type: c.type,
          status: c.status,
          label: TYPE_LABEL[c.type] ?? c.type,
          dangLabel: c.status === "sendOnly" ? "悬空发送" : c.status === "receiveOnly" ? "悬空订阅" : "",
        },
        classes: c.status === "matched" ? [] : ["dangling"],
      })),
    },
    style: buildStylesheet(resolveTheme()),
    // 布局统一由 render() → runLayout() 执行（聚焦即子图重排）
    wheelSensitivity: 0.25,
    minZoom: 0.05,
    maxZoom: 4,
  });
  wireEvents(cy);
  applyFilters();
  render();
}

/** 主题切换：CSS 变量由 VS Code 自动更新；画布样式在此重新解析并热替换，布局与位置不丢 */
function applyTheme(): void {
  const palette = resolveTheme();
  buildLegend(palette);
  cy?.style().fromJson(buildStylesheet(palette)).update();
}

function handleMessage(raw: unknown): void {
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const msg = raw as ToWebviewMessage;
  switch (msg.type) {
    case "graph": {
      graphData = {
        modules: Array.isArray(msg.modules) ? msg.modules : [],
        channels: Array.isArray(msg.channels) ? msg.channels : [],
      };
      // 新数据重置全部视图状态
      hiddenTypes.clear();
      hiddenTiers.clear();
      mode = { kind: "overview" };
      cycleOn = false;
      danglingOn = false;
      document.getElementById("cycleBtn")?.classList.remove("active");
      document.getElementById("danglingBtn")?.classList.remove("active");
      applyTheme();
      buildCy();
      showInfo(HINT);
      break;
    }
  }
}

function boot(): void {
  try {
    applyTheme();
    document.getElementById("cycleBtn")?.addEventListener("click", () => toggleCycleMode());
    document.getElementById("danglingBtn")?.addEventListener("click", () => toggleDangling());
    document.getElementById("layoutBtn")?.addEventListener("click", () => relayout());
    document.getElementById("demoBtn")?.addEventListener("click", () => {
      vscode.postMessage({ type: "requestDemo" });
    });
    new MutationObserver(() => applyTheme()).observe(document.body, {
      attributes: true,
      attributeFilter: ["data-vscode-theme-kind"],
    });
    window.addEventListener("message", (event: MessageEvent) => handleMessage(event.data));
    window.addEventListener("resize", () => cy?.resize());
    window.addEventListener("error", (event: ErrorEvent) => report(event.message));
    showInfo(HINT);
    vscode.postMessage({ type: "ready" });
  } catch (e) {
    report(`初始化失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

boot();
