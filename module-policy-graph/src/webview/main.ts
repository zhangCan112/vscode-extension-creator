// 模块访问策略图 webview：只消费宿主算好的匹配状态，不计算业务语义。
import cytoscape from "cytoscape";
import dagreLayout from "cytoscape-dagre";
import type { GraphEdge, GraphPayload, MsgType, Tier } from "../shared/model";
import { MSG_TYPES, TIERS } from "../shared/model";
import type { HostToWebview, WebviewToHost } from "../shared/protocol";
import "./graph.css";

cytoscape.use(dagreLayout);

type Level =
  | { mode: "overview" }
  | { mode: "module"; id: string }
  | { mode: "channel"; edgeId: string };

interface Palette {
  typeColor: Record<MsgType, string>;
  dangling: string;
  cycle: string;
  tierColor: Record<Tier, string>;
  nodeBg: string;
  nodeFg: string;
}

const LINE_STYLE: Record<MsgType, string> = {
  command: "solid",
  query: "dashed",
  viewquery: "dotted",
};
const ARROW: Record<MsgType, string> = {
  command: "triangle",
  query: "diamond",
  viewquery: "circle",
};
const ARROW_GLYPH: Record<MsgType, string> = {
  command: "▶",
  query: "◆",
  viewquery: "●",
};
const TYPE_TEXT: Record<MsgType, string> = {
  command: "command 写/触发",
  query: "query 请求-响应",
  viewquery: "viewquery 视图快照",
};
const TIER_TEXT: Record<Tier, string> = {
  entry: "entry 入口层",
  feature: "feature 特性层",
  domain: "domain 领域层",
  infra: "infra 基础设施层",
};
const STATE_TEXT: Record<GraphEdge["state"], string> = {
  aligned: "已对齐",
  "dangling-send": "悬空发送",
  "dangling-receive": "悬空订阅",
};

const vscode = acquireVsCodeApi();

let payload: GraphPayload | null = null;
let cy: cytoscape.Core | null = null;
let level: Level = { mode: "overview" };
const typeOn = new Set<MsgType>(MSG_TYPES);
const tierOn = new Set<Tier>(TIERS);
let danglingOnly = false;
let cycleHl = false;
let dragMoved = false;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ———— 主题 ————————————————————————————————————————

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function readPalette(): Palette {
  const kind = document.body.dataset.vscodeThemeKind ?? "";
  const dark = kind.startsWith("vscode-dark") || kind.includes("hc-black") || kind.includes("themable-dark");
  return {
    typeColor: dark
      ? { command: "#64b5f6", query: "#e57373", viewquery: "#81c784" }
      : { command: "#1565c0", query: "#c62828", viewquery: "#2e7d32" },
    dangling: dark ? "#ffb74d" : "#ef6c00",
    cycle: dark ? "#f06292" : "#d81b60",
    tierColor: dark
      ? { entry: "#ba68c8", feature: "#4dd0e1", domain: "#bcaaa4", infra: "#90a4ae" }
      : { entry: "#8e24aa", feature: "#00838f", domain: "#5d4037", infra: "#546e7a" },
    nodeBg: cssVar("--vscode-editorWidget-background", dark ? "#222" : "#fff"),
    nodeFg: cssVar("--vscode-editor-foreground", dark ? "#eee" : "#333"),
  };
}

// ———— 图构建 ————————————————————————————————————————

function buildElements(p: GraphPayload): cytoscape.ElementDefinition[] {
  const maxDeg = Math.max(1, ...p.nodes.map((n) => n.degree));
  const els: cytoscape.ElementDefinition[] = p.nodes.map((n) => {
    const k = n.degree / maxDeg;
    return {
      data: {
        id: n.id,
        tier: n.tier,
        degree: n.degree,
        danglingCount: n.danglingCount,
        size: 26 + 22 * k,
        fsize: 11 + 3 * k,
        bw: n.danglingCount > 0 ? 3 : 2,
        bstyle: n.danglingCount > 0 ? "dashed" : "solid",
      },
    };
  });
  const big = p.nodes.length > 60;
  for (const e of p.edges) {
    const dangling = e.state !== "aligned";
    els.push({
      data: {
        id: e.id,
        source: e.from,
        target: e.to,
        type: e.type,
        state: e.state,
        w: dangling ? 1.6 : 2,
        op: dangling ? 0.95 : big ? 0.35 : 0.9,
        ls: dangling ? "dashed" : LINE_STYLE[e.type],
        as: dangling ? "none" : ARROW[e.type],
        text: dangling ? STATE_TEXT[e.state] : e.type,
      },
      classes: dangling ? "dlbl" : "",
    });
  }
  return els;
}

const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "data(bg)",
      "border-width": "data(bw)",
      "border-color": "data(bc)",
      "border-style": "data(bstyle)",
      label: "data(id)",
      color: "data(fg)",
      "font-size": "data(fsize)",
      width: "data(size)",
      height: "data(size)",
      shape: "round-rectangle",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 5,
      "text-wrap": "wrap",
      "text-max-width": 90,
      "min-zoomed-font-size": 6,
    },
  },
  {
    selector: "edge",
    style: {
      width: "data(w)",
      "line-color": "data(c)",
      "line-style": "data(ls)",
      "target-arrow-color": "data(c)",
      "target-arrow-shape": "data(as)",
      "curve-style": "bezier",
      opacity: "data(op)",
      "font-size": 9,
      color: "data(lc)",
      "text-background-color": "data(lbg)",
      "text-background-opacity": 1,
      "text-background-padding": 2,
      "min-zoomed-font-size": 6,
    },
  },
  { selector: "edge.dlbl", style: { label: "data(text)" } },
  { selector: "edge.lbl", style: { label: "data(text)" } },
  { selector: "node.hi", style: { "border-width": 4 } },
  { selector: "edge.hi", style: { opacity: 1, width: 3 } },
  { selector: "edge.cyc", style: { "line-color": "data(cycC)", "target-arrow-color": "data(cycC)", width: 3.5, opacity: 1 } },
  { selector: ".dim", style: { opacity: 0.08 } },
  { selector: ".off", style: { display: "none" } },
] as unknown as cytoscape.StylesheetStyle[];

function buildCy(p: GraphPayload): void {
  cy?.destroy();
  cy = cytoscape({
    container: el<HTMLDivElement>("cy"),
    elements: buildElements(p),
    style: CY_STYLE,
    wheelSensitivity: 0.2,
  });
  wireInteractions();
}

// ———— 主题应用（canvas 吃不到 CSS 变量，靠 data 字段热替换） ————

function applyTheme(): void {
  const p = readPalette();
  if (cy) {
    cy.batch(() => {
      cy?.nodes().forEach((n) => {
        n.data({ bg: p.nodeBg, fg: p.nodeFg, bc: p.tierColor[n.data("tier") as Tier] });
      });
      cy?.edges().forEach((e) => {
        const dangling = e.data("state") !== "aligned";
        const c = dangling ? p.dangling : p.typeColor[e.data("type") as MsgType];
        e.data({ c, cycC: p.cycle, lc: dangling ? p.dangling : p.nodeFg, lbg: p.nodeBg });
      });
    });
  }
  renderLegend();
}

// ———— 可见性（层级 + 图例过滤 + 只看悬空），纯数据驱动算出 id 集合 ————

function edgePassesFilters(e: GraphEdge): boolean {
  if (danglingOnly && e.state === "aligned") {
    return false;
  }
  return typeOn.has(e.type);
}

function computeVisible(): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const p = payload;
  if (!p) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }
  let edges = p.edges.filter(edgePassesFilters);
  let nodeIds = new Set(p.nodes.filter((n) => tierOn.has(n.tier)).map((n) => n.id));

  if (danglingOnly) {
    const endpoints = new Set<string>();
    edges.forEach((e) => {
      endpoints.add(e.from);
      endpoints.add(e.to);
    });
    nodeIds = new Set([...nodeIds].filter((id) => endpoints.has(id)));
  }

  if (level.mode === "module") {
    const m = level.id;
    edges = edges.filter((e) => e.from === m || e.to === m);
    nodeIds = new Set([m, ...edges.flatMap((e) => [e.from, e.to])]);
  } else if (level.mode === "channel") {
    // 通道级是显式意图：聚焦的那条通道不受过滤影响
    const edgeId = level.edgeId;
    const target = p.edges.filter((e) => e.id === edgeId);
    edges = target;
    nodeIds = new Set(target.flatMap((e) => [e.from, e.to]));
  } else {
    edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  }

  return { nodeIds, edgeIds: new Set(edges.map((e) => e.id)) };
}

function applyVisibility(relayout: boolean): void {
  if (!cy) {
    return;
  }
  const g = cy;
  const { nodeIds, edgeIds } = computeVisible();
  g.batch(() => {
    g.elements().each((ele) => {
      const id = ele.id();
      const keep = ele.isNode() ? nodeIds.has(id) : edgeIds.has(id);
      if (keep) {
        ele.removeClass("off");
      } else {
        ele.addClass("off");
      }
    });
  });
  if (relayout) {
    runLayout();
  }
}

function runLayout(): void {
  if (!cy) {
    return;
  }
  const visible = cy.elements().filter((e) => !e.hidden());
  const n = visible.nodes().length;
  const focusMode = level.mode !== "overview";
  const opts = {
    name: "dagre",
    rankDir: "TB",
    rankSep: focusMode ? 90 : n > 60 ? 60 : 80,
    nodeSep: focusMode ? 55 : n > 60 ? 35 : 50,
    edgeSep: focusMode ? 40 : 20,
    animate: false,
    eles: visible,
  };
  cy.layout(opts as unknown as cytoscape.LayoutOptions).run();
  cy.fit(undefined, 36);
}

// ———— 三级浏览 ————————————————————————————————————————

function clearHover(): void {
  if (!cy) {
    return;
  }
  const g = cy;
  g.batch(() => {
    g.elements().removeClass("dim hi");
    g.edges().removeClass("lbl");
  });
  if (level.mode === "module") {
    // 模块聚焦态：相关对齐通道保持类型文字
    const { edgeIds } = computeVisible();
    g.edges()
      .filter((e) => edgeIds.has(e.id()) && e.data("state") === "aligned")
      .addClass("lbl");
  }
}

function focusModule(id: string): void {
  if (!cy || !payload?.nodes.some((n) => n.id === id)) {
    return;
  }
  level = { mode: "module", id };
  clearHover();
  applyVisibility(true);
  renderChrome();
}

function focusChannel(edgeId: string): void {
  if (!cy || !payload?.edges.some((e) => e.id === edgeId)) {
    return;
  }
  level = { mode: "channel", edgeId };
  clearHover();
  cy.edges().removeClass("lbl");
  cy.getElementById(edgeId).addClass("lbl");
  applyVisibility(true);
  renderChrome();
}

function toOverview(): void {
  level = { mode: "overview" };
  if (cy) {
    cy.edges().removeClass("lbl");
  }
  clearHover();
  applyVisibility(true);
  renderChrome();
}

function upLevel(): void {
  if (level.mode === "channel") {
    const edgeId = level.edgeId;
    const e = payload?.edges.find((x) => x.id === edgeId);
    if (e) {
      focusModule(e.from);
      return;
    }
  }
  toOverview();
}

// ———— 交互（悬停不跳视口；拖拽不误触点击） ——————————————————

function wireInteractions(): void {
  if (!cy) {
    return;
  }
  cy.on("drag", "node", () => {
    dragMoved = true;
  });
  cy.on("tap", "node", (ev) => {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    focusModule(ev.target.id());
  });
  cy.on("tap", "edge", (ev) => {
    focusChannel(ev.target.id());
  });
  cy.on("tap", (ev) => {
    if (ev.target === cy) {
      toOverview();
    }
  });
  cy.on("mouseover", "node, edge", (ev) => {
    if (level.mode !== "overview" || !cy) {
      return;
    }
    const target = ev.target;
    const hood = target.isNode() ? target.closedNeighborhood() : target.connectedNodes().add(target);
    cy.batch(() => {
      cy?.elements().not(hood).addClass("dim");
      hood.addClass("hi");
      if (target.isEdge()) {
        target.addClass("lbl");
      }
    });
  });
  cy.on("mouseout", "node, edge", () => {
    if (level.mode !== "overview") {
      return;
    }
    clearHover();
  });
}

// ———— 面板渲染（全部 textContent / CSSOM，不拼 innerHTML） ————

function renderChrome(): void {
  renderCrumbs();
  renderDetail();
  renderInfobar();
}

function mkCrumb(text: string, onClick: (() => void) | null, current: boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "crumb" + (current ? " current" : "");
  b.textContent = text;
  if (onClick) {
    b.addEventListener("click", onClick);
  }
  return b;
}

function renderCrumbs(): void {
  const nav = el("crumbs");
  nav.textContent = "";
  nav.appendChild(mkCrumb("总览", level.mode === "overview" ? null : toOverview, level.mode === "overview"));
  if (level.mode === "module" || level.mode === "channel") {
    const edgeId = level.mode === "channel" ? level.edgeId : undefined;
    const moduleId = level.mode === "module" ? level.id : payload?.edges.find((e) => e.id === edgeId)?.from ?? "";
    nav.appendChild(document.createTextNode("›"));
    nav.appendChild(
      mkCrumb(moduleId, level.mode === "channel" ? () => focusModule(moduleId) : null, level.mode === "module")
    );
  }
  if (level.mode === "channel") {
    const edgeId = level.edgeId;
    const e = payload?.edges.find((x) => x.id === edgeId);
    if (e) {
      nav.appendChild(document.createTextNode("›"));
      nav.appendChild(mkCrumb(`${e.from}→${e.to} ${e.type}`, null, true));
    }
  }
}

function chip(text: string, color: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "chip";
  s.textContent = text;
  s.style.color = color;
  return s;
}

function declRow(
  dir: string,
  who: string,
  type: MsgType,
  state: GraphEdge["state"],
  edgeId: string | undefined
): HTMLDivElement {
  const p = readPalette();
  const row = document.createElement("div");
  row.className = "decl";
  const d = document.createElement("span");
  d.className = "dir";
  d.textContent = dir;
  const w = document.createElement("span");
  w.className = "who";
  w.textContent = who;
  const t = document.createElement("span");
  t.textContent = TYPE_TEXT[type];
  t.style.color = state === "aligned" ? p.typeColor[type] : p.dangling;
  const st = document.createElement("span");
  st.className = "st";
  st.textContent = state === "aligned" ? "✓ 对齐" : "✗ " + STATE_TEXT[state];
  st.style.color = state === "aligned" ? "var(--vscode-testing-iconPassed, #2e7d32)" : p.dangling;
  row.append(d, w, t, st);
  if (edgeId) {
    row.addEventListener("click", () => focusChannel(edgeId));
  }
  return row;
}

function actionBtn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function renderDetail(): void {
  const aside = el("detail");
  aside.textContent = "";
  if (level.mode === "overview" || !payload) {
    aside.style.display = "none";
    return;
  }
  aside.style.display = "block";
  const p = readPalette();
  const nodeById = new Map(payload.nodes.map((n) => [n.id, n]));

  if (level.mode === "module") {
    const node = nodeById.get(level.id);
    if (!node) {
      return;
    }
    const h = document.createElement("h2");
    h.textContent = node.id;
    h.appendChild(chip(node.tier, p.tierColor[node.tier]));
    aside.appendChild(h);
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `${node.description || "（无描述）"} · 度数 ${node.degree}`;
    aside.appendChild(meta);
    if (node.danglingCount > 0) {
      const warn = document.createElement("div");
      warn.textContent = `⚠ 悬空声明 ${node.danglingCount} 条`;
      warn.style.color = p.dangling;
      aside.appendChild(warn);
    }

    const h3s = document.createElement("h3");
    h3s.textContent = `发送声明（${outDeclCount(node.id)}）`;
    aside.appendChild(h3s);
    payload.edges
      .filter((e) => e.from === node.id && (e.state === "aligned" || e.state === "dangling-send"))
      .forEach((e) => aside.appendChild(declRow("→", e.to, e.type, e.state, e.id)));

    const h3r = document.createElement("h3");
    h3r.textContent = `接受声明（${inDeclCount(node.id)}）`;
    aside.appendChild(h3r);
    payload.edges
      .filter((e) => e.to === node.id && (e.state === "aligned" || e.state === "dangling-receive"))
      .forEach((e) => aside.appendChild(declRow("←", e.from, e.type, e.state, e.id)));

    if (payload.source === "files") {
      aside.appendChild(actionBtn("打开 policy 文件", () => post({ type: "openFile", module: node.id })));
    }
    return;
  }

  // channel 详情
  const edgeId = level.edgeId;
  const e = payload.edges.find((x) => x.id === edgeId);
  if (!e) {
    return;
  }
  const onCycle = payload.cycleEdgeIds.includes(e.id);
  const h = document.createElement("h2");
  h.textContent = `${e.from} → ${e.to}`;
  aside.appendChild(h);

  const kvType = document.createElement("div");
  kvType.className = "kv";
  const typeB = document.createElement("b");
  typeB.textContent = "消息类型 ";
  kvType.append(typeB);
  kvType.appendChild(chip(TYPE_TEXT[e.type], e.state === "aligned" ? p.typeColor[e.type] : p.dangling));
  aside.appendChild(kvType);

  const kvState = document.createElement("div");
  kvState.className = "kv";
  const stateB = document.createElement("b");
  stateB.textContent = "匹配状态 ";
  kvState.append(stateB);
  const stSpan = document.createElement("span");
  stSpan.textContent =
    e.state === "aligned" ? "✓ 双方声明对齐，通道成立" : "✗ " + STATE_TEXT[e.state] + "（单边声明，通道未成立）";
  stSpan.style.color = e.state === "aligned" ? "var(--vscode-testing-iconPassed, #2e7d32)" : p.dangling;
  kvState.appendChild(stSpan);
  aside.appendChild(kvState);

  if (onCycle) {
    const kvCyc = document.createElement("div");
    kvCyc.className = "kv";
    const cycSpan = document.createElement("span");
    cycSpan.textContent = "⭮ 处在循环依赖上";
    cycSpan.style.color = p.cycle;
    kvCyc.appendChild(cycSpan);
    aside.appendChild(kvCyc);
  }

  for (const side of [e.from, e.to]) {
    const n = nodeById.get(side);
    if (!n) {
      continue;
    }
    const h3 = document.createElement("h3");
    h3.textContent = side;
    h3.appendChild(chip(n.tier, p.tierColor[n.tier]));
    aside.appendChild(h3);
    if (n.description) {
      const d = document.createElement("div");
      d.className = "muted";
      d.textContent = n.description;
      aside.appendChild(d);
    }
  }

  aside.appendChild(actionBtn("聚焦发送方", () => focusModule(e.from)));
  aside.appendChild(actionBtn("聚焦接受方", () => focusModule(e.to)));
  if (payload.source === "files") {
    aside.appendChild(actionBtn("打开双方 policy 文件", () => post({ type: "openFile", module: e.from })));
  }
}

function outDeclCount(id: string): number {
  return payload?.edges.filter((e) => e.from === id && (e.state === "aligned" || e.state === "dangling-send")).length ?? 0;
}

function inDeclCount(id: string): number {
  return payload?.edges.filter((e) => e.to === id && (e.state === "aligned" || e.state === "dangling-receive")).length ?? 0;
}

// ———— 图例（可交互过滤） ——————————————————————————————

function renderLegend(): void {
  const box = el("legend");
  box.textContent = "";
  const p = readPalette();

  const head = document.createElement("div");
  head.className = "lg-head";
  head.textContent = "图例（点击类型/层级可显隐）";
  box.appendChild(head);

  const section = (title: string): HTMLElement => {
    const t = document.createElement("div");
    t.className = "lg-title";
    t.textContent = title;
    box.appendChild(t);
    return t;
  };

  section("消息类型");
  for (const t of MSG_TYPES) {
    const row = document.createElement("div");
    row.className = "lg-row toggle" + (typeOn.has(t) ? "" : " off");
    const line = document.createElement("span");
    line.className = "sw-line";
    line.style.borderTopStyle = LINE_STYLE[t];
    line.style.borderTopColor = p.typeColor[t];
    const arrow = document.createElement("span");
    arrow.className = "sw-arrow";
    arrow.textContent = ARROW_GLYPH[t];
    arrow.style.color = p.typeColor[t];
    const label = document.createElement("span");
    label.textContent = TYPE_TEXT[t];
    row.append(line, arrow, label);
    row.addEventListener("click", () => {
      if (typeOn.has(t)) {
        typeOn.delete(t);
      } else {
        typeOn.add(t);
      }
      renderLegend();
      applyVisibility(false);
    });
    box.appendChild(row);
  }

  section("层级");
  for (const t of TIERS) {
    const row = document.createElement("div");
    row.className = "lg-row toggle" + (tierOn.has(t) ? "" : " off");
    const dot = document.createElement("span");
    dot.className = "sw-node";
    dot.style.borderColor = p.tierColor[t];
    dot.style.background = p.nodeBg;
    const label = document.createElement("span");
    label.textContent = TIER_TEXT[t];
    row.append(dot, label);
    row.addEventListener("click", () => {
      if (tierOn.has(t)) {
        tierOn.delete(t);
      } else {
        tierOn.add(t);
      }
      renderLegend();
      applyVisibility(false);
    });
    box.appendChild(row);
  }

  section("匹配状态");
  const rows: Array<[string, string]> = [
    ["实线+箭头 = 已对齐通道", "var(--vscode-editor-foreground)"],
    ["琥珀虚线 = 悬空发送/订阅", p.dangling],
    ["虚线边框 = 模块有悬空声明", p.dangling],
  ];
  if (cycleHl && payload && payload.cycleEdgeIds.length > 0) {
    rows.push([`循环通道 ${payload.cycleEdgeIds.length} 条`, p.cycle]);
  }
  for (const [text, color] of rows) {
    const row = document.createElement("div");
    row.className = "lg-row info";
    const dot = document.createElement("span");
    dot.className = "sw-dot";
    dot.style.background = color;
    const label = document.createElement("span");
    label.textContent = text;
    row.append(dot, label);
    box.appendChild(row);
  }
}

function renderInfobar(): void {
  const bar = el("infobar");
  if (!payload) {
    bar.textContent = "";
    return;
  }
  const aligned = payload.edges.filter((e) => e.state === "aligned").length;
  const dangling = payload.edges.length - aligned;
  const parts: string[] = [
    payload.source === "demo" ? "演示数据（确定性）" : "策略文件",
    `模块 ${payload.nodes.length}`,
    `对齐通道 ${aligned}`,
    `悬空 ${dangling}`,
  ];
  if (danglingOnly) {
    parts.push(`[只看悬空]`);
  }
  if (cycleHl) {
    const cycEdges = payload.cycleEdgeIds.length;
    const cycMods = cycleModulesOf(payload);
    parts.push(`[循环高亮] ${cycEdges} 条通道 · 涉及 ${cycMods.join(", ")}`);
  }
  bar.textContent = parts.join("  ·  ");
}

function cycleModulesOf(p: GraphPayload): string[] {
  const ids = new Set(p.cycleEdgeIds);
  const mods = new Set<string>();
  for (const e of p.edges) {
    if (ids.has(e.id)) {
      mods.add(e.from);
      mods.add(e.to);
    }
  }
  return [...mods].sort();
}

// ———— 工具栏 ————————————————————————————————————————

function wireToolbar(): void {
  el<HTMLButtonElement>("btnDangling").addEventListener("click", () => {
    danglingOnly = !danglingOnly;
    el<HTMLButtonElement>("btnDangling").classList.toggle("active", danglingOnly);
    applyVisibility(false);
    renderInfobar();
    renderLegend();
  });
  el<HTMLButtonElement>("btnCycle").addEventListener("click", () => {
    cycleHl = !cycleHl;
    el<HTMLButtonElement>("btnCycle").classList.toggle("active", cycleHl);
    if (cy) {
      const ids = new Set(payload?.cycleEdgeIds ?? []);
      const cycEdges = cy.edges().filter((e) => ids.has(e.id()));
      if (cycleHl) {
        cycEdges.addClass("cyc");
      } else {
        cycEdges.removeClass("cyc");
      }
    }
    renderInfobar();
    renderLegend();
  });
  el<HTMLButtonElement>("btnFit").addEventListener("click", () => {
    cy?.fit(undefined, 36);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      upLevel();
    }
  });
}

// ———— 装载 ————————————————————————————————————————

function onLoad(p: GraphPayload): void {
  payload = p;
  level = { mode: "overview" };
  danglingOnly = false;
  cycleHl = false;
  typeOn.clear();
  MSG_TYPES.forEach((t) => typeOn.add(t));
  tierOn.clear();
  TIERS.forEach((t) => tierOn.add(t));
  el<HTMLButtonElement>("btnDangling").classList.remove("active");
  el<HTMLButtonElement>("btnCycle").classList.remove("active");
  buildCy(p);
  applyTheme();
  applyVisibility(true);
  renderChrome();
}

function post(msg: WebviewToHost): void {
  vscode.postMessage(msg);
}

window.addEventListener("message", (ev: MessageEvent) => {
  const m = ev.data as HostToWebview;
  if (!m || typeof m !== "object") {
    return;
  }
  if (m.type === "load") {
    onLoad(m.payload);
  } else if (m.type === "focusModule") {
    focusModule(m.module);
  }
});

// 主题热替换：布局/缩放/过滤状态不动
new MutationObserver(() => applyTheme()).observe(document.body, {
  attributes: true,
  attributeFilter: ["data-vscode-theme-kind", "class", "style"],
});

wireToolbar();
post({ type: "ready" });
