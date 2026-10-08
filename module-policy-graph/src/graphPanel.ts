import * as vscode from "vscode";
import type { Graph } from "./model";
import { parseToHostMessage, type ToWebviewMessage } from "./graphView/protocol";

interface GraphPanelDeps {
  logger: vscode.LogOutputChannel;
  getGraph: () => Graph | undefined;
  requestDemo: () => void;
}

/**
 * 策略图 webview 面板管理器：
 * - 单例：重复调用入口命令时 reveal 已有面板
 * - retainContextWhenHidden：隐藏不销毁，保留布局 / 缩放 / 过滤状态
 * - webview 加载完成后发 ready，宿主再灌数据（覆盖意外重载的场景）
 */
export class GraphPanelManager {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly deps: GraphPanelDeps,
  ) {}

  revealOrCreate(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    // 打包产物从 extensionUri + joinPath 解析，禁止猜测路径
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel(
      "modulePolicies.graphView",
      "模块访问策略图",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distRoot],
      },
    );
    this.panel = panel;
    panel.webview.html = this.buildHtml(panel, distRoot);
    panel.webview.onDidReceiveMessage(
      (raw: unknown) => this.handleMessage(raw),
      undefined,
      this.context.subscriptions,
    );
    panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.deps.logger.info("策略图 panel 已关闭");
      },
      undefined,
      this.context.subscriptions,
    );
    this.deps.logger.info("策略图 panel 已创建");
  }

  /** 数据（重）加载后推送给图 */
  setGraph(graph: Graph): void {
    this.post({
      type: "graph",
      modules: graph.policies,
      channels: graph.channels,
    });
  }

  private post(message: ToWebviewMessage): void {
    const webview = this.panel?.webview;
    if (webview) {
      void webview.postMessage(message);
    }
  }

  private handleMessage(raw: unknown): void {
    // webview 消息当不可信输入，先校验再执行
    const msg = parseToHostMessage(raw);
    if (!msg) {
      this.deps.logger.warn(`策略图收到非法消息: ${JSON.stringify(raw)}`);
      return;
    }
    switch (msg.type) {
      case "ready": {
        const graph = this.deps.getGraph();
        if (graph) {
          this.setGraph(graph);
        }
        break;
      }
      case "requestDemo":
        this.deps.requestDemo();
        break;
      case "webviewError":
        this.deps.logger.error(`策略图 webview 异常: ${msg.message}`);
        break;
    }
  }

  private buildHtml(panel: vscode.WebviewPanel, distRoot: vscode.Uri): string {
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(distRoot, "webviewGraph.js"),
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(distRoot, "webviewGraph.css"),
    );
    const csp = panel.webview.cspSource;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; img-src ${csp} data:; script-src ${csp};">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="main">
  <div id="toolbar">
    <button id="cycleBtn" type="button" title="找出所有处于循环依赖中的已对齐通道">高亮循环依赖</button>
    <button id="danglingBtn" type="button" title="只看双方未对齐的悬空授权">仅看悬空授权</button>
    <button id="layoutBtn" type="button" title="重新执行分层布局">重新布局</button>
    <button id="demoBtn" type="button" title="生成 100 模块演示数据压测布局">100 模块演示</button>
  </div>
  <div id="crumb"></div>
  <div id="info"></div>
  <div id="cy"></div>
  <div id="legend"></div>
</div>
<aside id="side"></aside>
<script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
