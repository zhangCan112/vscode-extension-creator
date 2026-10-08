// Host-side singleton manager for the relations graph webview panel.

import * as vscode from "vscode";
import { HostToGraphMessage, GraphToHostMessage, edgeIdOf } from "./graphView/protocol";
import { RelationIndex, relationKey } from "./model";
import { SearchPick } from "./search";

export interface FocusSets {
  nodeIds: string[];
  edgeIds: string[];
}

export function focusSetsForPick(index: RelationIndex, pick: SearchPick): FocusSets {
  switch (pick.kind) {
    case "deity": {
      const relations = index.relationsOf(pick.deityId);
      return {
        nodeIds: [pick.deityId, ...relations.map((r) => index.otherParty(r, pick.deityId))],
        edgeIds: relations.map(edgeIdOf)
      };
    }
    case "relation": {
      const relation = index.relations.find((r) => relationKey(r) === pick.key);
      if (!relation) {
        return { nodeIds: [pick.deityId], edgeIds: [] };
      }
      return { nodeIds: [relation.a, relation.b], edgeIds: [pick.key] };
    }
    case "pair":
      return { nodeIds: [pick.a, pick.b], edgeIds: [pick.key] };
  }
}

export class GraphPanel {
  private panel?: vscode.WebviewPanel;
  private lastFocus?: FocusSets;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: vscode.LogOutputChannel,
    private readonly getIndex: () => Promise<RelationIndex>
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("greekRelations.graph", "Greek Relations Graph", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")]
    });
    this.panel = panel;
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((msg: unknown) => this.onMessage(msg));
  }

  notifyFocus(sets: FocusSets): void {
    this.lastFocus = sets;
    this.post({ type: "focus", nodeIds: sets.nodeIds, edgeIds: sets.edgeIds });
  }

  clearFocus(): void {
    this.lastFocus = undefined;
    this.post({ type: "clearFocus" });
  }

  private post(msg: HostToGraphMessage): void {
    const panel = this.panel;
    if (panel) {
      void panel.webview.postMessage(msg);
    }
  }

  private onMessage(msg: unknown): void {
    if (!this.isGraphMessage(msg)) {
      this.logger.warn(`graph webview: unexpected message ${JSON.stringify(msg)}`);
      return;
    }
    switch (msg.type) {
      case "ready":
        this.onReady();
        break;
      case "selectDeity":
        // Reuse the existing command so the graph drills the tree exactly like a tree-item click.
        void vscode.commands.executeCommand("greekRelations.focusDeity", msg.deityId);
        break;
    }
  }

  private async onReady(): Promise<void> {
    try {
      const index = await this.getIndex();
      this.post({ type: "data", deities: index.deities, relations: index.relations });
      if (this.lastFocus) {
        this.post({ type: "focus", nodeIds: this.lastFocus.nodeIds, edgeIds: this.lastFocus.edgeIds });
      }
    } catch (e) {
      this.logger.error(`graph webview: failed to push data (${(e as Error).message})`);
    }
  }

  private isGraphMessage(v: unknown): v is GraphToHostMessage {
    return (
      typeof v === "object" &&
      v !== null &&
      ((v as Record<string, unknown>).type === "ready" ||
        ((v as Record<string, unknown>).type === "selectDeity" && typeof (v as Record<string, unknown>).deityId === "string"))
    );
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "graphView.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "graphView.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="graph"></div>
  <div id="legend" class="hidden"></div>
  <div id="hint" class="hidden">Click a node to focus it in the tree &middot; drag to arrange &middot; scroll to zoom</div>
  <div id="info" class="hidden"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
