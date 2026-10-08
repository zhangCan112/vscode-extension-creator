# 树视图 / Webview / 状态栏

## TreeView（侧边栏树）

### manifest 声明

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

- activitybar 的 `icon` 必须是 24x24 SVG，放 `media/`，路径相对扩展根目录；**用 `stroke="currentColor"` 单色绘制**，禁止写死色值或多色，否则不跟随明暗主题（模板已带占位 `media/bar.svg`）
- `views` 的 key 必须等于 container 的 `id`

### 最小 TreeDataProvider

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

注册（要刷新 / reveal 能力就用 `createTreeView`，不要用 `registerTreeDataProvider`）：

```ts
const tree = vscode.window.createTreeView("devCheatsheetDocs", { treeDataProvider: new DocsProvider() });
context.subscriptions.push(tree);
```

搜索后聚焦某个节点：

```ts
tree.reveal(target, { focus: true, select: true, expand: 2 })
    .then(undefined, e => logger.warn(e.message));   // Thenable 没有 .catch，只能这样接错
```

- `reveal` 自驱解析父链，fire 刷新事件后可直接调用；但**目标元素实例必须与 provider `getChildren` 返回的是同一引用**——在 provider 的状态里存住要 reveal 的对象再调
- TS 判别式收窄不穿透 `this.filter` 这类状态字段进闭包——进闭包前先取局部 `const`

### 空状态提示（viewWelcome）

```json
"viewsWelcome": [
  { "view": "devCheatsheetDocs", "contents": "No docs yet.\n[Add doc](command:devCheatsheet.addDoc)" }
]
```

注意：有 children 时 viewWelcome 不显示；`contents` 里链接只能指向命令。**空状态必须可达**——树永远非空时 viewWelcome 是死配置，它只在「过滤无结果 / 无数据源」这类真实场景才有意义，否则别配。

## 状态栏

```ts
const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
item.text = "$(book) Docs";
item.tooltip = "Open dev cheatsheet";
item.command = "devCheatsheet.openDocs";
item.show();
context.subscriptions.push(item);
```

优先用 `$(codicon)` 内联图标而不是 emoji；不显示时检查 priority 和 `hide()` 调用。

## Webview（最小安全样例）

```ts
const panel = vscode.window.createWebviewPanel(
  "devCheatsheet.doc",          // viewType（内部标识）
  "Doc",                        // 标题
  vscode.ViewColumn.Beside,
  {
    enableScripts: true,        // 需要消息通信才开，否则保持 false
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

安全要点：

- CSP 必须有；`script-src` 只允许 nonce；禁止 `unsafe-inline`
- 样式 / 图片走 `webview.asWebviewUri` + `cspSource`，不拼文件路径字符串
- `retainContextWhenHidden` 默认 false，状态放 `vscode.setState/getState` 而不是依赖 DOM 存活
- 把 webview 消息当**不可信输入**处理：校验 type 和字段再执行
- 渲染动态文本用 `textContent`，禁止拼 `innerHTML`

## Webview 工程化（引入 JS 库 / 真实应用）

### 外链打包脚本（上 JS 库的 CSP 写法）

内联 `<script nonce>` 只适合几行胶水代码；引入图库等第三方 JS 先构建成 bundle 再外链加载，**CSP 必须改为 `script-src ${cspSource}`**（nonce 只管内联，外链脚本用 nonce 会被直接拦截）：

```ts
const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview.js"));
// CSP: script-src ${panel.webview.cspSource}
// HTML: <script src="${scriptUri}"></script>
```

### 双 bundle：两个运行环境

扩展宿主代码（Node / cjs / external vscode）和 webview 代码（浏览器 / iife / 依赖全部打入）**必须分成两个 bundle**：

```js
// esbuild.mjs —— 两份 options，watch 模式起两个 context 同步增量编译
const host = { entryPoints: ["src/extension.ts"], bundle: true, format: "cjs", platform: "node", outfile: "dist/extension.js", external: ["vscode"] };
const web  = { entryPoints: ["src/graphView/main.ts"], bundle: true, format: "iife", platform: "browser", outfile: "dist/webview.js" };
```

- 两个 bundle 共享的协议/类型文件**禁止 import vscode**，否则进不了 webview bundle
- webview 入口 import 的 `.css` 由 esbuild 旁路产出同名 css 文件，HTML 里经 `asWebviewUri` 引用

### tsconfig 拆分

webview 代码需要 DOM lib，宿主代码不要。子配置 `tsconfig.webview.json`：`extends` 主配置 + `lib` 加 `DOM/DOM.Iterable` + `include` 只收 webview 目录。**坑：`extends` 会继承主配置的 `exclude`**（若主配置恰好排除了 webview 目录，会抵消本文件的 include，报 TS18003）——子配置显式覆写 `"exclude": []`。

### ready 握手（时序）

webview 加载是异步的，宿主创建 panel 后立刻 `postMessage` 会**丢消息**。约定：webview 初始化完成后先发 `ready`，宿主收到再灌数据，并重放当前状态（如高亮/过滤）。

### 生命周期

- **单例管理**：重复触发命令应 `panel.reveal()` 复用现有面板，不要重建
- `onDidDispose` 清掉管理器持有的引用；面板关闭后重开要走一遍 ready 握手 + 数据重放
- `retainContextWhenHidden: true` 保住 DOM/布局但占内存；默认 false + `setState/getState` 更省，按需取舍

### 主题适配

- CSS 全部用 `--vscode-*` 主题变量（前景/背景/边框整套），不写死颜色
- **canvas 渲染吃不到 CSS 变量**（图库大多画 canvas）：用 `getComputedStyle(document.body).getPropertyValue("--vscode-xxx")` 取值，再 `MutationObserver` 监听 body 的 `data-vscode-theme-kind` 属性变化热替换（主题切换不丢画布状态）
