export interface DocEntry {
  kind: "doc";
  label: string;
  url: string;
}

export interface CodeEntry {
  kind: "code";
  label: string;
  description: string;
  snippet: string;
}

export type CheatEntry = DocEntry | CodeEntry;

export interface CheatCategory {
  id: string;
  label: string;
  icon: string;
  entries: CheatEntry[];
}

export const DOCS_HOME = "https://code.visualstudio.com/api";

export const categories: CheatCategory[] = [
  {
    id: "general",
    label: "General",
    icon: "tools",
    entries: [
      {
        kind: "doc",
        label: "Your First Extension (docs)",
        url: "https://code.visualstudio.com/api/get-started/your-first-extension",
      },
      {
        kind: "doc",
        label: "vscode API Reference (docs)",
        url: "https://code.visualstudio.com/api/references/vscode-api",
      },
      {
        kind: "code",
        label: "OutputChannel",
        description: "dedicated output channel with log levels",
        snippet: [
          "// Dedicated output channel (Output panel -> \"My Extension\")",
          "const logger = vscode.window.createOutputChannel(\"My Extension\", { log: true });",
          "context.subscriptions.push(logger);",
          "logger.info(\"extension activated\");",
        ].join("\n"),
      },
      {
        kind: "code",
        label: "StatusBarItem",
        description: "right-aligned status bar entry with codicon",
        snippet: [
          "// Status bar entry (right side, priority 100)",
          "const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);",
          "item.text = \"$(book) My Extension\";",
          "item.tooltip = \"Open my extension\";",
          "item.command = \"myExtension.hello\";",
          "item.show();",
          "context.subscriptions.push(item);",
        ].join("\n"),
      },
    ],
  },
  {
    id: "commands",
    label: "Commands",
    icon: "terminal",
    entries: [
      {
        kind: "doc",
        label: "Extending the Workbench: Commands (docs)",
        url: "https://code.visualstudio.com/api/extension-guides/command",
      },
      {
        kind: "code",
        label: "registerCommand",
        description: "minimal command registration + disposal",
        snippet: [
          "// Register a command; push to subscriptions so it is disposed on deactivate",
          "const disposable = vscode.commands.registerCommand(\"myExtension.hello\", async () => {",
          "  vscode.window.showInformationMessage(\"Hello from myExtension!\");",
          "});",
          "context.subscriptions.push(disposable);",
        ].join("\n"),
      },
    ],
  },
  {
    id: "treeview",
    label: "TreeView",
    icon: "list-tree",
    entries: [
      {
        kind: "doc",
        label: "Extending the Workbench: Tree View (docs)",
        url: "https://code.visualstudio.com/api/extension-guides/tree-view",
      },
      {
        kind: "code",
        label: "TreeDataProvider + createTreeView",
        description: "minimal tree data provider and tree view",
        snippet: [
          "// Minimal TreeDataProvider + createTreeView (prefer over registerTreeDataProvider when you need refresh/reveal)",
          "class MyProvider implements vscode.TreeDataProvider<MyItem> {",
          "  private _onDidChange = new vscode.EventEmitter<void>();",
          "  readonly onDidChangeTreeData = this._onDidChange.event;",
          "  getTreeItem(item: MyItem): vscode.TreeItem { return item; }",
          "  getChildren(item?: MyItem): MyItem[] {",
          "    if (item) { return item.children; }",
          "    return [new MyItem(\"root\", [new MyItem(\"child\")])];",
          "  }",
          "  refresh(): void { this._onDidChange.fire(); }",
          "}",
          "",
          "class MyItem extends vscode.TreeItem {",
          "  constructor(label: string, public children: MyItem[] = []) {",
          "    super(label, children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);",
          "  }",
          "}",
          "",
          "const tree = vscode.window.createTreeView(\"myExtensionView\", { treeDataProvider: new MyProvider() });",
          "context.subscriptions.push(tree);",
        ].join("\n"),
      },
    ],
  },
  {
    id: "webview",
    label: "Webview",
    icon: "globe",
    entries: [
      {
        kind: "doc",
        label: "Extending the Workbench: Webview (docs)",
        url: "https://code.visualstudio.com/api/extension-guides/webview",
      },
      {
        kind: "code",
        label: "createWebviewPanel",
        description: "minimal webview panel, scripts disabled",
        snippet: [
          "// Minimal webview panel (keep enableScripts false unless you need messaging)",
          "const panel = vscode.window.createWebviewPanel(",
          "  \"myExtension.view\",   // viewType",
          "  \"My View\",            // title",
          "  vscode.ViewColumn.Beside,",
          "  { enableScripts: false }",
          ");",
          "panel.webview.html = \"<!DOCTYPE html><html><head><meta charset=\\\"UTF-8\\\"></head><body><h1>Hello Webview</h1></body></html>\";",
        ].join("\n"),
      },
    ],
  },
  {
    id: "packaging",
    label: "Packaging",
    icon: "package",
    entries: [
      {
        kind: "doc",
        label: "Publishing & Packaging (docs)",
        url: "https://code.visualstudio.com/api/working-with-extensions/publishing",
      },
      {
        kind: "code",
        label: "vsce package CLI",
        description: "build and install a VSIX locally",
        snippet: [
          "# Package a VSIX (run in the extension root)",
          "npx @vscode/vsce package --out artifacts/vsix/my-extension-0.0.1.vsix",
          "",
          "# Install for local verification",
          "code --install-extension artifacts/vsix/my-extension-0.0.1.vsix --force",
        ].join("\n"),
      },
    ],
  },
];

export function codeEntriesOf(category: CheatCategory): CodeEntry[] {
  return category.entries.filter((e): e is CodeEntry => e.kind === "code");
}

export function isCodeEntry(value: unknown): value is CodeEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind: unknown }).kind === "code" &&
    "label" in value &&
    "snippet" in value
  );
}
