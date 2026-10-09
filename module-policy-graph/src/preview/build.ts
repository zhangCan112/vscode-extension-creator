// pinpoint 审阅用静态快照：复用领域代码 + dagre 同参布局，输出内联 SVG 的 HTML。
// render.py 会剥离 script，因此这里只做静态可视化副本；交互（悬停/缩放/主题）仍需 F5。
import * as fs from "fs";
import * as path from "path";
import dagre from "dagre";
import { generateDemoPolicies } from "../policy/demo";
import { matchChannels } from "../policy/matcher";
import { parsePolicyDir } from "../policy/parser";
import type { GraphEdge, GraphNode, GraphPayload, MsgType, Tier } from "../shared/model";

const PAL = {
  typeColor: { command: "#1565c0", query: "#c62828", viewquery: "#2e7d32" } as Record<MsgType, string>,
  dangling: "#ef6c00",
  cycle: "#d81b60",
  tierColor: { entry: "#8e24aa", feature: "#00838f", domain: "#5d4037", infra: "#546e7a" } as Record<Tier, string>,
  nodeBg: "#ffffff",
  nodeFg: "#333333",
};

const DASH: Record<MsgType, string> = { command: "", query: "7 5", viewquery: "2 4" };
const ARROW: Record<MsgType, string> = { command: "tri", query: "dia", viewquery: "cir" };
const ARROW_GLYPH: Record<MsgType, string> = { command: "▶", query: "◆", viewquery: "●" };
const TYPE_TEXT: Record<MsgType, string> = {
  command: "command 写/触发",
  query: "query 请求-响应",
  viewquery: "viewquery 视图快照",
};
const STATE_TEXT: Record<GraphEdge["state"], string> = {
  aligned: "✓ 对齐",
  "dangling-send": "✗ 悬空发送",
  "dangling-receive": "✗ 悬空订阅",
};

interface LayoutOpts {
  rankSep: number;
  nodeSep: number;
  edgeSep: number;
  showAlignedLabels: boolean;
  cycleHl: boolean;
  baseOpacity: number;
}

interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function subgraph(p: GraphPayload, keepNodes: Set<string>, edgePred: (e: GraphEdge) => boolean): Subgraph {
  const edges = p.edges.filter((e) => edgePred(e) && keepNodes.has(e.from) && keepNodes.has(e.to));
  const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const extra of keepNodes) {
    ids.add(extra);
  }
  return { nodes: p.nodes.filter((n) => ids.has(n.id)), edges };
}

function renderSvg(p: GraphPayload, sg: Subgraph, opts: LayoutOpts): string {
  const maxDeg = Math.max(1, ...p.nodes.map((n) => n.degree));
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
    edgesep: opts.edgeSep,
    marginx: 24,
    marginy: 34,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of sg.nodes) {
    const k = n.degree / maxDeg;
    const size = 26 + 22 * k;
    g.setNode(n.id, { width: size, height: size });
  }
  for (const e of sg.edges) {
    g.setEdge(e.from, e.to, {}, e.id);
  }
  dagre.layout(g);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of sg.nodes) {
    const pos = g.node(n.id);
    xs.push(pos.x);
    ys.push(pos.y);
  }
  for (const e of g.edges()) {
    for (const pt of g.edge(e).points) {
      xs.push(pt.x);
      ys.push(pt.y);
    }
  }
  const min = { x: Math.min(...xs) - 46, y: Math.min(...ys) - 46 };
  const max = { x: Math.max(...xs) + 66, y: Math.max(...ys) + 66 };

  const defs = `<defs>
    <marker id="tri" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${PAL.typeColor.command}"/></marker>
    <marker id="dia" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="10" markerHeight="9" orient="auto-start-reverse"><path d="M0,5 L5,0 L10,5 L5,10 z" fill="${PAL.typeColor.query}"/></marker>
    <marker id="cir" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><circle cx="5" cy="5" r="4" fill="${PAL.typeColor.viewquery}"/></marker>
  </defs>`;

  const parts: string[] = [defs];
  for (const e of sg.edges) {
    const pts = g.edge(e.from, e.to, e.id).points ?? [];
    if (pts.length < 2) {
      continue;
    }
    const dangling = e.state !== "aligned";
    const onCycle = opts.cycleHl && p.cycleEdgeIds.includes(e.id);
    const color = onCycle ? PAL.cycle : dangling ? PAL.dangling : PAL.typeColor[e.type];
    const d = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const dash = dangling || onCycle ? "7 5" : DASH[e.type];
    const width = onCycle ? 3.5 : dangling ? 1.6 : 2;
    const opacity = dangling ? 0.95 : opts.baseOpacity;
    const marker = dangling || onCycle ? "" : ` marker-end="url(#${ARROW[e.type]})"`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"${dash ? ` stroke-dasharray="${dash}"` : ""}${marker}/>`
    );
    if (dangling || opts.showAlignedLabels || onCycle) {
      const mid = pts[Math.floor(pts.length / 2)];
      const text =
        onCycle && !dangling ? "循环" : dangling ? (e.state === "dangling-send" ? "悬空发送" : "悬空订阅") : e.type;
      const fill = onCycle && !dangling ? PAL.cycle : dangling ? PAL.dangling : PAL.nodeFg;
      parts.push(
        `<text x="${mid.x.toFixed(1)}" y="${(mid.y - 4).toFixed(1)}" font-size="10" fill="${fill}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(text)}</text>`
      );
    }
  }
  for (const n of sg.nodes) {
    const pos = g.node(n.id);
    const k = n.degree / maxDeg;
    const size = 26 + 22 * k;
    const fsize = 11 + 3 * k;
    const border = PAL.tierColor[n.tier];
    const dash = n.danglingCount > 0 ? ' stroke-dasharray="5 3"' : "";
    const bw = n.danglingCount > 0 ? 3 : 2;
    parts.push(
      `<g transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)})">` +
        `<rect x="${(-size / 2).toFixed(1)}" y="${(-size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="5" fill="${PAL.nodeBg}" stroke="${border}" stroke-width="${bw}"${dash}/>` +
        `<text x="0" y="${(size / 2 + 14).toFixed(1)}" font-size="${fsize.toFixed(1)}" fill="${PAL.nodeFg}" text-anchor="middle">${esc(n.id)}</text></g>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${min.x.toFixed(0)} ${min.y.toFixed(0)} ${(max.x - min.x).toFixed(0)} ${(max.y - min.y).toFixed(0)}" style="width:100%;background:#fff;display:block">${parts.join("")}</svg>`;
}

function declRowHtml(dir: string, e: GraphEdge): string {
  const dangling = e.state !== "aligned";
  const typeColor = dangling ? PAL.dangling : PAL.typeColor[e.type];
  return `<div class="decl"><span class="dir">${dir}</span><span class="who">${esc(dir === "→" ? e.to : e.from)}</span><span style="color:${typeColor}">${TYPE_TEXT[e.type]}</span><span class="st" style="color:${dangling ? PAL.dangling : "#2e7d32"}">${STATE_TEXT[e.state]}</span></div>`;
}

function legendHtml(): string {
  const typeRows = (["command", "query", "viewquery"] as MsgType[]).map((t) => {
    const c = PAL.typeColor[t];
    const ds = DASH[t] || "solid";
    return `<div class="lg-row"><span class="sw-line" style="border-top:2px ${ds} ${c}"></span><span class="sw-arrow" style="color:${c}">${ARROW_GLYPH[t]}</span><span>${TYPE_TEXT[t]}</span></div>`;
  });
  const tierRows = (["entry", "feature", "domain", "infra"] as Tier[]).map(
    (t) => `<div class="lg-row"><span class="sw-node" style="border-color:${PAL.tierColor[t]}"></span><span>${t}</span></div>`
  );
  return `<div class="legend"><div class="lg-head">图例（点击类型/层级可显隐）</div><div class="lg-title">消息类型</div>${typeRows.join("")}<div class="lg-title">层级</div>${tierRows.join("")}<div class="lg-title">匹配状态</div><div class="lg-row"><span class="sw-dot" style="background:#555"></span><span>实线+箭头 = 已对齐通道</span></div><div class="lg-row"><span class="sw-dot" style="background:${PAL.dangling}"></span><span>琥珀虚线 = 悬空发送/订阅</span></div><div class="lg-row"><span class="sw-dot" style="background:${PAL.dangling}"></span><span>虚线边框 = 模块有悬空声明</span></div></div>`;
}

function toolbarHtml(crumbs: string[], activeBtns: string[]): string {
  const crumbHtml = crumbs
    .map(
      (c, i) =>
        `<span class="crumb${i === crumbs.length - 1 ? " current" : ""}">${esc(c)}</span>${i < crumbs.length - 1 ? '<span class="sep">›</span>' : ""}`
    )
    .join("");
  const btns = ["只看悬空", "高亮循环", "适应"]
    .map((b) => `<span class="tb${activeBtns.includes(b) ? " active" : ""}">${b}</span>`)
    .join("");
  return `<div class="toolbar">${crumbHtml}<span class="tsp"></span>${btns}</div>`;
}

function infobarHtml(text: string): string {
  return `<div class="infobar">${esc(text)}</div>`;
}

function section(title: string, note: string, body: string): string {
  return `<section><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ""}${body}</section>`;
}

function main(): void {
  const dataDir = path.join(process.cwd(), "data", "policies");
  const files = parsePolicyDir(dataDir);
  const filesPayload = matchChannels(files.policies, "files");
  const demoPayload = matchChannels(generateDemoPolicies(), "demo");
  const workspacePolicy = files.policies.find((p) => p.module === "workspace");

  const filesAll = new Set(filesPayload.nodes.map((n) => n.id));
  const overview = subgraph(filesPayload, filesAll, () => true);
  const focusWs = subgraph(filesPayload, new Set(["workspace"]), (e) => e.from === "workspace" || e.to === "workspace");
  const channel = subgraph(
    filesPayload,
    new Set(["workspace", "editor"]),
    (e) => e.id === "a|workspace|editor|command"
  );
  const danglingOnly = subgraph(
    filesPayload,
    new Set(["git", "logger", "app-shell", "settings"]),
    (e) => e.state !== "aligned"
  );
  const demoAll = new Set(demoPayload.nodes.map((n) => n.id));
  const demoOverview = subgraph(demoPayload, demoAll, () => true);

  const sendRows = filesPayload.edges
    .filter((e) => e.from === "workspace" && (e.state === "aligned" || e.state === "dangling-send"))
    .map((e) => declRowHtml("→", e))
    .join("");
  const recvRows = filesPayload.edges
    .filter((e) => e.to === "workspace" && (e.state === "aligned" || e.state === "dangling-receive"))
    .map((e) => declRowHtml("←", e))
    .join("");
  const wsPanel = `<div class="detail"><h3>workspace <span class="chip" style="color:${PAL.tierColor.feature}">feature</span></h3><p class="muted">${esc(workspacePolicy?.description ?? "")} · 度数 7</p><div class="lg-title">发送声明（4）</div>${sendRows}<div class="lg-title">接受声明（3）</div>${recvRows}<div class="btn">打开 policy 文件</div></div>`;

  const chPanel = `<div class="detail"><h3>workspace → editor</h3><p class="kv"><b>消息类型 </b><span class="chip" style="color:${PAL.typeColor.command}">command 写/触发</span></p><p class="kv"><b>匹配状态 </b><span style="color:#2e7d32">✓ 双方声明对齐，通道成立</span></p><p class="kv"><span style="color:${PAL.cycle}">⭮ 处在循环依赖上</span></p><div class="btn">聚焦发送方</div><div class="btn">聚焦接受方</div></div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>模块访问策略图 · 静态快照</title>
<style>
body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:13px;color:#24292f;background:#fff;margin:0;padding:20px 28px;max-width:1100px}
h1{font-size:20px}h2{font-size:16px;border-bottom:1px solid #d0d7de;padding-bottom:6px}
section{margin:26px 0}
.note{color:#57606a;margin:4px 0 10px}
.toolbar{display:flex;gap:8px;align-items:center;border:1px solid #d0d7de;border-radius:6px;padding:6px 10px;margin-bottom:8px;background:#f6f8fa}
.crumb{color:#0969da}.crumb.current{color:#24292f;font-weight:600}.sep{color:#8c959f}
.tsp{flex:1}.tb{border:1px solid #d0d7de;border-radius:4px;padding:2px 10px;background:#fff}.tb.active{background:#1f6feb;color:#fff;border-color:#1f6feb}
.legend{border:1px solid #d0d7de;border-radius:6px;padding:6px 12px;display:inline-block;margin:8px 0}
.lg-head{font-weight:600}.lg-title{font-weight:600;color:#57606a;margin-top:6px}.lg-row{display:flex;gap:8px;align-items:center;padding:2px 0}
.sw-line{width:24px;border-top:2px solid #333}.sw-arrow{font-size:9px}.sw-node{width:11px;height:11px;border-radius:50%;border:3px solid #333;display:inline-block}
.sw-dot{width:9px;height:9px;border-radius:50%;background:#555;display:inline-block}
.infobar{border:1px solid #d0d7de;border-radius:6px;padding:3px 10px;color:#57606a;margin-top:8px}
.detail{border:1px solid #d0d7de;border-radius:6px;padding:8px 14px;margin-top:10px;max-width:560px}
.detail h3{margin:4px 0}.chip{border:1px solid currentColor;border-radius:3px;font-size:10px;padding:0 5px}
.muted{color:#57606a}.kv{margin:4px 0}.kv b{font-weight:600}
.decl{display:flex;gap:8px;padding:3px 0;border-bottom:1px dashed #eee}
.decl .dir{font-weight:700}.decl .who{flex:1}.decl .st{font-size:12px}
.btn{display:inline-block;border:1px solid #d0d7de;border-radius:4px;padding:2px 10px;margin:8px 6px 0 0;background:#f6f8fa}
.grid{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.grid .svgwrap{flex:3;min-width:420px}.grid .detail{flex:2;margin-top:0}
</style></head>
<body>
<h1>模块访问策略图 · 静态审阅快照</h1>
<p class="note">由真实 policy 数据 + 同参 dagre 布局生成的静态副本（浅色主题取值）。你可以点击任何块（节点/边/按钮/图例行/面板行）写意见。悬停高亮、缩放骨架化、主题热切换等交互动效无法在静态页呈现，请 F5 实测；对"画什么"（布局、配色、线型、文案、面板内容）的意见在此精确定位。</p>
${toolbarHtml(["总览"], [])}
${legendHtml()}
${section("视图 1 · 文件数据总览（10 模块）", "层序 entry→infra 自上而下；箭头=消息流方向；对齐通道按类型着色，边文字默认不显示；两条琥珀虚线为悬空声明。", renderSvg(filesPayload, overview, { rankSep: 80, nodeSep: 50, edgeSep: 20, showAlignedLabels: false, cycleHl: false, baseOpacity: 0.9 }))}
${section("视图 2 · 聚焦 workspace（模块级）", "子图隔离后以宽松间距重排（rankSep 90 / nodeSep 55），仅保留该模块的相关关系；右侧为 policy 详情面板副本，行可点下钻。", `<div class="grid"><div class="svgwrap">${renderSvg(filesPayload, focusWs, { rankSep: 90, nodeSep: 55, edgeSep: 40, showAlignedLabels: true, cycleHl: false, baseOpacity: 0.9 })}</div>${wsPanel}</div>${toolbarHtml(["总览", "workspace"], [])}`)}
${section("视图 3 · 聚焦单条通道（workspace→editor command）", "点详情行后的通道级视图：画面只剩两端模块与这一条边；边文字显示消息类型。", `<div class="grid"><div class="svgwrap">${renderSvg(filesPayload, channel, { rankSep: 90, nodeSep: 55, edgeSep: 40, showAlignedLabels: true, cycleHl: false, baseOpacity: 1 })}</div>${chPanel}</div>${toolbarHtml(["总览", "workspace", "workspace→editor command"], [])}`)}
${section("视图 4 · 只看悬空", "工具栏「只看悬空」开启后的画面：仅保留悬空发送（git→logger query）与悬空订阅（app-shell→settings command）及其端点。", renderSvg(filesPayload, danglingOnly, { rankSep: 90, nodeSep: 55, edgeSep: 40, showAlignedLabels: true, cycleHl: false, baseOpacity: 1 }) + infobarHtml("策略文件 · 模块 10 · 对齐通道 20 · 悬空 2 · [只看悬空]"))}
${section("视图 5 · 高亮循环", "「高亮循环」开启：处在环上的已对齐通道以洋红色强调（workspace↔editor 两条），信息栏列出涉及模块。", renderSvg(filesPayload, overview, { rankSep: 80, nodeSep: 50, edgeSep: 20, showAlignedLabels: false, cycleHl: true, baseOpacity: 0.9 }) + infobarHtml("策略文件 · 模块 10 · 对齐通道 20 · 悬空 2 · [循环高亮] 2 条通道 · 涉及 editor, workspace"))}
${section("视图 6 · 100 模块演示总览", "确定性演示数据（217 对齐 / 11 悬空 / 19 循环通道）。真实页面中此规模下边默认 35% 透明度 + 缩小时文字按 min-zoomed-font-size 隐藏成结构骨架，静态图按等比缩放近似呈现；infra-01/infra-02 为枢纽（度数 10/11）。", renderSvg(demoPayload, demoOverview, { rankSep: 60, nodeSep: 35, edgeSep: 20, showAlignedLabels: false, cycleHl: false, baseOpacity: 0.35 }))}
</body></html>`;

  fs.writeFileSync(path.join(process.cwd(), "preview-graph.html"), html, "utf8");
  fs.writeFileSync(
    path.join(process.cwd(), "preview-payload.json"),
    JSON.stringify({ files: filesPayload, demo: demoPayload }),
    "utf8"
  );
  console.log("written preview-graph.html + preview-payload.json");
}

main();
