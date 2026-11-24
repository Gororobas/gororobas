# Wiki Explorations

Run the Effect server and the React Flow editor from the repo root in separate terminals.

```sh
pnpm --filter @gororobas/wiki-explorations server
pnpm --filter @gororobas/wiki-explorations dev
```

Open [the editor](http://127.0.0.1:4560). Open the canvas menu next to the title to switch canvases, then choose **New canvas** for a blank graph or **Fork canvas** to copy the current graph into its own file. Drag from an event or property output to a transformation input, and from a transformation output to a property input. The editor saves node edits, connections and positions automatically. Descriptions accept Markdown with fenced code blocks. Use **Preview** to see syntax highlighting. Select a node to highlight its connections.

Description and **Example data (JSON)** open in **Preview**. Choose **Write** to edit. In the highlighted JSON preview, fold objects and arrays or use the expand icon beside **Write** and **Preview** for a larger dialog. Use **Apply example** to save valid JSON or clear the field and apply to remove it. The examples in Article projections are illustrative excerpts, with provider values where available and sample IDs and claims for the app's own data.

Set **Architecture confidence** in the node sidebar. Every node starts as **Not reviewed** (`NOT_REVIEWED`). Use **Locked in** (`LOCKED_IN`) for settled decisions and **Uncertain** (`UNCERTAIN`) for ones you may revisit. The current status appears on the node card, and changes appear in **Git history**.

Double-click a node, or use **Open pipeline** in its sidebar, to see only what feeds it (upstream) and what it feeds (downstream). **Graph** shows that pipeline laid out on its own, with depth limits for each direction; dashed `+N in` and `+N out` badges count the connections the limits or the pipeline leave out. **Steps** pairs the upstream tree with a document that lists the triggering events and reads each transformation as a numbered step with its inputs and outputs. Click any node there to open its pipeline, or **Edit** to change it.

The URL records the selected node, the open pipeline and its **Steps** mode. Opening a pipeline adds a history entry, so the browser Back and Forward buttons retrace nested pipelines.

Press **Cmd/Ctrl+K**, or **Search** in the header, to find a node by title, kind or description. Press Enter to select it, open its sidebar and center it on the canvas.

Use the undo and redo icons in the header, or **Cmd/Ctrl+Z** and **Cmd/Ctrl+Shift+Z**. **Ctrl+Y** also redoes an edit. Typing in a node field groups into one canvas edit per focus session. Each canvas keeps its own history while the app is open, and undo and redo save the resulting graph to disk.

Open **Git history** to compare the current canvas with `HEAD`, another local Git ref, or a commit hash. Choose a recent commit affecting that canvas on `HEAD` to use its saved version as the baseline. The view shows node edits, added and removed connections, and a collapsible list of layout moves. Git must be available to the local server.

The [Article projections canvas](canvases/article-projections.json) explores how names, GBIF identifiers and records, and cultivar height can contribute to the article document. Its transformation descriptions are design notes.

The [GBIF research notes](gbif-research.md) document the API fields and examples behind the geographical origin and occurrence projections.

## Rules for evaluation and display

Decide whether a claim needs evaluation based on what happens when readers or downstream projections use it. Decide how many values to show based on whether the values can coexist in the same scope. These are separate choices.

| Question | Rule of thumb | Example |
| --- | --- | --- |
| Does accepting this claim assign a shared identity or change a sourced assertion readers rely on? | Evaluate the contributor's proposal before treating it as established. Show pending proposals with their status. | A GBIF taxon ID changes which records the article imports. |
| Is the claim an observation or usage that can coexist with others? | Publish with attribution and context. Allow reporting and moderation. | Names in different communities or measured heights in different growing conditions. |
| Can multiple values be true at once? | Keep a set or a contextual summary. Merge equivalent values and preserve evidence. | Tasmania and Victoria can both be native areas. |
| Does a downstream consumer require one value? | Define a selection rule for that consumer. Retain alternatives and their provenance. | Fetch metadata using one selected GBIF taxon ID. |

## Working with a canvas from an agent

Each file in `canvases/` contains a whole graph. Node IDs are stable and edges reference them directly. Use the local JSON API to make live changes with validation and stale-write detection.

| Request | Purpose |
| --- | --- |
| `GET /api/canvases` | List IDs, titles and fork origins. |
| `GET /api/canvases/:id` | Read the editable `canvas` and its current `revision`. |
| `GET /api/canvases/:id/flow` | Read node inputs, outputs, validation errors and topological order. |
| `GET /api/canvases/:id/history?ref=HEAD` | Read the canvas at a Git ref and the last 12 commits on `HEAD` for its path. |
| `POST /api/canvases` | Send `{ "title": "New canvas" }` and optionally `"from": "<source id>"` to fork. |
| `PUT /api/canvases/:id` | Send `{ "revision": "...", "canvas": { ... } }`, keeping IDs stable and updating the nodes or edges. |

Use `http://127.0.0.1:4561` and send `Content-Type: application/json` and `X-Wiki-Explorations: 1` with writes. Re-read after a `409` and reconcile changes against the latest revision. Invalid graphs return `422` with an explanation. Reload an open browser canvas to see edits made by an agent.
