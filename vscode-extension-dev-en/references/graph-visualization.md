# Graph Visualization (relation / dependency / policy graphs)

Read this before building any Webview graph (nodes and edges). Core principle: **layout follows graph semantics; encoding is spent only on small fixed sets; information is disclosed on demand**. A "messy" graph almost always violates one of three rules: layout mismatched to semantics, all-labels-always, or irrelevant elements keeping the canvas during focus.

Reference implementations (this repo): `wuxia-relations/` (peer relation network), `module-policy-graph/` (layered DAG + declaration matching + 100-node stress test).

## Step 1: identify graph semantics, pick a layout

| Graph semantics | Layout | Why |
|---|---|---|
| Peer relation network (people/social, no fixed direction) | Force-directed fcose (better quality than built-in cose) | Clusters emerge naturally |
| Dependency / layered DAG (module deps, call chains) | dagre layered TB (switch to LR when the container is wider than tall, e.g. a sidebar WebviewView) | Position encodes direction; a cycle = an upward edge, visible at a glance |
| Bidirectional declaration matching (policy SEND/RECEIVE, grant alignment) | dagre TB + data-flow-direction arrows | The semantic point is "aligned or not", not topology |
| >300 nodes | Collapse tiers into foldable supernodes, or an adjacency-matrix hybrid | Readability ceiling of node-link diagrams |

Never use force-directed for a DAG — direction information drowns in random positions.

Parallel edges and cycles:

- Keep **parallel edges** for multiple channel types between the same node pair (bezier spreads them automatically); do not merge — with a fixed type set, parallel edges read fine
- To locate cycles on demand: DFS finds all on-cycle edges and highlights them in one emphasis color (+ info bar lists the modules involved); cleaner than per-edge annotation. Oversized strongly connected components may collapse into a supernode

## Encoding rules

1. **A fixed, small (≤7) set of message/relation types → triple redundancy: color × line style × arrow shape** (still distinguishable when zoomed out or color-blind). If the type set is open-ended or >10, encode color only and push the rest into hover details. Starter palettes (light set / dark set): `#1565c0 #c62828 #2e7d32 #8e24aa #ef6c00` / `#64b5f6 #e57373 #81c784 #ba68c8 #ffb74d`; for a 6th/7th color add `#00838f`/`#4dd0e1`, `#5d4037`/`#bcaaa4`
2. **Each element kind owns one color channel**: edges use type colors → nodes use a neutral fill + border color for their own category; a colored node legend plus a colored edge legend always fight
3. Numeric dimensions (degree/coupling) → size mapping: map node font size via `mapData(degree, 0, max, 11, 14)`; hubs stand out naturally
4. States via line-style variants: dashed = has state; **unaligned/dangling = faded + no arrow + a persistent small amber label** (persistent labels are allowed only for low-frequency anomalies)
5. Arrow semantics are unique graph-wide: data-flow direction **or** dependency direction — pick one, state it in the legend; mixing them guarantees confusion. Naturally bidirectional types (e.g. rpc request-response) get a single edge in the initiating direction only; the back-flow gets no edge, details go to hover/side panel

## Progressive disclosure (the strongest weapon against "messy")

- **Three-level focus**: overview → entity (1-hop neighborhood) → single relation; breadcrumb retreats level by level, blank click returns to overview
- **Focus = subgraph isolation**: irrelevant elements leave via `display:none` + relayout the remaining subgraph (airy spacing) — **not dimming in place**; at 100 nodes, dimming is still messy
- Hover = transient neighborhood highlight (no viewport jump); click = locked focus (viewport jump + detail panel); the two states are mutually exclusive (hover is inert while a lock is held)
- **Edge labels are never persistent**: they appear only on edge hover / focus
- Semantic zoom: `min-zoomed-font-size: 6` — zoomed out to the full graph only the structural skeleton remains; text appears when zoomed in
- Entity details live in a side panel (e.g. SEND/RECEIVE lists + ✓/✗ match state), never piled onto the canvas; panel entries are clickable → drill into the single relation

## Scale ladder

| Nodes | Strategy |
|---|---|
| ≤60 | Any layout; invest in interaction |
| 60~300 | Default edge opacity 35% (emphasis states restore 1); tighten layout params (rankSep 60 / nodeSep 35), disable animation; read by drilling in, don't expect full-graph readability |
| >300 | Collapse/aggregate + matrix hybrid; don't brute-force it |

## Bidirectional declaration matching (policy-type graphs)

- A channel exists = both declarations aligned (join A.send + B.receive on the triple); one-sided declarations yield **dangling send / dangling subscribe**, encoded as above
- Do the matching on the host side; the webview only consumes statuses — never compute business semantics on the canvas side
- Cycle detection counts aligned channels only (dangling edges carry no real data flow); pair it with a "dangling only" filter to surface problem declarations in one click

## Implementation notes

- Deterministic layouts (dagre: same input, same output) → returning from focus to overview never drifts; focus subgraphs get their own airy params (rankSep 90 / nodeSep 55)
- Legend = clickable filters (show/hide by type/category) via class + `display:none`; never delete elements
- Distinguish drag from click: set a flag on drag and swallow the immediately following tap
- cytoscape layout extensions (fcose/dagre) ship no type declarations — add a minimal ambient d.ts (`cytoscape.Ext`)
- Theme palette resolution, canvas-blind-to-CSS-variables → see `treeview-webview.md`, "Theming"
