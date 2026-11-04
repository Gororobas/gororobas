/**
 * Turns gazetteer places into PLACE wiki articles the first time something references them, so
 * the places people filter by and the places they write about are the same articles.
 */
import {
  createCrdtListItemId,
  GazetteerPlaceNotFoundError,
  type PlaceEditableArticle,
  SupportedLanguage,
  SystemCommit,
  WhosOnFirstId,
  WikiArticleId,
} from "@gororobas/domain"
import { Context, Array as EffectArray, Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { WikiArticlesRepository } from "../wiki/repository.js"
import { Gazetteer, type GazetteerPlaceRecord } from "./gazetteer.js"

/** Bump when the articles created from gazetteer places change shape. */
export const PLACE_FROM_GAZETTEER_VERSION = "2026-11-01.1" as const

export const placeFromGazetteerCommit = SystemCommit.make({
  workflowName: "PlaceFromGazetteer",
  workflowVersion: PLACE_FROM_GAZETTEER_VERSION,
})

export const findPlaceArticleId = SqlSchema.findOneOption({
  Request: WhosOnFirstId,
  Result: Schema.Struct({ wikiArticleId: WikiArticleId }),
  execute: (whosOnFirstId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT wiki_article_id FROM place_projections WHERE whos_on_first_id = ${whosOnFirstId}`,
    ),
})

const placeArticle = (record: GazetteerPlaceRecord): PlaceEditableArticle => {
  const translation = (language: SupportedLanguage) => ({
    commonNames: [
      {
        id: createCrdtListItemId(),
        name: record.namesByLanguage[language] ?? record.name,
        grammaticalGender: Option.none(),
      },
    ] as const,
    content: Option.none(),
  })

  return {
    kind: "PLACE",
    attributes: {
      placeKind: Option.some(record.placeKind),
      whosOnFirstId: Option.some(record.id),
      wikidataId: record.wikidataId,
      geonamesId: record.geonamesId,
    },
    translations: { pt: translation("pt"), es: translation("es"), en: translation("en") },
  }
}

/** @effect-expect-leaking SqlClient */
export class PlacesService extends Context.Service<PlacesService>()("PlacesService", {
  make: Effect.gen(function* () {
    const gazetteer = yield* Gazetteer
    const wikiArticles = yield* WikiArticlesRepository
    const sql = yield* SqlClient.SqlClient

    const findRecord = (id: WhosOnFirstId) =>
      gazetteer.findRecord(id).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new GazetteerPlaceNotFoundError({ id })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const ensureOne = (record: GazetteerPlaceRecord) =>
      Effect.gen(function* () {
        const existing = yield* findPlaceArticleId(record.id)
        if (Option.isSome(existing)) return existing.value.wikiArticleId

        return yield* wikiArticles
          .createWikiArticleWithCommit({
            wikiArticle: placeArticle(record),
            status: "PUBLISHED",
            commit: placeFromGazetteerCommit,
          })
          .pipe(
            // Gazetteer places always make valid articles: failing to create one is a bug.
            Effect.catchTag(["InvalidCrdtUpdateError", "WikiArticleNotFoundError"], Effect.die),
          )
      })

    /**
     * The place's article, created along with its ancestors' (country first) when missing.
     * Runs in the caller's transaction when there is one, so a failed reference creates nothing.
     */
    const ensurePlaceArticle = Effect.fn("places.ensurePlaceArticle")(
      function* (id: WhosOnFirstId) {
        const record = yield* findRecord(id)

        // The country first, so every place's parent exists before it.
        yield* Effect.forEach(
          EffectArray.reverse(record.ancestorIds),
          (ancestorId) => Effect.flatMap(findRecord(ancestorId), ensureOne),
          { concurrency: 1, discard: true },
        )

        return yield* ensureOne(record)
      },
      (_) => sql.withTransaction(_),
    )

    return { ensurePlaceArticle }
  }),
}) {}
