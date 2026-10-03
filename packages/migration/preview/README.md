# Migration preview

From the repository root:

```sh
pnpm --filter @gororobas/migration migrate
pnpm --filter @gororobas/migration preview
pnpm --filter @gororobas/migration test:preview
```

Open http://127.0.0.1:5173. To use a different port, run `PORT=5174 pnpm --filter @gororobas/migration preview`. The preview uses plain HTML/JavaScript and Node's HTTP server, with no new dependencies. It reads migration JSON on each reload and binds only to loopback.

The actual migration CLI exports and converts Gel data. The viewer serves plants, cultivars, resources, publications, tags and a sanitized reference catalogue. It excludes account exports and private journal notes. Conversion failures remain explicit. UI rendering does not replace schema validation.

## Inspecting references and history

Select a collection and search for a record. Migrated UUID links open a reference inspector with the original Gel ID, entity type, label and a link to the target article when available. Image references display the Sanity asset. Missing source records are marked explicitly rather than silently dropped or fabricated.

Publications contain `PostSourceData` with owner, handle, original publication timestamp, visibility and Portuguese locale metadata. Titles and bodies are combined into content. Original note types become tags; private notes are archived separately in `debug/journal/notes.json`. Original relations remain alongside mapped tag and plant IDs.

Plants and resources have a version selector. Each version displays its timestamp, author/reviewer where recorded, semantic changes, actual LoroDoc diff and frontier. The attributes and converted content follow the selected version; the Gel column always shows the final original state. Photos and ancillary Gel data show the final source record. The migration generates Loro operations from reconstructed Gel states, so these diffs describe the migration timeline rather than original editing operations. Each version also exports a base64 Loro snapshot.

## Verified on 2026-10-02

- 433 plants, 80 cultivars, 99 resources and 333 publications; no rejected viewer files or publication conversion errors. Four private notes remain in the separate journal archive.
- 40 tags: 35 original tags plus the five note-type tags. Missing creation dates default to 2025-04-01 12:00:00 UTC.
- Persistent UUID v7 mappings live under `debug/id-mappings`; refreshes reuse mappings. Image Sanity aliases resolve stale embedded Gel image IDs to a canonical target ID.
- Plant origin is converted into `translations.pt.origin`, including historical changes. Cultivars use mapped parent plant IDs and preserve names/photos; traits without source data remain Unknown.
- Friendships/consortia are deliberately dropped and archived for 47 plants in `archives/plant-friendships.json`, outside gitignore. Plant source references remain in original JSON pending a target model.
- All 592 plant/resource Loro snapshots successfully replayed and decoded to their corresponding converted domain articles. All 333 publication records passed `PostSourceData` decoding. Current resource exports contain one available version each.
- A mention of the missing Gel profile Lipe retains a stable UUID and a visible missing-source warning. Embedded image records retain their original metadata alongside rewritten IDs.
- Resource creditLine, all 22 book author credits and URLs are retained. Five credited organisations retain attribution as content paragraphs. 96 thumbnails include Image records with Sanity IDs.
- Prior live comparisons covered avocado, pineapple and pumpkin in the [plant catalogue](https://gororobas.com/vegetais), A Queda do Céu, AS-PTA and podcasts in the [library](https://gororobas.com/biblioteca), and public notes in the [feed](https://gororobas.com/notas). Plant heights use centimeters; BROTO → SEEDLING for planting methods (edible parts use SPROUT) remains a semantic review item.

See [the conversion checklist](../CONVERSION-TODO.md) for remaining work. No SQLite import is performed by this preview workflow.
