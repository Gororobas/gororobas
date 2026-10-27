# Wiki external data

Approved article edits submit `FetchArticleExternalData/v2`. Provider failures are non-fatal
and are recorded in `wiki_article_external_data_observations`, with the article frontier,
inputs, timestamp, provider, and typed outcome. Successful observations retain the raw provider
responses. Only a successful provider result replaces its own projections; failures and skipped
providers preserve existing data. A successful empty response removes that provider's old rows.
Stale article frontiers are rejected before observations or projections are written.

The refresher scans at startup and every hour. `EXTERNAL_DATA_REFRESH_TIME` defaults to `14 days`;
failed providers are eligible again after one hour. It selects at most 25 published articles with
an external ID per scan, oldest first. Articles without Wikidata/Google Books IDs are skipped.
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
selections, external projections and observations, bookmarks, references, and cultivars. It is
denied in production. “Reload stored data” rereads the database; it does not submit a fetch.
