# Dev Cheatsheet

A cheat sheet for VS Code extension development, living in the activity bar.

## Features

- **Activity bar view** with topic categories (General, Commands, TreeView, Webview, Packaging):
  - **Doc entries** (book icon): click to open the official `code.visualstudio.com/api` page in your browser.
  - **Code entries** (snippet icon): click to insert a minimal API snippet (`registerCommand`, `createTreeView`, `OutputChannel`, `StatusBarItem`, `createWebviewPanel`, `vsce package`) at the cursor. With no editor open you get a visible warning.
- **Commands** (Command Palette, category "Dev Cheatsheet"):
  - `Insert Snippet` — quick pick a category, then a snippet.
  - `Refresh Tree`
  - `Open Docs Home`
  - `Show Logs`
- **Filter** button (`$(filter)`) on the view title; an empty filter result shows the view welcome content with a `Clear Filter` action.
- **Status bar entry** (`$(book) Dev Cheatsheet`) opening the docs home.

## Development

```powershell
npm install
npm run compile   # type check + esbuild bundle to dist/
npm run watch     # F5 debugging (see .vscode/launch.json)
npm run package   # production build
npx @vscode/vsce package --out artifacts/vsix/dev-cheatsheet-0.0.1.vsix --allow-missing-repository
```
