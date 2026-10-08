import * as vscode from "vscode";
import { CodeEntry, DOCS_HOME, categories, codeEntriesOf, isCodeEntry } from "./cheatsheet";
import { CheatsheetProvider } from "./cheatsheetTree";

interface CategoryPickItem extends vscode.QuickPickItem {
  category: (typeof categories)[number];
}

interface EntryPickItem extends vscode.QuickPickItem {
  entry: CodeEntry;
}

export function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel("Dev Cheatsheet", { log: true });
  context.subscriptions.push(logger);
  logger.info("activating");

  const provider = new CheatsheetProvider();
  const tree = vscode.window.createTreeView("devCheatsheetDocs", {
    treeDataProvider: provider,
  });
  context.subscriptions.push(tree);

  const insertSnippet = async (entry: CodeEntry): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      logger.warn(`no active editor; cannot insert "${entry.label}"`);
      vscode.window.showWarningMessage(
        "Dev Cheatsheet: no open text editor. Open a file and place the cursor where the snippet should go, then try again.",
      );
      return;
    }
    const position = editor.selection.active;
    const applied = await editor.edit((builder) => builder.insert(position, entry.snippet));
    if (applied) {
      logger.info(`inserted snippet "${entry.label}"`);
      vscode.window.showInformationMessage(`Dev Cheatsheet: inserted "${entry.label}".`);
    }
  };

  const openInBrowser = async (url: string): Promise<void> => {
    const ok = await vscode.env.openExternal(vscode.Uri.parse(url));
    logger.info(`openExternal ${url} -> ${ok}`);
  };

  const register = (id: string, handler: (...args: unknown[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register("devCheatsheet.insertSnippet", async () => {
    const categoryPick = await vscode.window.showQuickPick<CategoryPickItem>(
      categories.map((category) => ({
        label: category.label,
        description: `${codeEntriesOf(category).length} snippets`,
        category,
      })),
      { placeHolder: "Select a category" },
    );
    if (!categoryPick) {
      return;
    }
    const entryPick = await vscode.window.showQuickPick<EntryPickItem>(
      codeEntriesOf(categoryPick.category).map((entry) => ({
        label: entry.label,
        description: entry.description,
        entry,
      })),
      { placeHolder: "Select a snippet to insert at the cursor" },
    );
    if (!entryPick) {
      return;
    }
    await insertSnippet(entryPick.entry);
  });

  register("devCheatsheet.refreshTree", () => {
    provider.refresh();
    logger.info("tree refreshed");
  });

  register("devCheatsheet.openDocsHome", async () => {
    await openInBrowser(DOCS_HOME);
  });

  register("devCheatsheet.showLogs", () => {
    logger.show();
  });

  register("devCheatsheet.openDocUrl", async (url: unknown) => {
    if (typeof url === "string") {
      await openInBrowser(url);
    }
  });

  register("devCheatsheet.insertSnippetAtCursor", async (entry: unknown) => {
    if (isCodeEntry(entry)) {
      await insertSnippet(entry);
    }
  });

  register("devCheatsheet.filterTree", async () => {
    const text = await vscode.window.showInputBox({
      placeHolder: "Filter cheatsheet entries (e.g. tree)",
      prompt: "Empty input clears the filter",
      value: provider.getFilter(),
    });
    if (text === undefined) {
      return;
    }
    provider.setFilter(text);
    provider.refresh();
    logger.info(`filter set to "${text}"`);
  });

  register("devCheatsheet.clearFilter", () => {
    provider.setFilter(undefined);
    provider.refresh();
    logger.info("filter cleared");
  });

  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.text = "$(book) Dev Cheatsheet";
  statusItem.tooltip = "Open the VS Code Extension API docs home";
  statusItem.command = "devCheatsheet.openDocsHome";
  statusItem.show();
  context.subscriptions.push(statusItem);

  logger.info("activated");
}

export function deactivate() {}
