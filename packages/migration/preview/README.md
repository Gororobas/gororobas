# Migration preview

From the repository root:

```sh
pnpm --filter @gororobas/migration migrate
SQLITE_PREVIEW_DIRECTORY=/absolute/path/printed/by/migrate pnpm --filter @gororobas/migration preview
pnpm --filter @gororobas/migration test:preview
```

Open http://127.0.0.1:5173. To use a different port, run `PORT=5174 pnpm --filter @gororobas/migration preview`. The preview uses plain HTML/JavaScript and an Effect HTTP router. It opens the imported database read-only through the server's Effect SQL client and binds only to loopback. JSON artifacts supply the original Gel data and provenance; article/publication data, wiki history and relations are read back from SQLite on each reload.

The actual migration CLI exports and converts Gel data. The viewer serves plants, cultivars, resources, publications, tags and a sanitized reference catalogue. It excludes account exports and private journal notes. Conversion failures remain explicit. UI rendering does not replace schema validation.

## Inspecting references and history

Select a collection and search for a record. Migrated UUID links open a reference inspector with the original Gel ID, entity type, label and a link to the target article when available. Image references display the Sanity mediaAsset. Missing source records are marked explicitly rather than silently dropped or fabricated.

Publications contain `PostSourceData` with owner, handle, original publication timestamp, visibility and Portuguese locale metadata. Titles and bodies are combined into content. Original note types become tags; private notes are archived separately in `debug/journal/notes.json`. Original relations remain alongside mapped tag and plant IDs.

Plants and resources have a version selector. Each version displays its timestamp, author/reviewer where recorded, semantic changes, actual LoroDoc diff and frontier. The attributes and converted content follow the selected version; the Gel column always shows the final original state. Photos and ancillary Gel data show the final source record. The migration generates Loro operations from reconstructed Gel states, so these diffs describe the migration timeline rather than original editing operations. Each version also exports a base64 Loro snapshot.

## Verified on 2026-10-02

- 433 plants, 80 cultivars, 99 resources and 333 publications; no rejected viewer files or publication conversion errors. Four private notes remain in the separate journal archive.
- 40 tags: 35 original tags plus the five note-type tags. Missing creation dates default to 2025-04-01 12:00:00 UTC.
- Persistent UUID v7 mappings live under `debug/id-mappings`; refreshes reuse mappings. Image Sanity aliases resolve stale embedded Gel image IDs to a canonical target ID.
- Plant origin is converted into `translations.pt.origin`, including historical changes. Cultivars use mapped parent plant IDs and preserve names/photos; traits without source data remain Unknown.
- Friendships/consortia are deliberately dropped and archived for 47 plants in `archives/plant-friendships.json`, outside gitignore. Plant source references are archived in `archives/plant-sources.json` and intentionally omitted from the target model.
- All 592 plant/resource Loro snapshots successfully replayed and decoded to their corresponding converted domain articles. All 333 publication records passed `PostSourceData` decoding. Current resource exports contain one available version each.
- A mention of the missing Gel profile Lipe retains a stable UUID and a visible missing-source warning. Entity references retain insertion labels as fallbacks. Media grids store ordered media asset references and preserve YouTube provider IDs; original image metadata remains in the raw Gel archive.
- Resource creditLine, all 22 book author credits and URLs are retained. Five credited organisations retain attribution as content paragraphs. 96 thumbnails include Image records with Sanity IDs.
- Prior live comparisons covered avocado, pineapple and pumpkin in the [plant catalogue](https://gororobas.com/vegetais), A Queda do Céu, AS-PTA and podcasts in the [library](https://gororobas.com/biblioteca), and public notes in the [feed](https://gororobas.com/notas). Plant heights use centimeters; BROTO → SEEDLING for planting methods (edible parts use SPROUT) remains a semantic review item.

## Complete SQLite preview

`migrate` now captures the original Gel query results before decoding or filtering, converts the records, and imports them into a fresh `debug/sqlite/migration-*/` directory. It leaves previous preview databases intact.

Each completed directory contains:

- `raw-gel/`: unfiltered Gel query results, including records that conversion excludes or cannot decode.
- `raw.json`: original source records associated with each converted export.
- `converted.json`: frozen converted exports, including reconstructed wiki timelines.
- `preview.sqlite`: application tables created directly from `packages/server/src/db/schema.sql`.
- `schema.sql`, `references.json`, `journal.json`, and `verification.json`: the exact DDL, reference catalogue, private-note archive and import report.

To import existing frozen exports without querying Gel:

```sh
pnpm --filter @gororobas/migration preview:sqlite
```

The first optional argument selects the export directory (default `debug`); the second selects the output parent (default `debug/sqlite`). Old snapshots that no longer match the current CRDT schema fail validation; regenerate them with `migrate`.

The importer shares the server's SQL driver and name transformations. It uses the wiki and publication repositories for CRDT creation, materialization, translations and routes, retains mapped IDs, persists reconstructed wiki revisions, and imports accounts/profiles/people, tags, media asset metadata/credits and article/publication relations. The database import is one transaction with foreign keys enabled. Failed imports roll back and have no `verification.json`; the reader refuses to serve them. The importer validates historical snapshots against converted articles, decodes stored media assets, and checks SQLite integrity and foreign keys.

Accounts use their profile ID because the server's `people.id` references both tables. A missing email uses an explicit `migration-<profile-id>@example.invalid` address, listed in the report. Unresolved historical authors/reviewers remain null in the database and are listed in `unresolvedActors`; the original references remain in the JSON artifacts. Tag names are retained unchanged for each supported locale. Four private notes remain in the journal archive rather than becoming publications.

MediaAsset rows retain dimensions from Sanity IDs and have null storage fields until originals are copied to the VPS. This bulk data preview uses CDN images and does not download originals. Wiki enrichment is skipped during import.

```sh
SQLITE_PREVIEW_DIRECTORY=/absolute/path/to/debug/sqlite/migration-XXXXXX pnpm --filter @gororobas/migration preview
```

Verified on 2026-10-03 against Gel: 433 plants, 80 cultivars, 99 resources, 333 publications, 40 tags, 6 users, 418 media assets and 672 approved wiki revisions. Foreign key and integrity checks passed, and every public collection was read back through Effect SQL. One account has no source email, and one historical author is unresolved.

`test:preview` checks persisted history independently of conversion JSON, read-only HTTP routes and transactional rollback on invalid media asset references. `pnpm run quality-gates` runs all workspace checks.

See [the conversion checklist](../CONVERSION-TODO.md) for remaining work.
