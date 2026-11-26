# Wiki Explorations

Run the Effect server and the React Flow editor from the repo root in separate terminals.

```sh
pnpm --filter @gororobas/wiki-explorations server
pnpm --filter @gororobas/wiki-explorations dev
```

Open [the editor](http://127.0.0.1:4560). Open the canvas menu next to the title to switch canvases, then choose **New canvas** for a blank graph or **Fork canvas** to copy the current graph into its own file. Drag from an event or property output to a transformation input, and from a transformation output to a property input. The editor saves node edits, connections and positions automatically. Descriptions accept Markdown with fenced code blocks. Use **Preview** to see syntax highlighting. Select a node to highlight its connections.

Description and open questions open in **Preview** when they have content. **Example schema** is a TypeScript editor with syntax highlighting. Write a single Effect Schema expression such as `Schema.Struct({ claimId: ClaimId })` or `Schema.TaggedStruct("ContributorClaim", { personId: PersonId })`. Select **Apply schema** to save it, or clear the editor and apply to remove it. The expand button opens a larger editor with the same draft. Pipeline **Steps** shows a read-only view. Snippets are saved as source text. They use `Schema` from `effect` and the [shared schemas below](#shared-schemas). Lookup projections use `Schema.Record` with branded keys. Older canvases with JSON examples open with equivalent literal schema expressions.

Set **Architecture confidence** in the node sidebar. Every node starts as **Not reviewed** (`NOT_REVIEWED`). Use **Locked in** (`LOCKED_IN`) for settled decisions and **Uncertain** (`UNCERTAIN`) for ones you may revisit. The current status appears on the node card, and changes appear in **Git history**.

Locking a node records a fingerprint of its title, kind, event type, description, open questions and the example schema. Edits you make in the sidebar keep it up to date. If the content changes any other way, for example through the JSON API, the card shows **Changed** and the sidebar asks you to review it in **Git history**. Choose **Accept changes** to fingerprint the current content. Nodes locked before fingerprints existed show **Unverified** until you accept them. Moving a node or changing its confidence doesn't count as a change.

An **Uncertain** node needs **Open questions**: a Markdown field, separate from the description, for what's still undecided. Until it has some, the card shows **No questions** and `/flow` lists the node under `warnings`. Saving still works, so you can switch a node to **Uncertain** before writing them. **Steps** shows open questions under each description.

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

## Claims, provenance and contexts

A claim's **provenance** says who gave the information, and nothing else: a contributor (`CONTRIBUTOR`), an inference from a contributor's own publication (`INFERENCE`), or an external provider (`EXTERNAL_PROVIDER`).

### Shared schemas

Use named schemas in the snippets. Timestamps use `TimestampColumn` and optional fields use `OptionalColumn`, from `packages/domain/src/common/primitives.ts`. App-owned language fields and lookup keys use `SupportedLanguage`. Provider responses keep their original language codes.

```ts
import { Schema } from "effect"
import {
  ExternalDataObservationId as ObservationId,
  GbifTaxonId as GbifTaxonIdentifier,
  GrammaticalGender,
  InformationVisibility,
  MediaAssetId,
  OptionalColumn,
  PersonId,
  PublicationId,
  SupportedLanguage,
  TimestampColumn,
  WhosOnFirstId,
  WikiArticleId as ArticleId,
  WikidataId as WikidataIdentifier,
} from "@gororobas/domain"
import { ClaimReportId as ReportId } from "@gororobas/domain/claim-based-architecture-experiment/claim-reports"
import { ClaimId } from "@gororobas/domain/claim-based-architecture-experiment/provenance"
import { WikidataPropertyId } from "@gororobas/domain/claim-based-architecture-experiment/providers/wikidata"

const GbifTaxonId = GbifTaxonIdentifier.pipe(Schema.brand("GbifTaxonId"))
const WikidataId = WikidataIdentifier.pipe(Schema.brand("WikidataId"))
const PlaceArticleId = ArticleId.pipe(Schema.brand("PlaceArticleId"))
const ProfileContextId = Schema.NonEmptyString.pipe(Schema.brand("ProfileContextId"))
const ArticlePath = Schema.NonEmptyString.pipe(Schema.brand("ArticlePath"))
const EvaluationId = Schema.NonEmptyString.pipe(Schema.brand("EvaluationId"))
const PersonReportId = Schema.NonEmptyString.pipe(Schema.brand("PersonReportId"))
const ObservationValueKey = Schema.NonEmptyString.pipe(Schema.brand("ObservationValueKey"))
const GbifChecklistKey = Schema.NonEmptyString.pipe(Schema.brand("GbifChecklistKey"))
const GbifDatasetKey = Schema.NonEmptyString.pipe(Schema.brand("GbifDatasetKey"))
const GbifOccurrenceKey = Schema.Int.pipe(Schema.brand("GbifOccurrenceKey"))
const WikidataRevisionId = Schema.Int.pipe(Schema.brand("WikidataRevisionId"))
const WikidataStatementId = Schema.NonEmptyString.pipe(Schema.brand("WikidataStatementId"))

const ClaimProvenance = Schema.TaggedUnion({
  CONTRIBUTOR: { personId: PersonId },
  INFERENCE: { personId: PersonId, publicationId: PublicationId },
  EXTERNAL_PROVIDER: { provider: Schema.NonEmptyString, observationId: ObservationId },
})

const PersonReportProvenance = Schema.TaggedUnion({
  PERSON: { reporterId: PersonId },
  AUTOMATED_SIGNAL: {
    detector: Schema.NonEmptyString,
    detectorVersion: Schema.NonEmptyString,
    evidence: Schema.NonEmptyString,
  },
})

const WikidataSelectionProvenance = Schema.Struct({
  kind: Schema.Literal("CLAIM"),
  claimId: ClaimId,
})

const GbifSelectionProvenance = Schema.Union([
  Schema.Struct({
    ...WikidataSelectionProvenance.fields,
    evaluationId: OptionalColumn(EvaluationId),
  }),
  Schema.Struct({
    kind: Schema.Literal("WIKIDATA"),
    wikidataId: WikidataId,
  }),
])
```

The GBIF and Wikidata ID claims use `ClaimProvenance.cases.CONTRIBUTOR`. Selection provenance records which claim or Wikidata item supplied the chosen provider ID.

### Claim contexts

A claim's **context** says where its value holds, in a shape each claim type chooses: a place article, a profile context, or text in the contributor's words. Some claims have none, such as a GBIF taxon ID. To place a field, ask whether it would still be true if someone else made the same claim. If it would, it describes the value and belongs to the claim. If it wouldn't, it describes who said it and belongs to the provenance.

A **profile context** is an entry of a profile's timeline: where and how a person lives and produces over a period. It's made of **dimensions**, and location is one of them. A dimension is **measured** (an elevation from the device's geolocation, a climate dataset) or **declared** ("we're at about 1,200 m", the kind of production). A profile context never changes. When something changes, the person starts a new one, so claims stay anchored on the context they were made in. Claims point to contexts instead of copying their dimensions, so a new dimension or dataset reaches every older claim.

**Affinity** is how close a claim's context is to the reader's. Each dimension compares itself and explains the difference ("same rainfall pattern, 4 °C cooler"), and there's no overall score. It's computed when someone reads, never stored, and it ranks and annotates claims without hiding any. Each property declares its **relevant dimensions**, the ones affinity uses. Plant and animal properties default to climate and elevation.

## Working with a canvas from an agent

Each file in `canvases/` contains a whole graph. Node IDs are stable and edges reference them directly. Use the local JSON API to make live changes with validation and stale-write detection.

| Request | Purpose |
| --- | --- |
| `GET /api/canvases` | List IDs, titles and fork origins. |
| `GET /api/canvases/:id` | Read the editable `canvas` and its current `revision`. |
| `GET /api/canvases/:id/flow` | Read node inputs, outputs, validation errors, warnings and topological order. |
| `GET /api/canvases/:id/history?ref=HEAD` | Read the canvas at a Git ref and the last 12 commits on `HEAD` for its path. |
| `POST /api/canvases` | Send `{ "title": "New canvas" }` and optionally `"from": "<source id>"` to fork. |
| `PUT /api/canvases/:id` | Send `{ "revision": "...", "canvas": { ... } }`, keeping IDs stable and updating the nodes or edges. |

Use `http://127.0.0.1:4561` and send `Content-Type: application/json` and `X-Wiki-Explorations: 1` with writes. Re-read after a `409` and reconcile changes against the latest revision. Don't write `lockedContentHash`: only the person reviewing the canvas accepts changes to a locked node. Give every `UNCERTAIN` node `openQuestions`. Invalid graphs return `422` with an explanation. Reload an open browser canvas to see edits made by an agent.
