import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphViewCharacter, GraphViewRelation, ToWebviewMessage } from "./protocol";
import "./graph.css";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

cytoscape.use(fcose);

const vscode = acquireVsCodeApi();

const HINT = "悬停人物查看局部关系；点击节点联动侧边栏树；点击图例过滤门派/关系；拖拽/滚轮/空白平移缩放";

/** 明暗主题各自的可读分类色板；画布无法直接消费 CSS 变量，按主题解析成具体色值 */
const FACTION_COLORS_LIGHT = [
  "#1565c0", "#c62828", "#2e7d32", "#8e24aa", "#ef6c00",
  "#5d4037", "#d81b60", "#00838f", "#9e9d24", "#546e7a",
];
const FACTION_COLORS_DARK = [
  "#64b5f6", "#e57373", "#81c784", "#ba68c8", "#ffb74d",
  "#bcaaa4", "#f48fb1", "#4dd0e1", "#dce775", "#90a4ae",
];
const TYPE_COLORS_LIGHT: Record<string, string> = {
  "朋友": "#2e7d32",
  "敌人": "#c62828",
  "师徒": "#00838f",
  "亲属": "#1565c0",
  "恋人": "#ad1457",
};
const TYPE_COLORS_DARK: Record<string, string> = {
  "朋友": "#66bb6a",
  "敌人": "#e57373",
  "师徒": "#4dd0e1",
  "亲属": "#64b5f6",
  "恋人": "#f06292",
};

interface ThemePalette {
  dark: boolean;
  foreground: string;
  background: string;
  muted: string;
  nodeText: string;
  fontFamily: string;
  factionColors: string[];
  typeColors: Record<string, string>;
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
    // 亮主题门派色深沉 → 白字；暗主题门派色明亮 → 深字
    nodeText: dark ? "#101418" : "#ffffff",
    fontFamily: read("--vscode-font-family", "system-ui, sans-serif"),
    factionColors: dark ? FACTION_COLORS_DARK : FACTION_COLORS_LIGHT,
    typeColors: dark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT,
  };
}

interface GraphData {
  characters: GraphViewCharacter[];
  relations: GraphViewRelation[];
}

let cy: cytoscape.Core | undefined;
let graphData: GraphData | undefined;
let highlightedId: string | undefined;
let dragging = false;
/** 图例过滤状态：门派 / 关系类型两类 key 各自一个显隐集合 */
const hiddenFactions = new Set<string>();
const hiddenTypes = new Set<string>();

function report(message: string): void {
  vscode.postMessage({ type: "webviewError", message });
}

function showInfo(text: string): void {
  const info = document.getElementById("info");
  if (info) {
    info.textContent = text;
  }
}

function factionColorMap(palette: ThemePalette): Map<string, string> {
  const map = new Map<string, string>();
  const factions = [...new Set((graphData?.characters ?? []).map((c) => c.faction))];
  factions.forEach((faction, i) => {
    map.set(faction, palette.factionColors[i % palette.factionColors.length]);
  });
  return map;
}

/** 关系数量即人物"戏份"，用于节点字号映射与样式范围 */
function degreeMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of graphData?.relations ?? []) {
    map.set(r.source, (map.get(r.source) ?? 0) + 1);
    map.set(r.target, (map.get(r.target) ?? 0) + 1);
  }
  return map;
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildStylesheet(palette: ThemePalette): cytoscape.StylesheetJson {
  const maxDegree = Math.max(1, ...degreeMap().values());
  const sheet: cytoscape.StylesheetJson = [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": palette.muted,
        width: "label",
        height: "label",
        padding: "10px",
        "border-width": 1,
        "border-color": palette.background,
        label: "data(name)",
        color: palette.nodeText,
        "font-family": palette.fontFamily,
        // 度数（关系数）映射字号：核心人物节点自然更大
        "font-size": `mapData(degree, 0, ${maxDegree}, 11, 14)`,
        "text-valign": "center",
        "text-halign": "center",
        "min-zoomed-font-size": 6,
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "curve-style": "bezier",
        "line-color": palette.muted,
        "target-arrow-shape": "none",
        "target-arrow-color": palette.muted,
      },
    },
    // 关系文字默认不显示：悬停连线 / 聚焦人物时才标注，消除全图标签噪音
    {
      selector: "edge.labeled",
      style: {
        width: 3,
        label: "data(label)",
        color: palette.muted,
        "font-family": palette.fontFamily,
        "font-size": 10,
        "text-rotation": "autorotate",
        "text-background-color": palette.background,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "min-zoomed-font-size": 6,
      },
    },
    // 有状态（已决裂 / 隐秘进行中 / 单方面 / 已诀别 / 已和解…）→ 虚线
    { selector: 'edge[dashed = "1"]', style: { "line-style": "dashed" } },
    // 有方向的关系（师徒：师→徒；单方面）→ 三角箭头
    { selector: 'edge[arrow = "1"]', style: { "target-arrow-shape": "triangle" } },
    // 聚焦时其余元素淡化
    { selector: ".dim", style: { opacity: 0.12 } },
    // 图例过滤：display:none，不参与命中与布局
    { selector: ".filtered", style: { display: "none" } },
    { selector: "node.focus", style: { "border-width": 2, "border-color": palette.foreground, "font-size": 14 } },
  ];
  for (const [faction, color] of factionColorMap(palette)) {
    sheet.push({
      selector: `node[faction = "${escapeSelectorValue(faction)}"]`,
      style: { "background-color": color },
    });
  }
  for (const type of new Set((graphData?.relations ?? []).map((r) => r.type))) {
    const color = palette.typeColors[type] ?? palette.muted;
    sheet.push({
      selector: `edge[kind = "${escapeSelectorValue(type)}"]`,
      // 排在 edge.labeled 之后：同优先级后者生效，标签文字跟随关系类型色
      style: { "line-color": color, "target-arrow-color": color, color },
    });
  }
  return sheet;
}

function isFilterHidden(kind: "faction" | "type", key: string): boolean {
  return (kind === "faction" ? hiddenFactions : hiddenTypes).has(key);
}

function toggleFilter(kind: "faction" | "type", key: string): void {
  const hidden = kind === "faction" ? hiddenFactions : hiddenTypes;
  if (hidden.has(key)) {
    hidden.delete(key);
  } else {
    hidden.add(key);
  }
  applyFilters();
}

/** 显隐作用到元素 class；若当前聚焦人物被过滤掉则顺带退出聚焦 */
function applyFilters(): void {
  for (const item of document.querySelectorAll<HTMLButtonElement>("#legend .toggle")) {
    const key = item.dataset.key ?? "";
    item.classList.toggle("off", isFilterHidden(item.dataset.kind === "type" ? "type" : "faction", key));
  }
  if (!cy) {
    return;
  }
  const g = cy;
  g.batch(() => {
    g.nodes().forEach((n) => {
      n.toggleClass("filtered", hiddenFactions.has(String(n.data("faction"))));
    });
    g.edges().forEach((e) => {
      e.toggleClass("filtered", hiddenTypes.has(String(e.data("kind"))));
    });
  });
  if (highlightedId) {
    const node = cy.getElementById(highlightedId);
    if (node.empty() || node.hidden()) {
      clearHighlight();
      return;
    }
  }
  cy.fit(undefined, 40);
}

function buildLegend(palette: ThemePalette): void {
  const legend = document.getElementById("legend");
  if (!legend) {
    return;
  }
  legend.textContent = "";
  const addToggle = (kind: "faction" | "type", key: string, color: string, cls: string): void => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `item toggle${isFilterHidden(kind, key) ? " off" : ""}`;
    item.dataset.kind = kind;
    item.dataset.key = key;
    item.title = "点击显示 / 隐藏";
    const swatch = document.createElement("span");
    swatch.className = cls;
    if (cls.startsWith("swatch-node")) {
      (swatch as HTMLElement).style.backgroundColor = color;
    } else {
      (swatch as HTMLElement).style.borderTopColor = color;
    }
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(key));
    item.addEventListener("click", () => toggleFilter(kind, key));
    legend.appendChild(item);
  };
  for (const [faction, color] of factionColorMap(palette)) {
    addToggle("faction", faction, color, "swatch-node");
  }
  for (const [type, color] of Object.entries(palette.typeColors)) {
    addToggle("type", type, color, "swatch-edge");
  }
  const hint = document.createElement("span");
  hint.className = "item";
  const dashed = document.createElement("span");
  dashed.className = "swatch-edge dashed";
  dashed.style.borderTopColor = palette.muted;
  hint.appendChild(dashed);
  hint.appendChild(document.createTextNode("虚线 = 带状态，箭头 = 单方面/师徒"));
  legend.appendChild(hint);
}

function nodeName(id: string): string {
  const node = cy?.getElementById(id);
  return node && !node.empty() ? String(node.data("name")) : id;
}

/** 聚焦某节点的可见邻域：淡化其余、点亮邻域边标签 */
function focusNeighborhood(node: cytoscape.NodeSingular): void {
  if (!cy) {
    return;
  }
  cy.elements().removeClass("dim focus labeled");
  const hood = node.closedNeighborhood().filter(":visible");
  cy.elements().not(hood).addClass("dim");
  hood.edges().addClass("labeled");
  node.addClass("focus");
}

function clearFocus(): void {
  cy?.elements().removeClass("dim focus labeled");
}

function applyHighlight(personId: string): void {
  highlightedId = personId;
  if (!cy) {
    return;
  }
  const node = cy.getElementById(personId);
  if (node.empty() || node.hidden()) {
    showInfo(`图中没有可见人物：${personId}`);
    return;
  }
  focusNeighborhood(node);
  cy.fit(node.closedNeighborhood().filter(":visible"), 60);
}

function clearHighlight(): void {
  highlightedId = undefined;
  if (!cy) {
    return;
  }
  clearFocus();
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
    const node = event.target as cytoscape.NodeSingular;
    showInfo(`${String(node.data("name"))}（${String(node.data("faction"))} · ${String(node.data("title"))}）`);
    applyHighlight(node.id());
    vscode.postMessage({ type: "selectPerson", personId: node.id() });
  });
  c.on("tap", "edge", (event: cytoscape.EventObject) => {
    if (dragging) {
      dragging = false;
      return;
    }
    const edge = event.target as cytoscape.EdgeSingular;
    const status = String(edge.data("label"));
    const note = String(edge.data("note") ?? "");
    showInfo(`${nodeName(edge.source().id())} —${status}— ${nodeName(edge.target().id())}${note ? `：${note}` : ""}`);
  });
  c.on("tap", (event: cytoscape.EventObject) => {
    if (event.target === c) {
      showInfo(HINT);
      clearHighlight();
    }
  });
  // 悬停临时聚焦：点击态（联动高亮）存在时不抢戏
  c.on("mouseover", "node", (event: cytoscape.EventObject) => {
    if (highlightedId || dragging) {
      return;
    }
    focusNeighborhood(event.target as cytoscape.NodeSingular);
  });
  c.on("mouseout", "node", () => {
    if (highlightedId) {
      return;
    }
    clearFocus();
  });
  c.on("mouseover", "edge", (event: cytoscape.EventObject) => {
    if (highlightedId) {
      return;
    }
    (event.target as cytoscape.EdgeSingular).addClass("labeled");
  });
  c.on("mouseout", "edge", (event: cytoscape.EventObject) => {
    if (highlightedId) {
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
      nodes: graphData.characters.map((c) => ({
        data: { id: c.id, name: c.name, faction: c.faction, title: c.title, degree: degree.get(c.id) ?? 0 },
      })),
      edges: graphData.relations.map((r, i) => ({
        data: {
          id: `e${i}`,
          source: r.source,
          target: r.target,
          kind: r.type,
          label: r.status ? `${r.type}·${r.status}` : r.type,
          note: r.note ?? "",
          dashed: r.status ? "1" : "0",
          arrow: r.type === "师徒" || r.status === "单方面" ? "1" : "0",
        },
      })),
    },
    style: buildStylesheet(resolveTheme()),
    // fcose：比内置 cose 收敛质量高，长边更少、簇更紧
    layout: {
      name: "fcose",
      quality: "default",
      animate: true,
      animationDuration: 500,
      randomize: true,
      nodeSeparation: 80,
      idealEdgeLength: 100,
      nodeRepulsion: 6000,
      padding: 30,
      nodeDimensionsIncludeLabels: true,
    } as cytoscape.LayoutOptions,
    wheelSensitivity: 0.25,
    minZoom: 0.2,
    maxZoom: 4,
  });
  wireEvents(cy);
  applyFilters();
  if (highlightedId) {
    const keep = highlightedId;
    highlightedId = undefined;
    applyHighlight(keep);
  } else {
    cy.fit(undefined, 40);
  }
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
    case "graph":
      graphData = {
        characters: Array.isArray(msg.characters) ? msg.characters : [],
        relations: Array.isArray(msg.relations) ? msg.relations : [],
      };
      // 新数据重置过滤视图状态
      hiddenFactions.clear();
      hiddenTypes.clear();
      applyTheme();
      buildCy();
      showInfo(HINT);
      break;
    case "highlight":
      if (typeof msg.personId === "string") {
        applyHighlight(msg.personId);
      }
      break;
    case "clearHighlight":
      clearHighlight();
      break;
  }
}

function boot(): void {
  try {
    applyTheme();
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
