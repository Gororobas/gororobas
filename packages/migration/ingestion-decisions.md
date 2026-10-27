# Application ingestion

- 2026-10-13: Finish normal server startup before ingestion; verify real HTTP reads against frozen exports and a fresh Gel export. Run workspace quality gates; do not commit.
- Import into the replaceable server application database through its normal migrations. Keep stable mapped IDs and reconstructed wiki history. Skip import-triggered translation/enrichment; register all workflows on normal startup.
- Keep the existing account activity filter. Exclude accounts without email, archive their source records and associated content, and exclude their publications. Preserve shared wiki content/history. Keep private notes in the archive.
- Gel profile `d8c5fecc-064d-11f0-ab0d-831c2c5fa029` receives `fred@gororobas.com` and remains included. Its 14 plant edits and 15 images initially appeared to belong to an account that needed exclusion.
- Henrique (Gel profile `02b81d06-1927-11ef-9ba8-1f058bdea354`, user `f131f047-e21e-4e6a-87f2-1c4badcb35ab`) is the fallback creator. Buganvília instead belongs to Angie (Gel profile `5e66878a-1929-11ef-bd5a-07926f01b7d1`, user `c55e21c0-c9af-475c-a67c-ded200e93607`). Require revision authors; fail on unresolved actual edit authors and preserve source attribution in reports.
- Use email magic links only. Migrate retained accounts' vegetable bookmarks, including all four statuses; report unresolved targets.
- Download all original media into a persistent cache and prepare filesystem originals/derivatives with the server media service. Reuse the cache on subsequent runs.
- Startup surprise: importing the OpenTelemetry barrel loads an unavailable browser dependency. Use the specific logger module. Tags and publication search currently return empty arrays and need persisted reads.

- Mandatory wiki revision authors require contributor deletion to anonymize the account and retain its ID. The user chose anonymization: erase personal fields and credentials, revoke sessions, hide the profile, and preserve shared wiki history.
- Sanity includes SVG originals; prepare AVIF derivatives and sandbox SVG originals when serving them. Partial first-run downloads remain reusable.

- Fresh ingestion exposed 13 publication images present only in embedded Sanity references, absent from Gel's Image table. Recover their explicit IDs/provenance, cache the originals, and attach rich-text media to publications/wiki articles. Profile-photo access follows profile visibility.
- Preserve cached originals and ID mappings, rebuild converted collections on fresh exports to remove deleted records/old handles, and recover only embedded media referenced by retained content.
- Normal shutdown now disposes shared SQL/cluster services before exiting; SQLite sidecars disappear and subsequent replacement succeeds.
- Verified live Gel export + ingestion and frozen ingestion: 433 plants, 80 cultivars, 99 resources, 333 publications, 40 tags, 6 accounts, 431 media assets, 672 attributed revisions, 83 bookmarks; no unresolved actors/bookmark targets. Repeat migration downloaded/prepared zero media files.
- Normal-server verification passed 4,300 HTTP checks: every wiki page/history, tags/profiles, public publication ID/handle/history reads, 414 public media originals plus all four derivatives, community access denial, and missing records. Integration tests cover migrated-account magic-link login, bookmark ownership, cache reuse, excluded publications, and failure leaving the application database intact.
