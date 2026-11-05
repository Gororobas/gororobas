# Wiki external data

## Layout

- `workflow.ts` and `refresh.ts`: when fetches run. `inputs.ts` builds a fetch request from an
  article's identifiers.
- `kinds/`: per kind, a fetcher (calls `services/`) and a persister.
- `observations.ts`: records each provider's outcome. It owns the stored JSON format: outcomes
  are written with the schema's JSON codec, `{ "_tag": "Success", "success": [...] }` or
  `{ "_tag": "Failure", "failure": {...} }`, which SQL filters with `json_extract` rely on.
- `projections.ts`: the frontier guard every persister runs in, and clearing a provider's rows.
- `queries.ts`: reads. An article's page carries its external data (`findExternalData`, read by
  the wiki's page query); provider photos come first in `wiki_article_external_media.order_index`
  order, and the first stands in for cards' and pages' main photo while the article has none.
- `admin-dashboard.ts`: the observation log at `/external-data/observations`, for people with
  `content:moderate`. The web app shows it at `/dados-externos`.
- `report.ts`: per-article summaries for the CLI and the debug page.

Approved article edits submit `FetchArticleExternalData/v3`. Provider failures are non-fatal
and are recorded in `wiki_article_external_data_observations`, with the article frontier,
inputs, timestamp, provider, and typed outcome. Successful observations retain the raw provider
responses. Only a successful provider result replaces its own projections; failures and skipped
providers preserve existing data. A successful empty response removes that provider's old rows.
Stale article frontiers, and results fetched with IDs the article no longer has, are rejected
before observations or projections are written.

A book without a volume ID is fetched by its ISBNs (ISBN-13 first): the fetcher searches
`isbn:` and fetches the first volume whose industry identifiers list that ISBN. When none does,
the result is successful and empty.

The refresher scans at startup and every hour. `EXTERNAL_DATA_REFRESH_TIME` defaults to `14 days`;
failed providers are eligible again after one hour. It selects at most 25 published articles with
an external ID per scan, oldest first: a Wikidata ID for plants, and a Google Books volume ID or
an ISBN for books. Other articles are skipped.
Provider clients pace and retry requests. A scan failure does not terminate the scheduler.

Effect Cluster stores completed workflow results durably, so an unchanged article/frontier key
does not perform a new fetch just because time has passed. Scheduled executions add the latest
observation ID and UTC hour to their key. Repeated scans within that hour deduplicate; the next
hour can retry even if database persistence failed before an observation was stored. The workflow
version changed because the activity result schemas changed.

`GET /wiki/books/id-suggestions?title=Futuro%20ancestral` returns up to ten Google Books volume
IDs with titles, authors, publisher/date/language, ISBNs, and source links. It uses the title as the
query for [Google Books search](https://developers.google.com/books/docs/v1/using#PerformingSearch).
Search does not select or assign an edition. Configure `GOOGLE_BOOKS_API_KEY` for project quota;
provider errors are returned as HTTP 502 with a typed `ExternalDataFetchError`.

The web app links search results to `/wiki/:wikiArticleId/debug`. Its development-only API at
the same path returns canonical CRDT data, projections/translations/handles, revisions, media
selections, external projections and observations, an `externalDataReport` (per provider:
observations, failures, the latest outcome and error; and the stored row counts), bookmarks,
references, and cultivars. It is
denied in production. “Reload stored data” rereads the database; it does not submit a fetch.

## Visibility

Every provider request runs in an `ExternalData.request` span (provider, endpoint without its
query, response status) inside the workflow's `ExternalData.fetchArticle` span; failures log a
warning with the endpoint and message. Persistence logs each observation (provider and source
URLs, or the error), what it stored, and why it discarded a result (article deleted, or fetched for
an earlier frontier). Logs carry the `wikiArticleId` annotation. A response that doesn't match a
provider schema keeps the start of the decoding issue in its stored error message.

## Running over migrated data

The legacy migration supplies the IDs: reviewed Wikidata IDs for plants, and ISBNs or a Google
Books volume ID found in book URLs (see `packages/migration/README.md`). The external-data CLI
runs fetches against the database in `APP_DB_FILENAME` (stop any API using it first):

```sh
pnpm --filter @gororobas/server external-data run --plants 40 --books 30 --output run.json
pnpm --filter @gororobas/server external-data report --article <wikiArticleId>
```

`run` executes `FetchArticleExternalData` in process with the real providers, using each
article's own IDs and ISBNs, and prints per article and provider what was requested, observed and
stored. Articles aren't edited. `report` summarizes what's already stored. Spans reach Maple when
it listens on `127.0.0.1:4318`.

To try it on a disposable copy of migrated data:

```sh
APP_DB_FILENAME="$PWD/apps/server/data/migrated-enrichment/gororobas.db" MEDIA_ASSETS_DIRECTORY="$PWD/apps/server/data/migrated-enrichment/media-assets" pnpm --filter @gororobas/migration ingest
APP_DB_FILENAME=data/migrated-enrichment/gororobas.db pnpm --filter @gororobas/server external-data run
```
