import * as vscode from "vscode";
import type { Graph } from "./model";
import { parseToHostMessage, type ToWebviewMessage } from "./graphView/protocol";

interface GraphPanelDeps {
  logger: vscode.LogOutputChannel;
  getGraph: () => Graph | undefined;
}

/**
 * 关系图 webview 面板管理器：
 * - 单例：重复调用入口命令时 reveal 已有面板，不重复创建
 * - retainContextWhenHidden：隐藏不销毁，保留力导向布局 / 缩放 / 平移状态
 * - webview 加载完成后发 ready，宿主再灌数据与当前高亮（覆盖意外重载的场景）
 */
export class GraphPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private lastHighlight: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly deps: GraphPanelDeps,
  ) {}

  revealOrCreate(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    // 硬规则 3：打包产物从 extensionUri + joinPath 解析，禁止猜测路径
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel(
      "wuxiaRelations.graphView",
      "武侠人物关系图谱",
      vscode.ViewColumn.Beside,
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
        this.deps.logger.info("关系图 panel 已关闭");
      },
      undefined,
      this.context.subscriptions,
    );
    this.deps.logger.info("关系图 panel 已创建");
  }

  /** 数据（重）加载后推送给图 */
  setGraph(graph: Graph): void {
    this.post({
      type: "graph",
      characters: graph.characters,
      relations: graph.relations,
    });
  }

  /** personId 为空表示清除高亮 */
  highlight(personId: string | undefined): void {
    this.lastHighlight = personId;
    this.post(personId ? { type: "highlight", personId } : { type: "clearHighlight" });
  }

  private post(message: ToWebviewMessage): void {
    const webview = this.panel?.webview;
    if (webview) {
      void webview.postMessage(message);
    }
  }

  private handleMessage(raw: unknown): void {
    // skill 硬规则：webview 消息当不可信输入，先校验再执行
    const msg = parseToHostMessage(raw);
    if (!msg) {
      this.deps.logger.warn(`关系图收到非法消息: ${JSON.stringify(raw)}`);
      return;
    }
    switch (msg.type) {
      case "ready": {
        const graph = this.deps.getGraph();
        if (graph) {
          this.setGraph(graph);
        }
        if (this.lastHighlight) {
          this.post({ type: "highlight", personId: this.lastHighlight });
        }
        break;
      }
      case "selectPerson": {
        const graph = this.deps.getGraph();
        if (!graph || !graph.characters.some((c) => c.id === msg.personId)) {
          this.deps.logger.warn(`关系图 selectPerson 引用未知人物: ${msg.personId}`);
          return;
        }
        // 复用既有 focusPerson：树下钻 + 联动高亮走同一条路径
        void vscode.commands.executeCommand("wuxiaRelations.focusPerson", msg.personId);
        break;
      }
      case "webviewError":
        this.deps.logger.error(`关系图 webview 异常: ${msg.message}`);
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
<div id="info"></div>
<div id="cy"></div>
<div id="legend"></div>
<script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
