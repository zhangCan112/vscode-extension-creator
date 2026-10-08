import * as vscode from "vscode";
import {
  Graph,
  RelationType,
  charById,
  loadGraph,
  otherId,
  relationIcon,
  relationsOf,
  shifuTag,
  RELATION_TYPES,
} from "./model";
import { Filter, GraphTreeProvider } from "./graphTree";
import { GraphPanelManager } from "./graphPanel";

interface SearchPick extends vscode.QuickPickItem {
  personId?: string;
  typeFilter?: RelationType;
  inert?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel("武侠人物关系图谱", { log: true });
  context.subscriptions.push(logger);
  logger.info("activated");

  let graph: Graph | undefined;

  const provider = new GraphTreeProvider();
  const treeView = vscode.window.createTreeView("wuxiaRelationsGraph", {
    treeDataProvider: provider,
  });
  context.subscriptions.push(treeView);

  const graphPanel = new GraphPanelManager(context, {
    logger,
    getGraph: () => graph,
  });

  const applyFilter = (filter: Filter): void => {
    provider.setFilter(filter);
    // 图 ↔ 树/搜索联动：QuickPick 选中或树下钻时，图中同步高亮该人物的邻域
    graphPanel.highlight(filter.kind === "person" ? filter.id : undefined);
    const root = provider.getRoots()[0];
    if (root) {
      treeView
        .reveal(root, { focus: true, select: true, expand: true })
        .then(undefined, (e) => logger.warn(`reveal 失败: ${e}`));
    }
  };

  const showDataError = (err: unknown): void => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`graph.json 加载失败: ${message}`);
    provider.setError(message);
    void vscode.window
      .showErrorMessage("人物关系数据加载失败", "查看日志")
      .then((btn) => {
        if (btn === "查看日志") {
          logger.show();
        }
      });
  };

  const load = async (): Promise<void> => {
    try {
      graph = await loadGraph(context.extensionUri);
      provider.setGraph(graph);
      graphPanel.setGraph(graph);
      logger.info(
        `graph 已加载：${graph.characters.length} 个人物 / ${graph.relations.length} 条关系`,
      );
    } catch (e) {
      showDataError(e);
    }
  };

  const buildSearchItems = (query: string): SearchPick[] => {
    if (!graph) {
      return [{ label: "$(error) 数据未加载", inert: true, alwaysShow: true }];
    }
    const g = graph;
    const q = query.trim();
    if (!q) {
      const items: SearchPick[] = g.characters.map((c) => ({
        label: `$(person) ${c.name}`,
        description: `${c.faction} · ${c.title}`,
        detail: `关系 ${relationsOf(g, c.id).length} 条`,
        personId: c.id,
      }));
      for (const t of RELATION_TYPES) {
        items.push({
          label: `$(${relationIcon(t)}) ${t}`,
          description: `共 ${g.relations.filter((r) => r.type === t).length} 对`,
          typeFilter: t,
        });
      }
      return items;
    }
    const items: SearchPick[] = [];
    for (const c of g.characters.filter((c) => c.name.includes(q))) {
      items.push({
        label: `$(person) ${c.name}`,
        description: `${c.faction} · ${c.title}`,
        detail: "回车在树中查看 TA 的全部关系",
        personId: c.id,
      });
      for (const r of relationsOf(g, c.id)) {
        const other = charById(g, otherId(r, c.id));
        items.push({
          label: `$(${relationIcon(r.type)}) ${r.type}${shifuTag(r, other.id)} · ${other.name}`,
          description: `来自 ${c.name}${r.status ? ` · ${r.status}` : ""}`,
          detail: r.note ?? "",
          personId: c.id,
        });
      }
    }
    for (const t of RELATION_TYPES.filter((t) => t.includes(q))) {
      for (const r of g.relations.filter((r) => r.type === t)) {
        const a = charById(g, r.source);
        const b = charById(g, r.target);
        items.push({
          label: `${a.name} ${r.status === "单方面" ? "→" : "⇄"} ${b.name}`,
          description: `${r.type}${r.status ? ` · ${r.status}` : ""}`,
          detail: r.note ?? "",
          typeFilter: t,
        });
      }
    }
    if (items.length === 0) {
      return [
        {
          label: "$(search) 无匹配结果",
          detail: "试试人名（如：李慕远）或关系类型（敌人 / 朋友 / 师徒 / 亲属 / 恋人）",
          inert: true,
          alwaysShow: true,
        },
      ];
    }
    return items;
  };

  const openSearch = (): void => {
    const qp = vscode.window.createQuickPick<SearchPick>();
    qp.placeholder = "输入人名（如：李慕远）或关系类型（如：敌人），输入即时过滤";
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.canSelectMany = false;
    qp.items = buildSearchItems("");
    qp.onDidChangeValue((value) => {
      qp.items = buildSearchItems(value);
    });
    qp.onDidAccept(() => {
      const picked = qp.activeItems[0];
      if (!picked || picked.inert) {
        return;
      }
      if (picked.personId) {
        applyFilter({ kind: "person", id: picked.personId });
      } else if (picked.typeFilter) {
        applyFilter({ kind: "type", type: picked.typeFilter });
      }
      qp.hide();
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("wuxiaRelations.search", () => openSearch()),
    vscode.commands.registerCommand("wuxiaRelations.openGraph", () => graphPanel.revealOrCreate()),
    vscode.commands.registerCommand("wuxiaRelations.refresh", () => void load()),
    vscode.commands.registerCommand("wuxiaRelations.clearFilter", () => {
      provider.setFilter({ kind: "all" });
      graphPanel.highlight(undefined);
    }),
    vscode.commands.registerCommand("wuxiaRelations.focusPerson", (...args: unknown[]) => {
      const id = args[0];
      if (typeof id !== "string") {
        logger.warn(`focusPerson 收到非法参数: ${JSON.stringify(args)}`);
        return;
      }
      applyFilter({ kind: "person", id });
    }),
  );

  void load();
}

export function deactivate() {}
