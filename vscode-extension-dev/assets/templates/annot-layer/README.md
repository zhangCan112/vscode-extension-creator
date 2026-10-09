# annot-layer（webview 预览批注层）

叠在实机预览活页上的自由批注层：真 UI 照常交互，开启批注模式后点哪钉哪；批注实时落盘，供代理逐条消化（批注-消化-审计闭环）。

## 接入（三步）

1. 启动收集服务（终端常驻）：

   ```
   node annot-server.mjs <数据目录> <端口>
   ```

2. 预览页里在 **bundle 之后**引入两个文件：

   ```html
   <link rel="stylesheet" href="annot-layer.css">
   <script src="annot-layer.js"></script>
   ```

3. 初始化（cytoscape 图页面 / 普通页面各一例）：

   ```js
   // 图页面：内置 cytoscape 适配器（画布锚定随缩放平移跟随 + 命中描述 + 视口快照）
   initAnnotLayer({
     endpoint: "http://127.0.0.1:6177",
     storageKey: "my-annot-pins",
     adapter: mpgCytoscapeAdapter(() => window.__myCy, "cy"),
     getContext: () => ({ view: "总览" }),
   });

   // 普通页面：省略 adapter，全部页面锚定 + DOM 命中描述
   initAnnotLayer({ endpoint: "http://127.0.0.1:6177" });
   ```

## 数据与消化（代理侧纪律）

- pending 收件箱：`<数据目录>/annotations.jsonl`，每行 `{ts,id,note,anchor,ctx,target,shot?}`
  - `target` = 命中描述（node/edge/DOM 元素+文本/画布空白）；`shot` = 落针时视口快照 `pin-<id>.png`
- **每条必须修复或明确解释，禁止静默丢弃**
- 消化后 ack：`POST /consume {"id":N,"fix":"改了什么"}` —— 条目移出 pending，审计追加进 `annotations-audit.jsonl`（`annotation_applied` + old/new）
- 回复用户对账清单（逐 id）；有新批注则重新循环

## 适配器契约（其他图库自己实现）

`ready()` / `token()`（实例标识，用于重建后重绑）/ `container` / `toModel(rx,ry)` / `toRendered(m)` / `describeAt(rx,ry)` / `snapshot()`，全部可选。
