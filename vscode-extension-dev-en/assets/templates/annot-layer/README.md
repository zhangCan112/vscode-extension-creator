# annot-layer (webview preview annotation layer)

A free-form annotation layer that sits on top of a live preview page: the real UI stays fully interactive; with annotate mode on, click anywhere to drop a pin. Notes land on disk in real time for the agent to consume item by item (annotate → consume → audit loop).

## Wiring (three steps)

1. Start the collection server (keep the terminal open):

   ```
   node annot-server.mjs <data-dir> <port>
   ```

2. Include the two files in the preview page **after the bundle**:

   ```html
   <link rel="stylesheet" href="annot-layer.css">
   <script src="annot-layer.js"></script>
   ```

3. Initialize (graph page vs plain page):

   ```js
   // Graph page: built-in cytoscape adapter (canvas anchors follow pan/zoom + hit description + viewport snapshot)
   initAnnotLayer({
     endpoint: "http://127.0.0.1:6177",
     storageKey: "my-annot-pins",
     adapter: mpgCytoscapeAdapter(() => window.__myCy, "cy"),
     getContext: () => ({ view: "overview" }),
   });

   // Plain page: omit the adapter — everything page-anchored with DOM hit description
   initAnnotLayer({ endpoint: "http://127.0.0.1:6177" });
   ```

## Data and consumption (agent-side discipline)

- pending inbox: `<data-dir>/annotations.jsonl`, one record per line `{ts,id,note,anchor,ctx,target,shot?}`
  - `target` = hit description (node/edge/DOM element + text/blank canvas); `shot` = viewport snapshot at drop time `pin-<id>.png`
- **Every note must be fixed or explicitly explained — silent drops forbidden**
- Ack after consuming: `POST /consume {"id":N,"fix":"what changed"}` — the entry leaves pending and an audit record is appended to `annotations-audit.jsonl` (`annotation_applied` + old/new)
- Reply to the user with a per-id reconciliation list; new annotations restart the loop

## Adapter contract (implement for other graph libraries)

`ready()` / `token()` (instance identity, for rebinding after rebuilds) / `container` / `toModel(rx,ry)` / `toRendered(m)` / `describeAt(rx,ry)` / `snapshot()` — all optional.
