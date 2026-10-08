import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("template.hello", () => {
    vscode.window.showInformationMessage("Hello from template!");
  });
  context.subscriptions.push(disposable);
}

export function deactivate() {}
