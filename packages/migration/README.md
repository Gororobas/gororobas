# Gel → application database

From the workspace root, with the server stopped and the existing Gel connection configured:

```sh
pnpm --filter @gororobas/migration migrate
```

This exports live Gel data, rebuilds converted collections, imports through the server's normal SQLite migrations/repositories, validates history and foreign keys, then replaces `apps/server/gororobas.db`. A previous database is copied to a `.before-migration-*` backup. An unsuccessful data import leaves the existing application database intact. SQLite sidecars on an existing target cause an error: stop the application before replacing it.

To separate export from ingestion, or rerun frozen conversions without contacting Gel:

```sh
pnpm --filter @gororobas/migration migrate --export-only
pnpm --filter @gororobas/migration ingest
```

`ingest` accepts an optional export-directory argument; the default is `packages/migration/debug`. Both commands use `APP_DB_FILENAME`, `MEDIA_ASSETS_DIRECTORY`, and `MIGRATION_MEDIA_CACHE_DIRECTORY` when set. Use absolute paths to share overrides with the server; its package command resolves relative paths from `apps/server`. Defaults place the database and media under `apps/server` and the download cache under the export directory.

Originals are downloaded once from Sanity. Media preparation uses the server service to publish originals and all four AVIF sizes atomically. Successful preparation records are reused when all files are still present. Missing derivatives are regenerated from the cached original. Embedded Sanity references without a Gel image row are recovered as media assets and reported separately. Rich-text references, article photos/thumbnails, publication attachments, and profile photos are accessible according to application policies. SVG originals are served with a sandbox content-security policy.

Account inclusion retains the existing activity filter. Accounts without email are excluded, except the explicit Fred email override. Excluded accounts and their referenced source content are preserved in each run's `excluded-accounts.json`; excluded converted publications and author overrides are in `ingestion-policy.json`. Private notes remain in `journal.json`. Henrique is the fallback article creator, with the explicit Angie override for buganvília. Actual edits with unresolved authors fail import. Revision authors are mandatory; reconstructed CRDT commits and SQL authors use the same attribution. Retained users' bookmarks preserve all four source states, including “not interested.”

Each run under `debug/sqlite/migration-*` contains frozen converted data, raw Gel data, provenance, schema, database, `verification.json`, and `application.json`. These local artifacts contain private source data and are ignored by Git. Workflow submission is skipped during ingestion.

After configuring and starting the [normal server](../../apps/server/README.md), verify the imported data over HTTP:

```sh
pnpm --filter @gororobas/migration verify:apis
```

`MIGRATION_API_ORIGIN` defaults to `http://127.0.0.1:4000`. `MIGRATION_API_REPORT_FILENAME` optionally saves the report. Verification decodes API responses with domain schemas, checks every article and its history (Gel tags become CONCEPT articles), public profiles, publications by ID/handle and their histories, public media originals and all derivatives, community access denial, and missing-record responses. Automated integration tests additionally sign in a migrated account through magic links and read its bookmarks.

See [the compact decision/surprise log](ingestion-decisions.md). The independent [preview viewer](preview/README.md) remains available through `preview:sqlite`; its synthetic account and metadata-only media are for preview use.
