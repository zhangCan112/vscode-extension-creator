import * as vscode from "vscode";
import {
  Character,
  Graph,
  Relation,
  RelationType,
  charById,
  otherId,
  relationIcon,
  relationsOf,
  shifuTag,
} from "./model";

export type Filter =
  | { kind: "all" }
  | { kind: "person"; id: string }
  | { kind: "type"; type: RelationType };

class PersonItem extends vscode.TreeItem {
  constructor(
    public readonly person: Character,
    public readonly children: RelationItem[],
    expanded: boolean,
  ) {
    super(
      person.name,
      children.length
        ? expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description = `${person.faction} · ${person.title} · 关系 ${children.length} 条`;
    this.iconPath = new vscode.ThemeIcon("person");
    this.contextValue = "person";
    this.tooltip = new vscode.MarkdownString(
      `**${person.name}**（${person.faction} · ${person.title}）\n\n共 ${children.length} 条关系，展开查看；点击关系行可下钻到对方。`,
    );
  }
}

class RelationItem extends vscode.TreeItem {
  constructor(public readonly relation: Relation, public readonly other: Character) {
    const tag = shifuTag(relation, other.id);
    super(`${relation.type}${tag} · ${other.name}`, vscode.TreeItemCollapsibleState.None);
    this.description = relation.status ?? "";
    this.iconPath = new vscode.ThemeIcon(relationIcon(relation.type));
    this.contextValue = "relation";
    const statusLine = relation.status ? `\n\n- 状态：${relation.status}` : "";
    const noteLine = relation.note ? `\n\n- ${relation.note}` : "";
    this.tooltip = new vscode.MarkdownString(
      `**${relation.type}**：${other.name}${statusLine}${noteLine}\n\n- 点击下钻查看 ${other.name} 的关系`,
    );
    this.command = {
      command: "wuxiaRelations.focusPerson",
      title: `下钻查看 ${other.name}`,
      arguments: [other.id],
    };
  }
}

class PairItem extends vscode.TreeItem {
  constructor(a: Character, b: Character, rel: Relation) {
    super(
      `${a.name} ${rel.status === "单方面" ? "→" : "⇄"} ${b.name}`,
      vscode.TreeItemCollapsibleState.None,
    );
    this.description = rel.status ?? "";
    this.iconPath = new vscode.ThemeIcon("arrow-both");
    this.contextValue = "pair";
    this.tooltip = new vscode.MarkdownString(
      `**${rel.type}**${rel.status ? `（${rel.status}）` : ""}${rel.note ? `\n\n- ${rel.note}` : ""}\n\n- 点击下钻到 ${a.name}`,
    );
    this.command = {
      command: "wuxiaRelations.focusPerson",
      title: `下钻查看 ${a.name}`,
      arguments: [a.id],
    };
  }
}

class TypeItem extends vscode.TreeItem {
  constructor(public readonly type: RelationType, public readonly children: PairItem[]) {
    super(`${type}（${children.length} 对）`, vscode.TreeItemCollapsibleState.Expanded);
    this.description = "点击条目可下钻到当事人";
    this.iconPath = new vscode.ThemeIcon(relationIcon(type));
    this.contextValue = "relationType";
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(text: string, detail?: string) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.tooltip = detail;
    this.iconPath = new vscode.ThemeIcon("info");
    this.contextValue = "message";
  }
}

export type GraphElement = PersonItem | RelationItem | TypeItem | PairItem | MessageItem;

export class GraphTreeProvider implements vscode.TreeDataProvider<GraphElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GraphElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private graph: Graph | undefined;
  private filter: Filter = { kind: "all" };
  private errorMessage: string | undefined;
  private roots: GraphElement[] = [];

  getTreeItem(element: GraphElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GraphElement): GraphElement[] {
    if (!element) {
      return this.roots;
    }
    if (element instanceof PersonItem) {
      return element.children;
    }
    if (element instanceof TypeItem) {
      return element.children;
    }
    return [];
  }

  getRoots(): GraphElement[] {
    return this.roots;
  }

  setGraph(graph: Graph): void {
    this.graph = graph;
    this.errorMessage = undefined;
    this.rebuild();
  }

  setError(message: string): void {
    this.errorMessage = message;
    this.graph = undefined;
    this.rebuild();
  }

  setFilter(filter: Filter): void {
    this.filter = filter;
    this.rebuild();
  }

  private rebuild(): void {
    if (this.errorMessage) {
      this.roots = [new MessageItem("数据加载失败", this.errorMessage)];
    } else if (!this.graph) {
      this.roots = [new MessageItem("数据加载中…", "正在读取内置 data/graph.json")];
    } else {
      this.roots = this.computeRoots(this.graph);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  private computeRoots(graph: Graph): GraphElement[] {
    const filter = this.filter;
    if (filter.kind === "person") {
      const person = graph.characters.find((c) => c.id === filter.id);
      if (!person) {
        return [];
      }
      return [this.buildPerson(graph, person, true)];
    }
    if (filter.kind === "type") {
      const relations = graph.relations.filter((r) => r.type === filter.type);
      if (relations.length === 0) {
        return [];
      }
      const pairs = relations.map(
        (r) => new PairItem(charById(graph, r.source), charById(graph, r.target), r),
      );
      return [new TypeItem(filter.type, pairs)];
    }
    return graph.characters.map((c) => this.buildPerson(graph, c, false));
  }

  private buildPerson(graph: Graph, person: Character, expanded: boolean): PersonItem {
    const children = relationsOf(graph, person.id).map(
      (r) => new RelationItem(r, charById(graph, otherId(r, person.id))),
    );
    return new PersonItem(person, children, expanded);
  }
}
