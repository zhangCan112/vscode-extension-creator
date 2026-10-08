# Scaffold: a new extension from the template

## Preflight

```powershell
node -v          # 18+
code --version   # VS Code CLI on PATH
```

## Steps

1. **Copy the template** into a subdirectory of the practice repo: `E:\vscode-extension-creator\<project-name>\` (the template lives in this skill at `assets/templates/ext-ts-esbuild/`)
2. **Work through the rename checklist** below
3. `npm install`
4. Open the project folder in VS Code and press **F5** (wait for the watch task to finish compiling before the host window appears)
5. In the host window's Command Palette, run the renamed hello command — the info notification is your green light

## Rename checklist (every row)

`package.json`:

| Field | Template value | Change to |
|---|---|---|
| `name` / `displayName` / `description` | ext-ts-esbuild… | your project's |
| `contributes.commands[].command` | `template.hello` | `<prefix>.hello` |
| `contributes.commands[].category` | Template | project display name |
| `publisher` | (absent) | your ID — required before packaging a VSIX; with no Marketplace account, a placeholder like `indie-dev` works and never affects local VSIX use |
| `activationEvents` | `[]` | `["onStartupFinished"]` when anything must exist at startup (see must-know fields) |

`src/extension.ts`: rename `registerCommand("template.hello", …)` to the new command ID in lockstep.

`README.md`: rewrite it for the project — the stub text must not ship.

`media/`: replace the template's placeholder `media/bar.svg` (activity-bar icon); drawing rules live in treeview-webview.md.

## Naming consistency table

Every identifier in one extension shares one prefix; audit line by line before release:

| Item | Rule | Example (prefix `devCheatsheet`) |
|---|---|---|
| package name | kebab-case | `dev-cheatsheet` |
| setting key | `<prefix>.<camel>` | `devCheatsheet.enabled` |
| command ID | `<prefix>.<verb>` | `devCheatsheet.openDocs` |
| view ID | `<prefix><Noun>` | `devCheatsheetDocs` |

## Manifest must-know fields

- `main`: **`./dist/extension.js`** (the esbuild output directory — not `out/`; tsc only type-checks and emits nothing)
- `engines.vscode`: sets the minimum VS Code version and the matching `@types/vscode`; keep the two in sync. **Using an API newer than engines surfaces as TS2339** (e.g. `TreeItem.detail` is 1.88+, the template pins ^1.85) — on that error, look up when the API shipped, then either fall back (fold the text into description/tooltip) or raise engines to match
- `activationEvents`: commands and views activate implicitly since 1.74, so a command-only extension leaves it empty. **Anything that must exist at startup (status bar item, background task) requires an explicit `"activationEvents": ["onStartupFinished"]`** — otherwise the extension never activates until the user's first command, and the status bar never appears
- `contributes`: the single declaration site for commands, views, settings, and keybindings — change it in lockstep with the code

## Traps

| Symptom | Cause |
|---|---|
| Command missing after F5 | `main` repointed to `out/`; or the Palette was opened before the watch task finished |
| Activates but command not found | manifest and code command IDs differ (case counts) |
| Packaging complains about README/publisher | stub README needs rewriting; `publisher` is mandatory |
| Status bar / startup feature never appears | missing `"activationEvents": ["onStartupFinished"]` — implicit activation covers only command and view triggers |
