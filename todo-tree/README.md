# Mini Todos

A lightweight, **in-memory** todo list for VS Code. No persistence: the list lives only for the current window session.

## Features

- **Activity bar view** — dedicated icon + tree view of your todos; empty state offers an "Add first todo" command link.
- **Add Todo** — `Mini Todos: Add Todo` in the Command Palette (or the `+` button in the view title, or the welcome link). Type a title in the input box.
- **Toggle done** — click a tree item to toggle it; the icon switches between an empty circle and a check.
- **Delete** — hover a tree item and click the trash button.
- **Status bar counter** — `$(check) done/total`, visible from startup and updated on every change. Click it to add a todo.
- **Insert TODO Comment** — `Mini Todos: Insert TODO Comment` inserts `// TODO: ` at the cursor as a snippet; shows a warning if no editor is open.

## Usage

1. Run `Mini Todos: Add Todo` (Command Palette).
2. Click items to toggle; hover + trash to delete.
3. Run `Mini Todos: Insert TODO Comment` in any editor to drop a TODO marker at the cursor.

## Development

```powershell
npm install
npm run compile   # type-check + esbuild bundle to dist/
npm run package   # production build
npx @vscode/vsce package --out artifacts/vsix/mini-todos-0.0.1.vsix
```

Press **F5** in VS Code to launch the Extension Development Host.

## Notes

- Todos are never written to disk or workspace state — closing the window clears them.
- Logs go to the "Mini Todos" output channel.
