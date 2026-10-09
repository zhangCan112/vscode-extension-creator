# Webview 预览（与用户讨论 / 批注 UI 设计）

把扩展的 webview 页面**原样**搬到浏览器里给用户看、讨论、批注。做 webview UI 迭代、设计评审、无 VS Code 环境演示前先读本文。

## 何时使用

- **主动交付（默认动作，不等用户开口）**：webview 任务达到首个可运行里程碑（画布/页面成形）时，立即生成本文所述实机活页交给用户 review，重大 UI 改动后再给一版；纯命令 / 树视图任务不适用
- webview UI 迭代期间要和用户讨论设计：给可直接打开的实机活页，或逐状态截图喂给批注工具
- 汇报 / 评审时展示扩展页面
- UI 状态的自动化核对（截图对照）

## 原则

1. **实机优先**：预览必须运行真正的 `dist/webview.js` + `dist/webview.css` + 真实数据。绝不手绘"示意图 / 重建版"——用户会把重建版当成方案而不是产品，此坑实测踩过
2. **走真实交互路径**：状态注入用真实消息流（host→webview 的 postMessage 消息类型）+ 真实 DOM 点击（按钮、面板行），不调用内部函数
3. 说明边界：静态截图承载不了动效（悬停 / 缩放 / 动画 / 主题热切换过程），交给用户时明说

## 三件套

### 1. 活页组装（自包含单 html）

结构固定：主题变量 → shim → bundle → payload → 驱动脚本，全部内联：

```html
<style>
/* 两套 VS Code 主题变量，body class 切换；webview 的 MutationObserver 热替换路径原样可用 */
body.vscode-dark{ --vscode-editor-background:#1e1e1e; --vscode-editor-foreground:#cccccc; /* … */ }
body.vscode-light{ --vscode-editor-background:#ffffff; /* … */ }
</style>
<style>/* dist/webview.css 全文 */</style>
<body class="vscode-dark" data-vscode-theme-kind="vscode-dark">…与宿主生成的 HTML 同构…</body>
<script>/* shim：必须在 bundle 前定义 */
window.__ppErr = "";
window.addEventListener("error", (ev) => { window.__ppErr += (ev.message || "") + "\n"; });
window.acquireVsCodeApi = () => ({ postMessage(){}, getState(){ return null; }, setState(){} });
</script>
<script>/* dist/webview.js 全文（内联前先全局替换 </script> → <\/script>）*/</script>
<script>window.__PP = /* 领域代码算出的真实 payload JSON */;</script>
<script>/* driver，见下 */</script>
```

- payload 来源：领域代码 vscode-free 时用 node 侧第三 bundle 直接 `JSON.stringify` 落盘（做法见 scaffold.md「第三 bundle 自验」节）
- webview 侧留调试钩子（如 `buildCy` 后 `window.__mpgCy = cy`），外部驱动才能与画布联动

### 2. 状态驱动（hash 状态机 + ready 标记）

```js
(async function(){
  try {
    const post = (m) => window.dispatchEvent(new MessageEvent("message", { data: m }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const kind = location.hash.replace(/^#/, "") || "files";
    await sleep(150);
    post({ type: "load", payload: kind === "demo" ? PP.demo : PP.files }); // 真实宿主消息
    await sleep(700);
    if (kind === "focus") { post({ type: "focusModule", module: "workspace" }); }
    else if (kind === "dangling") { document.getElementById("btnDangling").click(); } // 真实点击
    /* …每个预置状态一个分支… */
    await sleep(900);
  } catch (e) { window.__ppErr += "driver: " + (e && e.stack || e); }
  document.title = "pp-ready"; // 完成必设——外部工具等待的唯一锚点
})();
```

### 3. 截图（playwright-core + 系统 Edge，无浏览器下载）

```js
import { chromium } from "playwright-core"; // npm i -D playwright-core
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto(`file:///…/preview-live.html#${state}`);
await page.waitForFunction(() => document.title === "pp-ready", null, { timeout: 20000 });
await page.screenshot({ path: `${name}.png` });
```

**禁用 `msedge --headless=new --virtual-time-budget=…` 直接截图**：新无头模式忽略该参数，截图发生在驱动脚本定时器执行之前。症状识别：所有 PNG 字节数完全相同（全空白）。排查顺序：先读 `window.__ppErr` / `document.title` 探针确认 driver 是否执行，再查渲染。

## 批注闭环（活页自由批注）

活页可直接叠自由批注层：真 UI 照常交互，开启批注模式后点哪钉哪，意见实时落盘供代理逐条消化。资产：`assets/templates/annot-layer/`（annot-layer.js / annot-layer.css / annot-server.mjs，接线三步见其 README）。

### 捕获端（保消化精度的根）

- **拦截点必须在 `pointerdown`（capture），不能拦 `click`**——图库的 tap/拖拽由 mousedown/mouseup 合成，click 到达前图库已完成聚焦/重排/画布缩放，落针拿到的坐标全废（真实踩坑）；残余 click 一并吞掉，自身 UI（工具条/弹窗/针脚/列表）放行
- 每条批注四要素：**坐标锚**（图内=模型坐标，随缩放平移跟随；非图=页面坐标）+ **命中描述**（节点/边/DOM 元素+文本摘录）+ **视口快照** `pin-<id>.png` + **视图上下文**（面包屑/信息栏/主题/缩放）
- 图内判定用 `elementFromPoint` 命中的是否 CANVAS——图例/信息栏等覆盖层盖在画布上，按几何范围判会误归为画布锚
- 适配器契约（全部可选）：`ready / token / container / toModel / toRendered / describeAt / snapshot`；内置 cytoscape 适配器，图实例重建后靠 token 轮询重绑 pan/zoom；无适配器=页面锚定兜底，任何 webview 可用

### 消化端（消化纪律）

- pending 收件箱 = `annotations.jsonl`（`id/target/note/anchor/ctx/shot`）
- **每条必须修复或明确解释，禁止静默丢弃**
- ack = `POST /consume {id, fix}`：条目移出 pending，审计追加进 `annotations-audit.jsonl`（`annotation_applied` + old/new）
- 回复用户对账清单（逐 id → 改了什么）；有新批注则重新循环

## 与批注工具协作

- 多数批注/评审工具在 intake 阶段剥离 script——**活页进不了它们的文档**。做法：状态截图（png）作为 intake 图片块，承载块级批注；活页另行交给用户自由交互
- 批注层不依赖任何外部服务：文件即真相源，`/consume` 审计保证每条消化可追溯

## 落地要点

- 含中文的生成文件一律用 node（或编辑器）读写；PowerShell 5.1 对无 BOM UTF-8 做读-改-写会按 ANSI 重写，直接损坏编码
- 预览产物（`preview-*.html` / payload json / shots 目录）进项目 `.gitignore`；生成脚本（`scripts/make-live.mjs`、`shoot.mjs`）随仓库
- 截图前用 DOM 断言自证状态生效（面包屑文本、infobar 文本、面板 display、body 主题 kind），别只看字节数
- 验证批注锚定/图渲染别在同步代码里读数——渲染走 rAF，等待后再断言
- 消费批注前先清测试残留（pending 与 pin-*.png），否则读到旧数据误判
