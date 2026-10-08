# Greek Relations

Explore the family feuds, marriages, and secret affairs of the Greek pantheon without leaving VS Code.

## Features

- **Live search** — run `Greek Relations: Search Deities & Relations` from the Command Palette (or the search button in the view title) and type:
  - a **deity name** (e.g. `Zeus`) — live-lists every recorded relation with the other party, the type, and any status
  - a **relation type** keyword (e.g. `rival`, `spouse`, `secret lover`, `affair`, `brother`) — live-lists every pair bound by that type
  - results filter while you type; picking an entry focuses it in the sidebar tree
- **Sidebar tree** — the Greek Relations activity-bar entry (temple icon) shows the deity in focus, expanded into directed relation entries (`child of`, `parent of`, `spouse`, `rival`, …):
  - clicking a relation entry jumps to the other party
  - the clear button in the view title resets the view and brings back the welcome hint
- **Statuses** — relations can carry a status (`banished`, `secret`, `one-sided`, `estranged`, `seasonal`), shown inline in descriptions and in full in tooltips.
- **Graph view** — run `Greek Relations: Open Relations Graph` from the Command Palette (or the graph button in the view title):
  - force-directed graph of all deities and relations (cytoscape, bundled into the extension — no network)
  - nodes are colored by domain group, edges by relation type (color + line style); statuses show as edge labels, notes on edge click
  - drag to arrange, scroll to zoom, drag the background to pan
  - clicking a node drills the sidebar tree to that deity; search picks and tree focus dim everything that does not match
  - follows the VS Code light/dark theme via `--vscode-*` chart colors, live on theme switch

## Bundled data

`data/deities.json` ships inside the VSIX and is read at runtime: 18 deities and 37 relations
across 5 types (parent/child, spouse, sibling, rival, secret lover); 11 relations carry a status.

## Commands

| Command | Where it lives |
|---|---|
| `Greek Relations: Search Deities & Relations` | Command Palette, view title |
| `Greek Relations: Open Relations Graph` | Command Palette, view title |
| `Greek Relations: Clear Focus` | view title only |
| `Greek Relations: Focus Deity` | internal (tree items and search picks) |
| `Greek Relations: Open Log` | Command Palette |

## Build and package

```powershell
npm install
npm run compile
npm run package
npx @vscode/vsce package --out artifacts/vsix/greek-relations-0.0.1.vsix --allow-missing-repository
```

During development, open the folder in VS Code and press F5 to launch the Extension Development Host.
