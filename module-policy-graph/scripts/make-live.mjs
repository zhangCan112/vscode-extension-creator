// 组装实机预览页：真实 dist/webview.js + webview.css + 真实数据 + VS Code 主题变量注入。
// 产出两份：preview-live.html（干净活页，供截图）；preview-annot.html（带自由批注层，资产来自 skill annot-layer 模板）。
// node scripts/make-live.mjs
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const webviewJs = fs.readFileSync(path.join(root, "dist", "webview.js"), "utf8").replace(/<\/script>/gi, "<\\/script>");
const webviewCss = fs.readFileSync(path.join(root, "dist", "webview.css"), "utf8");
const payloads = fs.readFileSync(path.join(root, "preview-payload.json"), "utf8");
const annotJs = fs.readFileSync(path.join(root, "scripts", "annot-layer", "annot-layer.js"), "utf8");
const annotCss = fs.readFileSync(path.join(root, "scripts", "annot-layer", "annot-layer.css"), "utf8");

const themeVars = `
body.vscode-dark{
  --vscode-font-family:"Segoe UI",system-ui,sans-serif;
  --vscode-editor-background:#1e1e1e; --vscode-editor-foreground:#cccccc;
  --vscode-editorWidget-background:#252526; --vscode-sideBar-background:#252526;
  --vscode-panel-border:#3c3c3c; --vscode-list-hoverBackground:#2a2d2e;
  --vscode-textLink-foreground:#3794ff; --vscode-focusBorder:#007fd4;
  --vscode-button-secondaryBackground:#3a3d41; --vscode-button-secondaryForeground:#ffffff;
  --vscode-button-background:#0e639c; --vscode-button-foreground:#ffffff;
}
body.vscode-light{
  --vscode-font-family:"Segoe UI",system-ui,sans-serif;
  --vscode-editor-background:#ffffff; --vscode-editor-foreground:#3b3b3b;
  --vscode-editorWidget-background:#f8f8f8; --vscode-sideBar-background:#f8f8f8;
  --vscode-panel-border:#e5e5e5; --vscode-list-hoverBackground:#e8e8e8;
  --vscode-textLink-foreground:#005fb8; --vscode-focusBorder:#005fb8;
  --vscode-button-secondaryBackground:#e4e6f1; --vscode-button-secondaryForeground:#3b3b3b;
  --vscode-button-background:#005fb8; --vscode-button-foreground:#ffffff;
}
html,body{margin:0;height:100%}
`;

const shim = `
window.__ppErr = "";
window.__SHIM = 1;
window.addEventListener("error", (ev) => { window.__ppErr += ((ev.message || String(ev)) + " | ") + (ev.filename || "") + ":" + (ev.lineno || 0) + "\\n"; });
window.acquireVsCodeApi = function(){
  return { postMessage(){}, getState(){ return null; }, setState(){ return null; } };
};
`;

const driver = `
(async function(){
  try {
    const PP = window.__PP;
    const post = (m) => window.dispatchEvent(new MessageEvent("message", { data: m }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const kind = (location.hash.replace(/^#/, "") || "files");
    await sleep(150);
    post({ type: "load", payload: kind === "demo" ? PP.demo : PP.files });
    await sleep(700);
    if (kind === "light") {
      document.body.className = "vscode-light";
      document.body.dataset.vscodeThemeKind = "vscode-light";
    } else if (kind === "focus") {
      post({ type: "focusModule", module: "workspace" });
    } else if (kind === "channel") {
      post({ type: "focusModule", module: "workspace" });
      await sleep(500);
      const row = document.querySelector("#detail .decl");
      if (row) { row.click(); }
    } else if (kind === "dangling") {
      document.getElementById("btnDangling").click();
    } else if (kind === "cycle") {
      document.getElementById("btnCycle").click();
    }
    await sleep(900);
    window.__DRIVER_DONE = 1;
  } catch (e) {
    window.__ppErr += "driver: " + (e && e.stack ? e.stack : String(e));
  }
  document.title = "pp-ready";
})();
`;

const annotGlue = `
(function(){
  let curDemo = false;
  window.initAnnotLayer({
    endpoint: "http://127.0.0.1:6177",
    storageKey: "mpg-annot-pins",
    adapter: window.mpgCytoscapeAdapter(() => window.__mpgCy, "cy"),
    getContext: function(){
      const crumbs = (document.getElementById("crumbs") || {}).textContent || "";
      const infobar = ((document.getElementById("infobar") || {}).textContent || "").slice(0, 120);
      const theme = document.body.dataset.vscodeThemeKind || "";
      let zoom = null;
      try { zoom = +window.__mpgCy.zoom().toFixed(3); } catch (e) {}
      return { crumbs: crumbs, infobar: infobar, theme: theme, zoom: zoom };
    },
    extraButtons: [
      {
        label: "主题",
        onClick: function(){
          const light = document.body.classList.contains("vscode-light");
          document.body.className = light ? "vscode-dark" : "vscode-light";
          document.body.dataset.vscodeThemeKind = light ? "vscode-dark" : "vscode-light";
        }
      },
      {
        label: "切换数据",
        onClick: function(){
          curDemo = !curDemo;
          window.dispatchEvent(new MessageEvent("message", { data: { type: "load", payload: curDemo ? window.__PP.demo : window.__PP.files } }));
        }
      }
    ]
  });
})();
`;

function buildHtml(extraHead, extraBody){
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>模块访问策略图 · 实机预览</title>
<style>${themeVars}</style>
<style>${webviewCss}</style>
${extraHead}
</head>
<body class="vscode-dark" data-vscode-theme-kind="vscode-dark">
<div id="app">
  <header id="toolbar">
    <nav id="crumbs"></nav>
    <span class="spacer"></span>
    <button id="btnDangling" class="tb" type="button">只看悬空</button>
    <button id="btnCycle" class="tb" type="button">高亮循环</button>
    <button id="btnFit" class="tb" type="button">适应</button>
  </header>
  <div id="main">
    <div id="stage">
      <div id="cy"></div>
      <div id="legend"></div>
      <div id="infobar"></div>
    </div>
    <aside id="detail"></aside>
  </div>
</div>
<script>${shim}</script>
<script>${webviewJs}</script>
<script>window.__PP = ${payloads};</script>
<script>${driver}</script>
${extraBody}
</body>
</html>`;
}

fs.writeFileSync(path.join(root, "preview-live.html"), buildHtml("", ""), "utf8");
fs.writeFileSync(
  path.join(root, "preview-annot.html"),
  buildHtml(`<style>${annotCss}</style>`, `<script>${annotJs}</script>\n<script>${annotGlue}</script>`),
  "utf8"
);
console.log("written preview-live.html + preview-annot.html");
