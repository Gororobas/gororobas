# Syntropedia data

[Syntropedia](https://syntropedia.forests4farming.org) is Forests4Farming's catalogue of plants for
syntropic agroforestry. It has no API yet, so its web app's offline catalogue (IndexedDB) stands in
for one. The claim-based experiment reads these plants through
`packages/domain/src/claim-based-architecture-experiment/providers/syntropedia.ts`.

| File | What it is |
| --- | --- |
| `dump-indexed-db.js` | Browser console script that dumps the catalogue |
| `syntropedia-indexed-db.json` | The raw dump: Syntropedia's own field names, minus inlined thumbnails |
| `normalize.ts` | Turns the dump into `SyntropediaPlant`s |
| `syntropedia-plants.json` | The normalized plants: what extractors read |

## Refetching

1. Sign in at https://syntropedia.forests4farming.org with an account that has premium access
   (free accounts get fewer plants: check `total_allowed_assets` in the dump's `manifests`).
2. Wait for the catalogue to sync: the home page lists every plant, or in the console
   `JSON.parse(localStorage.syntropedia).asset_catalog_total` matches the plant count. "Sincronizar
   dados" in the profile menu forces a sync.
3. Paste `dump-indexed-db.js` into the devtools console. It downloads
   `syntropedia-indexed-db.json`; move it into this folder.
4. Run `pnpm --filter @gororobas/server syntropedia:normalize` and read its warnings. An
   unrecognized label means Syntropedia added a category: map it in `normalize.ts` (and, if it's
   lumped, in `providers/syntropedia.ts`) instead of letting it drop.

Comparing `revisions` in `syntropedia-plants.json` before and after tells whether anything changed.

## How the app stores it

- Flutter app, everything in one [Hive](https://pub.dev/packages/hive) box: IndexedDB database
  `syntropedia`, store `box`. Values are Hive binary frames, decoded by the script.
- `catalog_assets:<userId>:<tier>` holds every plant. It isn't per language: switching the app's
  language only changes `nome_popular`, which `common_name_translations` already has in `en`,
  `pt-br`, `es`, `fr`, `de` and `sw`. Category values are always stored in English, and the free
  text (`comment`) is English only. One dump is every language.
- `tested_location_profiles` repeats the plant once per site it was tested in; only the site and
  `nurse_mother_tree` differ, so they become `testedSites` with their roles.
- Always empty, and dropped: `descritivo`, `sistema`, `origem`, `bioma_origem`, `estados_ocorrencia`,
  `tipo_vegetacao`, `umidade`, `epoca_colheita`, `info_complementar`, `fonte`, `priority`.
  `tamanho_copa` duplicates `crown_diameter_m`.
- Images are served from `https://api.sintropedia.org/api/asset/<id>/image?size=main`, credited in
  `foto_fonte` (mostly iNaturalist photos via GBIF).

## Normalization choices

- Ranges are meters. A single number is the maximum ("30": up to 30 m); values above 150 m are
  typos ("1020" for "10-20") and are reported, not guessed.
- Strata spanning two of ours ("Medium-High") list both.
- "Toxicity Warning" isn't a function: it's `hasToxicityWarning`, explained by `comment`.
- "syn. scientific name: …" in comments becomes `scientificNameSynonyms`.
- Names are split on commas and keep Syntropedia's title case ("Marmelada-De-Cachorro").
