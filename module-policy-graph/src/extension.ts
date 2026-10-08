import * as vscode from "vscode";
import { Graph, loadPolicies } from "./model";
import { generateLargeDemoGraph } from "./demo";
import { GraphPanelManager } from "./graphPanel";

export function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel("模块访问策略图", { log: true });
  context.subscriptions.push(logger);
  logger.info("activated");

  let graph: Graph | undefined;

  const loadDemo = (): void => {
    graph = generateLargeDemoGraph(100);
    graphPanel.setGraph(graph);
    logger.info(
      `演示图已加载：${graph.policies.length} 个模块 / ${graph.channels.length} 条通道`,
    );
  };

  const graphPanel = new GraphPanelManager(context, {
    logger,
    getGraph: () => graph,
    requestDemo: loadDemo,
  });

  // 侧边栏视图：内容就是欢迎页（打开大图 / 重载），树本身为空
  const emptyTree = new class implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
      return element;
    }
    getChildren(): vscode.TreeItem[] {
      return [];
    }
  }();
  context.subscriptions.push(
    vscode.window.createTreeView("modulePolicies.overview", { treeDataProvider: emptyTree }),
  );

  const load = async (): Promise<void> => {
    try {
      graph = await loadPolicies(context.extensionUri);
      graphPanel.setGraph(graph);
      logger.info(
        `policies 已加载：${graph.policies.length} 个模块 / ${graph.channels.length} 条通道`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`policy 加载失败: ${message}`);
      void vscode.window
        .showErrorMessage(`模块策略加载失败：${message}`, "查看日志")
        .then((btn) => {
          if (btn === "查看日志") {
            logger.show();
          }
        });
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("modulePolicies.openGraph", () => graphPanel.revealOrCreate()),
    vscode.commands.registerCommand("modulePolicies.refresh", () => void load()),
    vscode.commands.registerCommand("modulePolicies.demoLarge", () => loadDemo()),
  );

  void load();
}

export function deactivate() {}
