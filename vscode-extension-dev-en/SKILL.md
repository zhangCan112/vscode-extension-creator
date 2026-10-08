---
name: vscode-extension-dev-en
description: Use when creating, modifying, debugging, or packaging a VS Code extension — scaffolding a new extension (TypeScript + esbuild), contributing commands, TreeView or Webview UI, F5 debugging, extension activation issues, or building a VSIX with vsce. Do NOT use for VS Code user settings, keybindings.json, or theme/color customization (that is configuration, not extension development). English edition of vscode-extension-dev.
metadata:
  pattern: tool-wrapper+generator
  domain: vscode-extension
---

# VS Code Extension Development

## Overview

A knowledge base + scaffold template for VS Code extension development on a TypeScript + esbuild stack. Zero scripts, zero third-party dependencies: this skill is documents and static templates only — every build dependency (esbuild, @types/vscode, vsce) is declared in the extension project's own `package.json` or fetched on demand by `npx`.

## When to use

- Creating a VS Code extension from scratch
- Adding commands, TreeViews, Webviews, status bar items, or settings to an existing extension
- F5 debugging not working, extension not activating, command not found
- Packaging / installing a VSIX with vsce

**Do NOT use for:** VS Code user settings, `keybindings.json`, or theme colors — that is editor configuration, not extension development.

## Task routing table

| Task | Action |
|---|---|
| New extension | Read `references/scaffold.md`, copy `assets/templates/ext-ts-esbuild/` |
| Add / change commands | Read `references/commands.md` |
| Sidebar / tree view / Webview / status bar | Read `references/treeview-webview.md` |
| Debugging / packaging a VSIX | Read `references/debug-package.md` |
| Localization / i18n | Read `references/localization.md` |
| Hit a pit | Check `references/lessons.md` first; backfill new pits the same day per its header format |

## Hard rules (every task)

1. **Naming consistency**: package name, setting keys, command IDs, view IDs share one prefix (table in `references/scaffold.md`)
2. **Command IDs match character for character**: the `contributes.commands` entry and the code's `registerCommand` ID must be identical
3. **Resource paths**: resolve everything from `context.extensionUri` + `vscode.Uri.joinPath` — never guess install paths or user directories
4. **Logging**: no scattered `console.log`; aggregate into an OutputChannel (minimal implementation in `references/debug-package.md`)
5. **VSIX artifacts**: output to `artifacts/vsix/` only; never commit them

## Scaffolding

The sole scaffold source is `assets/templates/ext-ts-esbuild/` — copy it and work through the rename checklist in `references/scaffold.md`; do not generate with `yo code` and patch.
