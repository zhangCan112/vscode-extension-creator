# Tree views / Webviews / Status bar

## TreeView

### Manifest declaration

```json
"contributes": {
  "viewsContainers": {
    "activitybar": [
      { "id": "devCheatsheet", "title": "Dev Cheatsheet", "icon": "media/bar.svg" }
    ]
  },
  "views": {
    "devCheatsheet": [
      { "id": "devCheatsheetDocs", "name": "Docs" }
    ]
  }
}
```

- The activity-bar `icon` is a 24x24 SVG under `media/`, path relative to the extension root; **draw it in a single `stroke="currentColor"`** — hard-coded colors or multicolor SVGs stop following the light/dark theme (the template ships a placeholder `media/bar.svg`)
- The `views` key must equal the container's `id`

### Minimal TreeDataProvider

```ts
class DocsProvider implements vscode.TreeDataProvider<DocItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  getTreeItem(item: DocItem): vscode.TreeItem {
    return item;
  }

  getChildren(item?: DocItem): DocItem[] {
    if (item) { return item.children; }
    return [new DocItem("Commands", [new DocItem("registerCommand")])];
  }

  refresh(): void { this._onDidChange.fire(); }
}

class DocItem extends vscode.TreeItem {
  constructor(label: string, public children: DocItem[] = []) {
    super(label, children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.command = { command: "devCheatsheet.openDocs", title: "Open", arguments: [label] };
    this.iconPath = new vscode.ThemeIcon("book");
  }
}
```

Register (reach for `createTreeView` whenever you'll refresh or reveal — over `registerTreeDataProvider`):

```ts
const tree = vscode.window.createTreeView("devCheatsheetDocs", { treeDataProvider: new DocsProvider() });
context.subscriptions.push(tree);
```

Revealing a node after a search:

```ts
tree.reveal(target, { focus: true, select: true, expand: 2 })
    .then(undefined, e => logger.warn(e.message));   // Thenable has no .catch — this is the error hook
```

- `reveal` resolves the parent chain by itself; calling it right after firing the refresh event is fine — the way it works is **re-walking the provider's children** to locate the target, so the instances along the chain must already be in place (when nodes are rebuilt, finish rebuilding before firing the event). And **the target instance must be the same reference the provider's `getChildren` returns** — store the object-to-reveal in the provider's state before calling
- TS discriminated-union narrowing does not pierce a `this.filter` state field into a closure — copy it to a local `const` first

### Empty-state hints (viewWelcome)

```json
"viewsWelcome": [
  { "view": "devCheatsheetDocs", "contents": "No docs yet.\n[Add doc](command:devCheatsheet.addDoc)" }
]
```

With children present, viewWelcome stays hidden; links inside `contents` can only target commands. **The empty state must be reachable** — for a tree that is never empty, viewWelcome is dead config. It earns its keep only in real "filter has no results / no data source" scenarios; otherwise leave it out.

In-memory provider state does not survive a host restart — the tree falls back to empty/welcome, an acceptable default; to remember a filter across restarts, persist the condition in `context.workspaceState`.

## Status bar

```ts
const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
item.text = "$(book) Docs";
item.tooltip = "Open dev cheatsheet";
item.command = "devCheatsheet.openDocs";
item.show();
context.subscriptions.push(item);
```

Prefer inline `$(codicon)` over emoji. When it fails to appear, check priority and stray `hide()` calls.

## Webview (minimal safe sample)

```ts
const panel = vscode.window.createWebviewPanel(
  "devCheatsheet.doc",          // viewType (internal identifier)
  "Doc",                        // title
  vscode.ViewColumn.Beside,
  {
    enableScripts: true,        // only for message passing; keep false otherwise
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
  }
);

const nonce = crypto.randomUUID();
const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "doc.css"));

panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <button id="btn">Send</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById("btn").addEventListener("click", () => vscode.postMessage({ type: "ping" }));
  </script>
</body>
</html>`;

panel.webview.onDidReceiveMessage((msg) => {
  if (msg.type === "ping") { vscode.window.showInformationMessage("pong"); }
}, null, context.subscriptions);
```

Security points:

- CSP is mandatory; `script-src` under nonce only; `unsafe-inline` forbidden
- Styles / images go through `webview.asWebviewUri` + `cspSource` — never concatenated file-path strings
- `retainContextWhenHidden` defaults to false: keep state in `vscode.setState/getState`, never in live DOM
- Treat webview messages as **untrusted input**: validate type and fields before acting
- Render dynamic text with `textContent`; never concatenated `innerHTML`

## Webview engineering (real apps with JS libraries)

### Loading a bundled external script (CSP for libraries)

An inline `<script nonce>` suits a few lines of glue. Bringing in a graph library or any third-party JS means building a bundle first and loading it externally — **and the CSP must become `script-src ${cspSource}`** (nonce governs inline only; an external script under a nonce CSP gets blocked outright):

```ts
const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview.js"));
// CSP: script-src ${panel.webview.cspSource}
// HTML: <script src="${scriptUri}"></script>
```

### Dual bundles: two runtimes

Extension-host code (Node / cjs / external vscode) and webview code (browser / iife / everything bundled in) **must build as two separate bundles**:

```js
// esbuild.mjs — two option sets; watch mode starts two contexts for incremental builds
const host = { entryPoints: ["src/extension.ts"], bundle: true, format: "cjs", platform: "node", outfile: "dist/extension.js", external: ["vscode"] };
const web  = { entryPoints: ["src/graphView/main.ts"], bundle: true, format: "iife", platform: "browser", outfile: "dist/webview.js" };
```

- Protocol/type files shared by both bundles **must not import vscode** — they would never survive into the webview bundle
- A `.css` imported by the webview entry is emitted as a sibling css file by esbuild; reference it in the HTML via `asWebviewUri` (the CSP's `style-src ${cspSource}` covers it exactly like the JS)

### tsconfig split

Webview code needs the DOM lib; host code must not have it. A child `tsconfig.webview.json`: `extends` the main config + `lib` gains `DOM/DOM.Iterable` + `include` only the webview folder. **Trap: `extends` inherits the parent's `exclude`** (a parent that excludes the webview folder cancels the child's `include` — TS18003): override `"exclude": []` in the child. For the browser side add `module: "ESNext"` + `moduleResolution: "Bundler"` (the parent's Node16 works but mismatches esbuild semantics); importing `./x.css` in webview code needs a webview-side `declare module "*.css"` ambient declaration.

### The ready handshake (timing)

A webview loads asynchronously; a `postMessage` fired right after `createWebviewPanel` gets **lost**. Convention: the webview sends `ready` once its initialization completes; the host pushes data on receipt and replays current state (highlight, filter).

### Lifecycle

- **Singleton management**: a repeated command should `panel.reveal()` the existing panel, never rebuild
- Clear manager-held references in `onDidDispose`; a reopened panel re-runs the ready handshake + data replay
- `retainContextWhenHidden: true` preserves DOM/layout at the cost of memory; the default false + `setState/getState` is leaner — choose deliberately

### Theming

- Style exclusively with `--vscode-*` theme variables (the full foreground/background/border set); hard-coded colors are banned
- **Canvas rendering cannot consume CSS variables** (most graph libraries paint canvas): resolve values with `getComputedStyle(document.body).getPropertyValue("--vscode-xxx")`, then watch body's `data-vscode-theme-kind` attribute with a `MutationObserver` and hot-swap — theme switches without losing canvas state
- Mind the CSP when recoloring dynamically: `setAttribute("style", …)` gets blocked, but CSSOM writes (`el.style.color = …`) do not — hot-swap legend swatches with the latter

### Preview checkpoint (proactive, never wait for the user to ask)

When a webview reaches its **first runnable milestone** (canvas / page taking shape, running in the host), generate the live page per `references/webview-preview.md` and hand it to the user for review (attach the annotation layer when discussing UI), then continue polishing; **deliver again after major UI changes**. Do not save it all for the end — mid-course direction changes are cheaper than final rework. Pure command / tree-view tasks have no such checkpoint.
