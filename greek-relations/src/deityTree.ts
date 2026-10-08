import * as vscode from "vscode";
import { RELATION_TYPES, RelationIndex, relationKey } from "./model";
import { Deity, Relation } from "./types";

export class DeityNode extends vscode.TreeItem {
  constructor(readonly deity: Deity, readonly relationNodes: RelationNode[]) {
    super(deity.name, vscode.TreeItemCollapsibleState.Expanded);
    this.description = deity.title;
    this.tooltip = `${deity.name} — ${deity.title}\nDomain: ${deity.domain}`;
    this.iconPath = new vscode.ThemeIcon("person");
    this.command = { command: "greekRelations.focusDeity", title: "Focus", arguments: [deity.id] };
  }
}

export class RelationNode extends vscode.TreeItem {
  constructor(readonly relation: Relation, otherName: string, labelWord: string, parentName: string, readonly otherId: string) {
    super(otherName, vscode.TreeItemCollapsibleState.None);
    this.description = labelWord + (relation.status ? ` · ${relation.status}` : "");
    const lines = [`${otherName} — ${labelWord} of ${parentName}`];
    if (relation.status) {
      lines.push(`Status: ${relation.status}`);
    }
    if (relation.note) {
      lines.push(`Note: ${relation.note}`);
    }
    this.tooltip = lines.join("\n");
    this.iconPath = new vscode.ThemeIcon(RELATION_TYPES[relation.type].icon);
    this.command = { command: "greekRelations.focusDeity", title: "Focus", arguments: [otherId] };
  }
}

export type TreeNode = DeityNode | RelationNode;

export class DeityTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private index?: RelationIndex;
  private focusIds: readonly string[] = [];
  private roots: DeityNode[] = [];
  private readonly deityNodes = new Map<string, DeityNode>();
  private readonly relationNodes = new Map<string, RelationNode>();

  setData(index: RelationIndex): void {
    this.index = index;
    this.rebuild();
    this._onDidChangeTreeData.fire();
  }

  focusDeities(ids: readonly string[]): void {
    this.focusIds = ids;
    this.rebuild();
    this._onDidChangeTreeData.fire();
  }

  clearFocus(): void {
    this.focusIds = [];
    this.rebuild();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.roots;
    }
    if (element instanceof DeityNode) {
      return element.relationNodes;
    }
    return [];
  }

  nodeForDeity(id: string): DeityNode | undefined {
    return this.deityNodes.get(id);
  }

  nodeForRelation(key: string): RelationNode | undefined {
    return this.relationNodes.get(key);
  }

  private rebuild(): void {
    this.deityNodes.clear();
    this.relationNodes.clear();
    const index = this.index;
    const focused = this.focusIds;
    if (!index || focused.length === 0) {
      this.roots = [];
      return;
    }
    this.roots = focused
      .map((id) => index.deity(id))
      .filter((d): d is Deity => d !== undefined)
      .map((d) => {
        const relationNodes = index.relationsOf(d.id).map((r) => {
          const otherId = index.otherParty(r, d.id);
          const node = new RelationNode(r, index.nameOf(otherId), index.directedLabel(r, d.id), d.name, otherId);
          this.relationNodes.set(relationKey(r), node);
          return node;
        });
        const node = new DeityNode(d, relationNodes);
        this.deityNodes.set(d.id, node);
        return node;
      });
  }
}
