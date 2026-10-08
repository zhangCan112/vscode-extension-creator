import * as vscode from "vscode";
import { DeityNode, DeityTreeProvider, RelationNode } from "./deityTree";
import { GraphPanel, focusSetsForPick } from "./graphPanel";
import { RelationIndex, loadRelationIndex } from "./model";
import { SearchPick, openSearch } from "./search";

export function activate(context: vscode.ExtensionContext): void {
  const logger = vscode.window.createOutputChannel("Greek Relations", { log: true });
  context.subscriptions.push(logger);

  const provider = new DeityTreeProvider();
  const treeView = vscode.window.createTreeView<DeityNode | RelationNode>("greekRelationsTree", { treeDataProvider: provider });
  context.subscriptions.push(treeView);

  let indexPromise: Promise<RelationIndex> | undefined;
  const index = (): Promise<RelationIndex> => {
    indexPromise ??= loadRelationIndex(context.extensionUri);
    return indexPromise;
  };
  let currentIndex: RelationIndex | undefined;

  const graph = new GraphPanel(context.extensionUri, logger, index);

  const reveal = (target: DeityNode | RelationNode | undefined): void => {
    if (!target) {
      logger.warn("reveal skipped: node not found");
      return;
    }
    treeView.reveal(target, { focus: true, select: true, expand: 2 }).then(
      undefined,
      (e: unknown) => logger.warn(`reveal failed: ${(e as Error).message}`)
    );
  };

  const applyPick = (pick: SearchPick): void => {
    switch (pick.kind) {
      case "deity":
        provider.focusDeities([pick.deityId]);
        reveal(provider.nodeForDeity(pick.deityId));
        break;
      case "relation":
        provider.focusDeities([pick.deityId]);
        reveal(provider.nodeForRelation(pick.key) ?? provider.nodeForDeity(pick.deityId));
        break;
      case "pair":
        provider.focusDeities([pick.a, pick.b]);
        reveal(provider.nodeForRelation(pick.key) ?? provider.nodeForDeity(pick.a));
        break;
    }
    if (currentIndex) {
      graph.notifyFocus(focusSetsForPick(currentIndex, pick));
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("greekRelations.search", async () => {
      try {
        openSearch(await index(), applyPick);
        logger.info("search opened");
      } catch (e) {
        const msg = `Greek Relations: failed to load data (${(e as Error).message})`;
        logger.error(msg);
        void vscode.window.showErrorMessage(msg);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("greekRelations.openGraph", () => {
      graph.open();
      logger.info("graph opened");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("greekRelations.focusDeity", (...args: unknown[]) => {
      const id = args[0];
      if (typeof id !== "string") {
        logger.warn(`focusDeity: bad argument ${JSON.stringify(args)}`);
        return;
      }
      provider.focusDeities([id]);
      reveal(provider.nodeForDeity(id));
      if (currentIndex) {
        graph.notifyFocus(focusSetsForPick(currentIndex, { kind: "deity", deityId: id }));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("greekRelations.clearFilter", () => {
      provider.clearFocus();
      graph.clearFocus();
      logger.info("focus cleared");
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand("greekRelations.openLog", () => logger.show()));

  void index().then(
    (idx) => {
      currentIndex = idx;
      provider.setData(idx);
      logger.info(`loaded ${idx.data.deities.length} deities, ${idx.data.relations.length} relations`);
    },
    (e: unknown) => logger.error(`failed to load data: ${(e as Error).message}`)
  );

  logger.info("activated");
}

export function deactivate(): void {}
