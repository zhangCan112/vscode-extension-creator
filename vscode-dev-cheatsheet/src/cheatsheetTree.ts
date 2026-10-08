import * as vscode from "vscode";
import { CheatCategory, CheatEntry, categories } from "./cheatsheet";

export class CategoryNode extends vscode.TreeItem {
  constructor(
    public category: CheatCategory,
    public entries: CheatEntry[],
  ) {
    super(category.label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(category.icon);
    this.description = `${entries.length} entries`;
    this.contextValue = "category";
  }
}

export class EntryNode extends vscode.TreeItem {
  constructor(public entry: CheatEntry) {
    super(entry.label, vscode.TreeItemCollapsibleState.None);
    if (entry.kind === "doc") {
      this.iconPath = new vscode.ThemeIcon("book");
      this.description = entry.url;
      this.tooltip = `Open in browser: ${entry.url}`;
      this.command = {
        command: "devCheatsheet.openDocUrl",
        title: "Open Documentation",
        arguments: [entry.url],
      };
      this.contextValue = "doc";
    } else {
      this.iconPath = new vscode.ThemeIcon("symbol-snippet");
      this.description = entry.description;
      this.tooltip = new vscode.MarkdownString(
        `Insert snippet \`${entry.label}\` at the cursor`,
      );
      this.command = {
        command: "devCheatsheet.insertSnippetAtCursor",
        title: "Insert Snippet",
        arguments: [entry],
      };
      this.contextValue = "code";
    }
  }
}

export type CheatsheetNode = CategoryNode | EntryNode;

export class CheatsheetProvider implements vscode.TreeDataProvider<CheatsheetNode> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private filterText: string | undefined;

  getTreeItem(item: CheatsheetNode): vscode.TreeItem {
    return item;
  }

  getChildren(item?: CheatsheetNode): CheatsheetNode[] {
    if (item) {
      if (item instanceof CategoryNode) {
        return item.entries.map((entry) => new EntryNode(entry));
      }
      return [];
    }
    return this.visibleCategories().map(
      (category) => new CategoryNode(category, this.visibleEntries(category)),
    );
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  setFilter(text: string | undefined): void {
    this.filterText = text && text.length > 0 ? text.toLowerCase() : undefined;
  }

  getFilter(): string | undefined {
    return this.filterText;
  }

  private visibleCategories(): CheatCategory[] {
    return categories.filter((category) => this.visibleEntries(category).length > 0);
  }

  private visibleEntries(category: CheatCategory): CheatEntry[] {
    if (!this.filterText) {
      return category.entries;
    }
    return category.entries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(this.filterText!) ||
        category.label.toLowerCase().includes(this.filterText!),
    );
  }
}
