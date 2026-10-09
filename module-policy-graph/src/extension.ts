import * as vscode from "vscode";
import { matchChannels } from "./policy/matcher";
import { parsePolicyDir } from "./policy/parser";
import { generateDemoPolicies } from "./policy/demo";
import { PolicyStore } from "./policyStore";
import type { GraphPayload, PolicyFile, Tier } from "./shared/model";
import { TIERS } from "./shared/model";

export const VIEW_ID = "modulePolicyGraphPolicies";

const TIER_LABEL: Record<Tier, string> = {
  entry: "入口层",
  feature: "特性层",
  domain: "领域层",
  infra: "基础设施层",
};

const TIER_ICON: Record<Tier, string> = {
  entry: "rocket",
  feature: "tools",
  domain: "database",
  infra: "gear",
};

type TreeEntry = TierNode | ModuleNode;

class TierNode extends vscode.TreeItem {
  constructor(public tier: Tier, count: number) {
    super(`${tier} · ${TIER_LABEL[tier]}`, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${count} 模块`;
    this.iconPath = new vscode.ThemeIcon(TIER_ICON[tier]);
  }
}

class ModuleNode extends vscode.TreeItem {
  constructor(p: PolicyFile, danglingCount: number) {
    super(p.module, vscode.TreeItemCollapsibleState.None);
    this.description =
      `发 ${p.send.length} · 收 ${p.receive.length}` + (danglingCount > 0 ? ` · 悬空 ${danglingCount}` : "");
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${p.module}**（${p.tier}）`);
    if (p.description) {
      tooltip.appendText(`\n\n${p.description}`);
    }
    tooltip.appendMarkdown(`\n\n发送声明 ${p.send.length} 条 / 接受声明 ${p.receive.length} 条`);
    if (danglingCount > 0) {
      tooltip.appendMarkdown(`\n\n⚠ 悬空声明 **${danglingCount}** 条`);
    }
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(danglingCount > 0 ? "warning" : "circle-outline");
    this.command = {
      command: "modulePolicyGraph.focusModule",
      title: "聚焦模块",
      arguments: [{ module: p.module }],
    };
  }
}

class PolicyTreeProvider implements vscode.TreeDataProvider<TreeEntry> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(
    private readonly store: PolicyStore,
    private readonly getPolicies: () => PolicyFile[]
  ) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: TreeEntry): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeEntry): TreeEntry[] {
    const policies = this.getPolicies();
    if (policies.length === 0) {
      // 空态交给 viewsWelcome（树必须真的能为空，欢迎页才可达）
      return [];
    }
    if (!element) {
      return TIERS.map((t) => new TierNode(t, policies.filter((p) => p.tier === t).length));
    }
    if (element instanceof TierNode) {
      const danglingById = new Map(this.store.payload.nodes.map((n) => [n.id, n.danglingCount]));
      return this.getPolicies()
        .filter((p) => p.tier === element.tier)
        .map((p) => new ModuleNode(p, danglingById.get(p.module) ?? 0));
    }
    return [];
  }
}

export class GraphWebviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private ready = false;
  private payload: GraphPayload | undefined;
  private pendingFocus: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: vscode.LogOutputChannel
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  show(payload: GraphPayload): void {
    this.payload = payload;
    this.pendingFocus = undefined;
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.pushLoad();
      return;
    }
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel(
      "modulePolicyGraph.graph",
      "模块访问策略图",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distUri],
      }
    );
    this.panel = panel;
    const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.css"));
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
    const csp = panel.webview.cspSource;
    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; script-src ${csp}; font-src ${csp}; img-src ${csp} data:;">
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
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
<script src="${scriptUri}"></script>
</body>
</html>`;
    panel.webview.onDidReceiveMessage(
      (msg: unknown) => {
        if (typeof msg !== "object" || msg === null) {
          return;
        }
        const type = (msg as { type?: unknown }).type;
        if (type === "ready") {
          this.ready = true;
          this.pushLoad();
          if (this.pendingFocus) {
            const focus = this.pendingFocus;
            this.pendingFocus = undefined;
            void this.panel?.webview.postMessage({ type: "focusModule", module: focus });
          }
        } else if (type === "openFile") {
          const module = (msg as { module?: unknown }).module;
          if (typeof module === "string" && /^[A-Za-z0-9._-]+$/.test(module)) {
            this.openPolicyFile(module);
          }
        }
      },
      null,
      this.context.subscriptions
    );
    panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.ready = false;
      },
      null,
      this.context.subscriptions
    );
  }

  /** 面板已打开时刷新数据；未打开则不强制弹出 */
  refreshIfOpen(payload: GraphPayload): void {
    if (!this.panel) {
      return;
    }
    this.payload = payload;
    this.pushLoad();
  }

  focusModule(moduleId: string, payload: GraphPayload): void {
    this.show(payload);
    if (this.ready) {
      void this.panel?.webview.postMessage({ type: "focusModule", module: moduleId });
    } else {
      this.pendingFocus = moduleId;
    }
  }

  private pushLoad(): void {
    if (this.ready && this.payload) {
      void this.panel?.webview.postMessage({ type: "load", payload: this.payload });
    }
  }

  private openPolicyFile(moduleId: string): void {
    if (this.payload?.source !== "files") {
      vscode.window.showInformationMessage("演示数据不落盘，无 policy 文件可打开");
      return;
    }
    const uri = vscode.Uri.joinPath(
      this.context.extensionUri,
      "data",
      "policies",
      `${moduleId}.policy.json`
    );
    vscode.workspace.openTextDocument(uri).then(
      (doc) => void vscode.window.showTextDocument(doc),
      (e) => {
        this.logger.warn(`打开 ${moduleId}.policy.json 失败: ${e.message}`);
        vscode.window.showWarningMessage(`打开 policy 文件失败: ${e.message}`);
      }
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = vscode.window.createOutputChannel("模块访问策略", { log: true });
  context.subscriptions.push(logger);
  logger.info("扩展激活");

  let currentPolicies: PolicyFile[] = [];
  const store = new PolicyStore();
  const tree = new PolicyTreeProvider(store, () => currentPolicies);
  const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: tree });
  context.subscriptions.push(treeView);
  store.onDidChange(() => tree.refresh(), null, context.subscriptions);

  const graph = new GraphWebviewManager(context, logger);
  const policiesDir = vscode.Uri.joinPath(context.extensionUri, "data", "policies").fsPath;

  const reportErrors = (errors: string[]): void => {
    for (const err of errors) {
      logger.error(err);
    }
    if (errors.length > 0) {
      vscode.window
        .showWarningMessage(`策略文件校验失败 ${errors.length} 处，详见日志`, "查看日志")
        .then((choice) => {
          if (choice === "查看日志") {
            logger.show();
          }
        });
    }
  };

  const summarize = (label: string, matched: ReturnType<typeof matchChannels>): void => {
    const aligned = matched.edges.filter((e) => e.state === "aligned").length;
    const dangling = matched.edges.length - aligned;
    logger.info(
      `${label}: ${matched.nodes.length} 模块, ${aligned} 条对齐通道, ${dangling} 条悬空, 循环通道 ${matched.cycleEdgeIds.length} 条（涉及 ${matched.cycleModules.length} 模块）`
    );
  };

  const loadFiles = (): void => {
    logger.info(`重载策略文件: ${policiesDir}`);
    const parsed = parsePolicyDir(policiesDir);
    currentPolicies = parsed.policies;
    const matched = matchChannels(parsed.policies, "files");
    store.set(matched, parsed.errors);
    reportErrors(parsed.errors);
    summarize("文件数据", matched);
    graph.refreshIfOpen(matched);
  };

  const loadDemo = (): void => {
    const policies = generateDemoPolicies();
    currentPolicies = policies;
    const matched = matchChannels(policies, "demo");
    store.set(matched, []);
    summarize("演示数据（确定性种子）", matched);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("modulePolicyGraph.openGraph", () => {
      if (store.payload.nodes.length === 0) {
        loadFiles();
      }
      graph.show(store.payload);
    }),
    vscode.commands.registerCommand("modulePolicyGraph.reloadPolicies", loadFiles),
    vscode.commands.registerCommand("modulePolicyGraph.generateDemo", () => {
      loadDemo();
      graph.show(store.payload);
      vscode.window.showInformationMessage(
        "已生成确定性 100 模块演示数据（不落盘）；执行「重载策略文件」可切回真实数据"
      );
    }),
    vscode.commands.registerCommand("modulePolicyGraph.focusModule", (...args: unknown[]) => {
      const arg = args[0];
      if (typeof arg !== "object" || arg === null || typeof (arg as { module?: unknown }).module !== "string") {
        logger.warn(`focusModule 收到非法参数: ${JSON.stringify(args)}`);
        return;
      }
      const moduleId = (arg as { module: string }).module;
      if (!store.payload.nodes.some((n) => n.id === moduleId)) {
        return;
      }
      graph.focusModule(moduleId, store.payload);
    })
  );

  loadFiles();
}

export function deactivate(): void {}
