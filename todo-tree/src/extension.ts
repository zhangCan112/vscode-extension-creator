import * as vscode from "vscode";

interface Todo {
  id: number;
  label: string;
  done: boolean;
}

function isTodo(v: unknown): v is Todo {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    typeof (v as Todo).id === "number" &&
    "label" in v &&
    typeof (v as Todo).label === "string" &&
    "done" in v &&
    typeof (v as Todo).done === "boolean"
  );
}

class TodoItem extends vscode.TreeItem {
  constructor(todo: Todo) {
    super(todo.label, vscode.TreeItemCollapsibleState.None);
    this.id = String(todo.id);
    this.iconPath = new vscode.ThemeIcon(todo.done ? "check" : "circle-large-outline");
    this.description = todo.done ? "done" : undefined;
    this.contextValue = todo.done ? "todo-done" : "todo-pending";
    this.command = { command: "miniTodos.toggleTodo", title: "Toggle Todo", arguments: [todo] };
  }
}

class TodosProvider implements vscode.TreeDataProvider<Todo> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly getTodos: () => Todo[]) {}

  getTreeItem(item: Todo): vscode.TreeItem {
    return new TodoItem(item);
  }

  getChildren(): Todo[] {
    return this.getTodos();
  }

  refresh(): void {
    this._onDidChange.fire();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel("Mini Todos", { log: true });
  context.subscriptions.push(logger);
  logger.info("activated");

  const todos: Todo[] = [];
  let nextId = 1;

  const provider = new TodosProvider(() => todos);
  const tree = vscode.window.createTreeView("miniTodosView", { treeDataProvider: provider });
  context.subscriptions.push(tree);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.tooltip = "Mini Todos: completed / total (click to add a todo)";
  status.command = "miniTodos.addTodo";
  context.subscriptions.push(status);

  const updateStatus = () => {
    const done = todos.filter((t) => t.done).length;
    status.text = `$(check) ${done}/${todos.length}`;
    status.show();
  };
  updateStatus();

  context.subscriptions.push(
    vscode.commands.registerCommand("miniTodos.addTodo", async () => {
      try {
        const label = await vscode.window.showInputBox({
          placeHolder: "Todo title",
          prompt: "Enter the title of the new todo",
        });
        if (label === undefined || label.trim() === "") {
          return;
        }
        todos.push({ id: nextId++, label: label.trim(), done: false });
        provider.refresh();
        updateStatus();
        logger.info(`added todo #${nextId - 1}: ${label.trim()}`);
      } catch (e) {
        logger.error(`addTodo failed: ${e}`);
        void vscode.window.showErrorMessage("Mini Todos: failed to add todo.");
      }
    }),

    vscode.commands.registerCommand("miniTodos.toggleTodo", (...args: unknown[]) => {
      const todo = args[0];
      if (!isTodo(todo)) {
        logger.warn(`toggleTodo bad args: ${JSON.stringify(args)}`);
        return;
      }
      const target = todos.find((t) => t.id === todo.id);
      if (!target) {
        logger.warn(`toggleTodo: todo not found: ${todo.id}`);
        return;
      }
      target.done = !target.done;
      provider.refresh();
      updateStatus();
    }),

    vscode.commands.registerCommand("miniTodos.deleteTodo", (...args: unknown[]) => {
      const todo = args[0];
      if (!isTodo(todo)) {
        logger.warn(`deleteTodo bad args: ${JSON.stringify(args)}`);
        return;
      }
      const idx = todos.findIndex((t) => t.id === todo.id);
      if (idx < 0) {
        logger.warn(`deleteTodo: todo not found: ${todo.id}`);
        return;
      }
      todos.splice(idx, 1);
      provider.refresh();
      updateStatus();
      logger.info(`deleted todo #${todo.id}`);
    }),

    vscode.commands.registerCommand("miniTodos.insertTodoComment", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("Mini Todos: open a file first to insert a TODO comment.");
        return;
      }
      void editor.insertSnippet(new vscode.SnippetString("// TODO: "));
    }),
  );
}

export function deactivate() {}
