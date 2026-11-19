# Wiki Explorations

Run the Effect server and the React Flow editor from the repo root in separate terminals.

```sh
pnpm --filter @gororobas/wiki-explorations server
pnpm --filter @gororobas/wiki-explorations dev
```

Open [the editor](http://127.0.0.1:4560). Use **New canvas** for a blank graph or **Fork canvas** to copy the current graph into its own file. Drag from an event or property output to a transformation input, and from a transformation output to a property input. The editor saves node edits, connections and positions automatically. Descriptions accept Markdown with fenced code blocks. Use **Preview** to see syntax highlighting. Select a node to highlight its connections, or open **Lint** to jump to incomplete nodes.

Use **Undo** and **Redo** in the header, or **Cmd/Ctrl+Z** and **Cmd/Ctrl+Shift+Z**. **Ctrl+Y** also redoes an edit. Typing in a node field groups into one canvas edit per focus session. Each canvas keeps its own history while the app is open, and undo and redo save the resulting graph to disk.

The [Article projections canvas](canvases/article-projections.json) explores how names, GBIF identifiers and records, and cultivar height can contribute to the article document. Its transformation descriptions are design notes.

## Working with a canvas from an agent

Each file in `canvases/` contains a whole graph. Node IDs are stable and edges reference them directly. Use the local JSON API to make live changes with validation and stale-write detection.

| Request | Purpose |
| --- | --- |
| `GET /api/canvases` | List IDs, titles and fork origins. |
| `GET /api/canvases/:id` | Read the editable `canvas` and its current `revision`. |
| `GET /api/canvases/:id/flow` | Read node inputs, outputs, lint findings and topological order. |
| `POST /api/canvases` | Send `{ "title": "New canvas" }` and optionally `"from": "<source id>"` to fork. |
| `PUT /api/canvases/:id` | Send `{ "revision": "...", "canvas": { ... } }`, keeping IDs stable and updating the nodes or edges. |

Use `http://127.0.0.1:4561` and send `Content-Type: application/json` and `X-Wiki-Explorations: 1` with writes. Re-read after a `409` and reconcile changes against the latest revision. Invalid graphs return `422` with an explanation. Reload an open browser canvas to see edits made by an agent.
