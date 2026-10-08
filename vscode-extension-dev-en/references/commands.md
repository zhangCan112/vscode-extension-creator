# Commands: contribution and registration rules

(Adapted from github/awesome-copilot vscode-ext-commands)

## Three command kinds

### 1. Regular commands (visible in the Command Palette)

```json
{
  "contributes": {
    "commands": [
      { "command": "devCheatsheet.openDocs", "title": "Open Docs", "category": "Dev Cheatsheet" }
    ]
  }
}
```

- `title` is mandatory; **so is `category`** — an uncategorized command lands in the Palette naked, mixed into everyone else's
- `icon` only when the command also appears in a button slot

### 2. UI-only commands (view title / list items, hidden from the Palette)

```json
{
  "contributes": {
    "commands": [
      { "command": "devCheatsheet.refresh", "title": "Refresh", "category": "Dev Cheatsheet", "icon": "$(refresh)" }
    ],
    "menus": {
      "view/title": [
        { "command": "devCheatsheet.refresh", "when": "view == devCheatsheetDocs", "group": "navigation" }
      ],
      "commandPalette": [
        { "command": "devCheatsheet.refresh", "when": "false" }
      ]
    }
  }
}
```

- **Define an `icon`** (a `$(name)` codicon) — view-title buttons stay invisible without one
- Hide from the Palette: add the command to `menus.commandPalette` with `"when": "false"`
- Placement: `group` (`navigation` renders as a title-bar button, other groups fold into the `...` menu) plus an `order` number
- Visibility / availability: `when` controls display, `enablement` controls greying out
- Optional house style (from awesome-copilot): prefix purely-UI command IDs with `_`, e.g. `_devCheatsheet.refresh#sideBar`

### 3. Data commands (invoked with arguments from UI code, hidden from the Palette)

Commands called by `TreeItem.command`, `view/item/context` menus, and the like, with `arguments`:

- Hide them with `commandPalette: when false` as well — a user triggering an argument-less command from the Palette gets nothing but an error
- **Treat arguments as untrusted input**: accept `(...args: unknown[])` and narrow with a type guard before touching properties (property access on unknown is both TS2339 and a runtime crash):

```ts
interface DocEntry { url: string }
function isDocEntry(v: unknown): v is DocEntry {
  return typeof v === "object" && v !== null && "url" in v && typeof (v as DocEntry).url === "string";
}

vscode.commands.registerCommand("devCheatsheet.openDoc", (...args: unknown[]) => {
  const entry = args[0];
  if (!isDocEntry(entry)) { logger.warn(`bad args: ${JSON.stringify(args)}`); return; }
  void vscode.env.openExternal(vscode.Uri.parse(entry.url));
});
```

## Code side

```ts
const disposable = vscode.commands.registerCommand("devCheatsheet.openDocs", async (arg) => {
  // arg depends on the caller: undefined from the Palette, a TreeItem from a view
});
context.subscriptions.push(disposable);
```

- Push every disposable into `context.subscriptions` or it leaks
- Exceptions thrown inside a handler are swallowed silently by VS Code — catch inside async handlers and surface visible feedback

## QuickPick live search (filter as you type)

`showQuickPick` fits static lists only; live filtering needs `createQuickPick`:

```ts
const qp = vscode.window.createQuickPick();
qp.placeholder = "Person or relation type";
qp.matchOnDescription = true;                     // key: see traps below
qp.onDidChangeValue((value) => {
  const hits = query(value);                      // your own query logic
  qp.items = hits.length
    ? hits.map(h => ({ label: h.label, description: h.searchable }))   // duplicate searchable text into description
    : [{ label: "No matches", alwaysShow: true }]; // placeholder must be alwaysShow
});
qp.onDidAccept(() => { const sel = qp.activeItems[0]; qp.hide(); /* use sel */ });
qp.show();
```

Traps (all real crash sites):

- **QuickPick applies its own fuzzy filter to `items`**: dynamically generated entries whose label lacks the current input get silently hidden — enable `matchOnDescription` / `matchOnDetail` and duplicate the searchable text into description/detail
- A "No matches" placeholder needs `alwaysShow: true`, or the same filter eats it
- Labels accept inline `$(codicon)` icons

## Touching the editor from a command (insert at cursor)

```ts
const editor = vscode.window.activeTextEditor;
if (!editor) {
  vscode.window.showWarningMessage("Open a file first");   // visible feedback, never a silent return
  return;
}
const snip = new vscode.SnippetString("vscode.commands.registerCommand($1, () => {$2})");  // $1/$2 are cursor stops
void editor.insertSnippet(snip);                            // lands at the cursor, undoable
// plain text variant: editor.edit(b => b.insert(editor.selection.active, text));
```

## Keybindings

```json
"keybindings": [
  { "command": "devCheatsheet.openDocs", "key": "ctrl+alt+d", "when": "editorTextFocus" }
]
```

When one stops working: drop the `when` clause first to rule it out, then search the key in Keyboard Shortcuts for conflicts with other extensions.

## Checklist

- [ ] every command has `title` + `category`
- [ ] manifest command IDs match `registerCommand` character for character
- [ ] UI-only / data commands carry an icon (for button slots) and `commandPalette: when false`
- [ ] argumented commands have a type guard; the no-editor path gives visible feedback
- [ ] every disposable lands in `subscriptions`
