# Webview Preview (discussing / annotating UI design with the user)

Bring the extension's webview page **as-is** into a browser for the user to view, discuss, and annotate. Read this before webview UI iteration, design reviews, or demos outside VS Code.

## When to use

- **Proactive delivery (default action, don't wait for the user to ask)**: when a webview task reaches its first runnable milestone (canvas/page taking shape), immediately generate the live page described here and hand it to the user for review; deliver again after major UI changes. Not applicable to pure command / tree-view tasks
- Discussing webview UI design with the user during iteration: hand over a live page that opens directly in a browser, or per-state screenshots fed into an annotation tool
- Presenting the extension page in reviews / reports
- Automated UI state verification (screenshot comparison)

## Principles

1. **Live build first**: the preview must run the real `dist/webview.js` + `dist/webview.css` + real data. Never hand-draw a "diagram / reconstruction" — users will read a reconstruction as a proposal, not the product (verified the hard way)
2. **Real interaction paths**: inject state via real message flow (the host→webview postMessage types) + real DOM clicks (buttons, panel rows); never call internal functions
3. State the boundary: static screenshots cannot carry motion (hover / zoom / animation / live theme switching) — say so when handing over

## The three pieces

### 1. Live page assembly (self-contained single html)

Fixed structure: theme vars → shim → bundle → payload → driver, all inlined:

```html
<style>
/* Two VS Code theme variable sets toggled by body class; the webview's MutationObserver
   hot-swap path works unchanged */
body.vscode-dark{ --vscode-editor-background:#1e1e1e; --vscode-editor-foreground:#cccccc; /* … */ }
body.vscode-light{ --vscode-editor-background:#ffffff; /* … */ }
</style>
<style>/* full dist/webview.css */</style>
<body class="vscode-dark" data-vscode-theme-kind="vscode-dark">…same structure as host-generated HTML…</body>
<script>/* shim: must be defined BEFORE the bundle */
window.__ppErr = "";
window.addEventListener("error", (ev) => { window.__ppErr += (ev.message || "") + "\n"; });
window.acquireVsCodeApi = () => ({ postMessage(){}, getState(){ return null; }, setState(){} });
</script>
<script>/* full dist/webview.js (globally replace </script> → <\/script> before inlining) */</script>
<script>window.__PP = /* real payload JSON computed by domain code */;</script>
<script>/* driver, see below */</script>
```

- Payload source: with vscode-free domain code, a node-side third bundle can `JSON.stringify` it to disk (see scaffold.md "third-bundle selftest" section)
- Leave a debug hook in the webview (e.g. `window.__mpgCy = cy` after `buildCy`) so external drivers can interoperate with the canvas

### 2. State driver (hash state machine + ready marker)

```js
(async function(){
  try {
    const post = (m) => window.dispatchEvent(new MessageEvent("message", { data: m }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const kind = location.hash.replace(/^#/, "") || "files";
    await sleep(150);
    post({ type: "load", payload: kind === "demo" ? PP.demo : PP.files }); // real host message
    await sleep(700);
    if (kind === "focus") { post({ type: "focusModule", module: "workspace" }); }
    else if (kind === "dangling") { document.getElementById("btnDangling").click(); } // real click
    /* …one branch per preset state… */
    await sleep(900);
  } catch (e) { window.__ppErr += "driver: " + (e && e.stack || e); }
  document.title = "pp-ready"; // MUST be set on completion — the only anchor external tools wait for
})();
```

### 3. Screenshots (playwright-core + system Edge, no browser download)

```js
import { chromium } from "playwright-core"; // npm i -D playwright-core
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto(`file:///…/preview-live.html#${state}`);
await page.waitForFunction(() => document.title === "pp-ready", null, { timeout: 20000 });
await page.screenshot({ path: `${name}.png` });
```

**Never screenshot via `msedge --headless=new --virtual-time-budget=…` alone**: new headless ignores that flag and captures before the driver's timers run. Symptom: every PNG has the exact same byte size (all blank). Debug order: read the `window.__ppErr` / `document.title` probes to confirm the driver ran, then check rendering.

## Annotation loop (free-form annotation on the live page)

The live page can carry a free-form annotation layer directly: the real UI stays fully interactive; with annotate mode on, click anywhere to drop a pin, and notes land on disk in real time for the agent to consume item by item. Asset: `assets/templates/annot-layer/` (annot-layer.js / annot-layer.css / annot-server.mjs; three wiring steps in its README).

### Capture side (the root of accurate consumption)

- **Interception must happen at `pointerdown` (capture), never at `click`** — graph libraries synthesize tap/drag from mousedown/mouseup; by the time click arrives the library has already focused/refit/rescaled the canvas and the pin coordinates are garbage (hit in the field). Swallow residual clicks; let the layer's own UI (toolbar/popup/pins/list) through
- Every note carries four elements: **coordinate anchor** (in-graph = model coordinates, following pan/zoom; otherwise = page coordinates) + **hit description** (node/edge/DOM element + text excerpt) + **viewport snapshot** `pin-<id>.png` + **view context** (breadcrumb/infobar/theme/zoom)
- Decide "in-graph" via `elementFromPoint` hitting a CANVAS — legends/infobars overlay the canvas; geometric range checks misclassify them as canvas clicks
- Adapter contract (all optional): `ready / token / container / toModel / toRendered / describeAt / snapshot`; a cytoscape adapter is built in, with token-polling rebinding after graph instance rebuilds; no adapter = page-anchor fallback, works for any webview

### Consume side (discipline)

- pending inbox = `annotations.jsonl` (`id/target/note/anchor/ctx/shot`)
- **Every note must be fixed or explicitly explained — silent drops forbidden**
- ack = `POST /consume {id, fix}`: the entry moves out of pending and an audit record is appended to `annotations-audit.jsonl` (`annotation_applied` + old/new)
- Reply with a per-id reconciliation list; new annotations restart the loop

## Working with annotation tools

- Most annotation/review tools strip scripts at intake — **a live page cannot enter their documents**. Instead: feed per-state screenshots (png) as intake image blocks for block-level annotations; hand the live page to the user separately for free interaction
- The annotation layer depends on no external service: the file is the source of truth; `/consume` auditing keeps every consumed note traceable

## Ground rules

- Read/write Chinese-containing generated files with node (or an editor) only; PowerShell 5.1 re-writes BOM-less UTF-8 as ANSI and corrupts the encoding
- Preview artifacts (`preview-*.html` / payload json / shots dir) go into the project `.gitignore`; generator scripts (`scripts/make-live.mjs`, `shoot.mjs`) stay in the repo
- Before screenshotting, assert state took effect via DOM checks (breadcrumb text, infobar text, panel display, body theme kind) — never trust file sizes alone
- When verifying pin anchoring or graph rendering, never read positions synchronously — rendering goes through rAF; wait before asserting
- Clear test residue (pending file and pin-*.png) before consuming annotations, or stale data will mislead you
