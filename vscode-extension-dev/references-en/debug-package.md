# Debugging and packaging

## F5 debugging

The template ships `.vscode/launch.json` + `tasks.json`: F5 = run `npm run watch` (esbuild incremental compile into `dist/`), then launch the **Extension Development Host** — a separate VS Code window with your extension loaded.

- Set breakpoints directly in `src/extension.ts`; trigger them from the host window
- Code changes hot-apply on save for most things; manifest (package.json) changes require **Developer: Reload Window**
- Debug logs: the host window's Developer Tools console, or the main window's Debug Console

## OutputChannel logging (replaces scattered console.log)

```ts
const logger = vscode.window.createOutputChannel("Dev Cheatsheet", { log: true });
context.subscriptions.push(logger);
logger.info("activated");       // timestamped + leveled, mirrored in the host console
```

Leave the user a way to open the log (a command or a notification button).

## Troubleshooting quick reference

| Symptom | Investigate |
|---|---|
| Extension not loading | is `main` pointing at `./dist/extension.js`; is `engines.vscode` above the host's version |
| Command not found | compare manifest and code command IDs character for character; Reload Window after `package.json` edits |
| Code changes not applying | is the watch task running (check esbuild in the terminal); did the host window reload |
| Keybinding dead | drop the `when` clause to rule it out; search the key in Keyboard Shortcuts for conflicts |
| Activates but nothing happens | the async handler's exception was swallowed — add try/catch + logging |

## Packaging a VSIX

```powershell
npx @vscode/vsce package --out artifacts/vsix/dev-cheatsheet-0.0.1.vsix
```

- Prerequisites: `publisher` filled, README present (the template ships one); with no git repository field, add `--allow-missing-repository`
- **Create the output directory first**: vsce does not create `--out` parent directories — a missing one is an outright ENOENT (the template pre-seeds `artifacts/vsix/.gitkeep`)
- `npx @vscode/vsce` (currently 4.x): a missing LICENSE is a **WARNING, not a blocker**; add it before a real release
- `vscode:prepublish` runs the production build automatically
- `.vscodeignore` is an **exclusion list (a blacklist)**: whatever is not listed ships — `media/`, `data/`, and other non-code assets ride along in the VSIX by default, read at runtime via hard rule 3 (`extensionUri + joinPath`); `src/`, `node_modules/`, `*.map` are on the exclusion list. Audit the file manifest vsce prints and confirm data/icons actually made it into the package — target size < 5MB
- VSIX output lives only in `artifacts/vsix/` (gitignored, `.gitkeep` excepted)

## Install verification (the done standard)

```powershell
code --install-extension artifacts/vsix/dev-cheatsheet-0.0.1.vsix --force   # reinstalls over an older version
code --uninstall-extension indie-dev.dev-cheatsheet                        # uninstall: ID = publisher.name
```

During development you **never install** — the F5 host window loads straight from source; install/uninstall exists to verify the artifact or hand it to someone else. While an installed build coexists with F5: the host window runs the source build, the regular window the installed one; they never interfere.

An isolated profile is cleaner: `code --profileExt --user-data-dir <tmp> --extensions-dir <tmp> --install-extension <vsix>`, then walk the core workflow once and confirm commands / views / icons are all present.

## Out of scope for v1

Marketplace publishing (PAT / account / CI) and `@vscode/test-electron` automated tests — check `references/lessons.md` for settled lessons first, then build it and backfill.
