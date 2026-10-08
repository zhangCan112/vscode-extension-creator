# Lessons (lessons)

Backfill zone. After every practice run that hits a pit, append here **the same day**; once a rule settles, fork it into its topic reference and delete it here.

## Backfill format

```markdown
## YYYY-MM-DD one-line title
- Scenario: which project / which task
- Symptom: the error or anomaly observed
- Root cause: the real cause
- Rule: one executable sentence (fork target: scaffold/commands/treeview-webview/debug-package/localization.md)
```

## Iron rules

- Record only **generalizable** lessons, one-off trivia stay out
- A rule must be executable ("when doing X, first Y") — "watch out for X" is not
- First backfill comes from the `vscode-dev-cheatsheet` project

## 2026-10-08 First field test (v1): 8 gaps, fixed same day

- Scenario: an isolated subagent built vscode-dev-cheatsheet (the first extension) from the skill alone; install/compile/package/vsce all green
- Symptom: activationEvents guidance misled (status bar never activated); vsce ENOENT; plus icon assets, editor insertion, argumented commands, viewWelcome reachability, unknown-args narrowing, LICENSE severity — 8 gaps in all
- Root cause: v1 only absorbed knowledge from 3 source skills, never validated against a real project
- Rule: all 8 forked directly into scaffold.md / commands.md / treeview-webview.md / debug-package.md and the template (media/bar.svg, artifacts/vsix/.gitkeep); no copies kept here; fixes await re-verification in the next practice run
- Re-verification: same-day second isolated run (todo-tree) — **8/8 first-pass**, activationEvents/vsce directory/type guards all pre-empted per the skill; the single new micro-gap (publisher placeholder value) forked into scaffold.md

## 2026-10-08 Third field test (wuxia-relations): 4 new gaps

- Scenario: a character-relations extension; new API surfaces — QuickPick live search, bundled data distribution, tree reveal, API-vs-engines version alignment
- Symptom: QuickPick's built-in fuzzy filter silently hid dynamic entries; `TreeItem.detail` (1.88+) TS2339 under the ^1.85 template; reveal's Thenable has no `.catch`; reveal no-ops when the element instance differs from the provider's returned reference
- Root cause: the skill's API surface only covered the basics of commands + trees
- Rule: QuickPick section → commands.md; reveal details → treeview-webview.md; .vscodeignore blacklist semantics → debug-package.md; engines alignment → scaffold.md; all prior fixes passed again in this round

## 2026-10-08 Fourth field test (wuxia-relations graph view): 5 new gaps

- Scenario: added a Webview + cytoscape force-directed graph (graph↔tree sync, theming, offline-bundled library)
- Symptom: the Webview chapter stopped at the minimal inline sample — dual bundles, external-script CSP (cspSource vs nonce), ready-handshake timing, singleton lifecycle, canvas-blind-to-CSS-variables were all self-improvised; also hit the tsconfig `extends` exclude trap (TS18003)
- Root cause: v1's Webview chapter covered only the "minimal safe sample", missing the engineering layer of real webview apps
- Rule: all five forked into treeview-webview.md's "Webview engineering" section; distinguishing cytoscape drag-vs-tap is library-specific experience and stays out of the main text
