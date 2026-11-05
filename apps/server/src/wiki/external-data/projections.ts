import {
  type ExternalDataFetchRequest,
  ExternalDataInputs,
  type ExternalDataProvider,
  LoroDocFrontier,
} from "@gororobas/domain"
import { Effect, Match, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { findDatabaseRowById } from "../queries.js"
import { buildExternalDataRequest } from "./inputs.js"

/** Removes what a provider's earlier fetch projected, before its new result replaces it. */
export const clearProviderExternalData = Effect.fn(function* (
  wikiArticleId: string,
  provider: typeof ExternalDataProvider.Type,
) {
  const sql = yield* SqlClient.SqlClient

  yield* Match.value(provider).pipe(
    Match.when(
      "WIKIDATA",
      () => sql`DELETE FROM wiki_article_external_links WHERE wiki_article_id = ${wikiArticleId}`,
    ),
    Match.when("GBIF", () =>
      Effect.all(
        [
          sql`DELETE FROM wiki_article_external_media WHERE wiki_article_id = ${wikiArticleId}`,
          sql`DELETE FROM wiki_plant_taxonomy_classification WHERE wiki_article_id = ${wikiArticleId}`,
          sql`DELETE FROM wiki_plant_taxonomy_group WHERE wiki_article_id = ${wikiArticleId}`,
        ],
        { concurrency: 1, discard: true },
      ),
    ),
    Match.when("GOOGLE_BOOKS", () =>
      Effect.all(
        [
          sql`DELETE FROM wiki_book_edition_languages WHERE wiki_article_id = ${wikiArticleId}`,
          sql`DELETE FROM wiki_book_editions WHERE wiki_article_id = ${wikiArticleId}`,
        ],
        { concurrency: 1, discard: true },
      ),
    ),
    Match.exhaustive,
  )
})

const inputsEquivalence = Schema.toEquivalence(ExternalDataInputs)

// Cluster interruption does not roll back activities already in flight.
export const persist = <E, R>(
  request: ExternalDataFetchRequest,
  project: Effect.Effect<void, E, R | SqlClient.SqlClient>,
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const article = yield* findDatabaseRowById(request.wikiArticleId)
      if (Option.isNone(article)) {
        return yield* Effect.logWarning("Discarding external data: the article no longer exists")
      }

      const current = buildExternalDataRequest(article.value)

      if (
        !Schema.toEquivalence(LoroDocFrontier)(
          current.articleCrdtFrontier,
          request.articleCrdtFrontier,
        )
      ) {
        return yield* Effect.logInfo(
          "Discarding external data fetched for an earlier version of the article",
        )
      }

      // A request can carry inputs its article doesn't have (callers build requests by hand).
      if (!inputsEquivalence(current.inputs, request.inputs)) {
        return yield* Effect.logInfo(
          "Discarding external data fetched with IDs the article doesn't have",
        )
      }

      yield* project
    }).pipe(sql.withTransaction),
  )
