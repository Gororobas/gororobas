/**
 * Turns gazetteer places into PLACE wiki articles the first time something references them, so
 * the places people filter by and the places they write about are the same articles. Each one
 * points at its parent's article (a municipality at its state's, a state at its country's), and
 * no gazetteer place ever gets a second article.
 */
import {
  createCrdtListItemId,
  GazetteerPlaceNotFoundError,
  IdGen,
  type PlaceEditableArticle,
  SupportedLanguage,
  SystemCommit,
  WhosOnFirstId,
  WikiArticleId,
  WikiArticleWikidataIdTakenError,
  WikidataId,
} from "@gororobas/domain"
import { Context, Array as EffectArray, Effect, Option, Schema } from "effect"
import { SqlClient, SqlError, SqlSchema } from "effect/sql"

import { WikiArticlesRepository } from "../wiki/repository.js"
import { Gazetteer, type GazetteerPlaceRecord } from "./gazetteer.js"

/** Bump when the articles created from gazetteer places change shape. */
export const PLACE_FROM_GAZETTEER_VERSION = "2026-11-03.1" as const

export const placeFromGazetteerCommit = SystemCommit.make({
  workflowName: "PlaceFromGazetteer",
  workflowVersion: PLACE_FROM_GAZETTEER_VERSION,
})

/**
 * The PLACE article for a gazetteer place: the one created from it, or else one about the same
 * Wikidata entity, which someone may have written before anyone referenced the gazetteer place.
 */
export const findPlaceArticleId = SqlSchema.findOneOption({
  Request: Schema.Struct({
    whosOnFirstId: WhosOnFirstId,
    wikidataId: Schema.NullOr(WikidataId),
  }),
  Result: Schema.Struct({ wikiArticleId: WikiArticleId }),
  execute: ({ whosOnFirstId, wikidataId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT wiki_article_id FROM place_projections
        WHERE whos_on_first_id = ${whosOnFirstId} OR wikidata_id = ${wikidataId}
        ORDER BY CASE WHEN whos_on_first_id = ${whosOnFirstId} THEN 0 ELSE 1 END
        LIMIT 1
      `,
    ),
})

const placeArticle = (
  record: GazetteerPlaceRecord,
  parentPlaceId: Option.Option<WikiArticleId>,
): PlaceEditableArticle => {
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
      parentPlaceId,
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

    /** Parents first, so every article created from the gazetteer points at its parent's. */
    const ensure = (
      id: WhosOnFirstId,
    ): Effect.Effect<
      WikiArticleId,
      | GazetteerPlaceNotFoundError
      | Schema.SchemaError
      | SqlError.SqlError
      | WikiArticleWikidataIdTakenError,
      IdGen
    > =>
      Effect.gen(function* () {
        const record = yield* findRecord(id)
        const existing = yield* findPlaceArticleId({
          whosOnFirstId: record.id,
          wikidataId: Option.getOrNull(record.wikidataId),
        })
        if (Option.isSome(existing)) return existing.value.wikiArticleId

        const parentPlaceId = yield* Effect.transposeOption(
          Option.map(EffectArray.head(record.ancestorIds), ensure),
        )

        return yield* wikiArticles
          .createWikiArticleWithCommit({
            wikiArticle: placeArticle(record, parentPlaceId),
            status: "PUBLISHED",
            commit: placeFromGazetteerCommit,
          })
          .pipe(
            // Gazetteer places always make valid articles: failing to create one is a bug.
            Effect.catchTag(["InvalidCrdtUpdateError", "WikiArticleNotFoundError"], Effect.die),
          )
      }).pipe(Effect.provideService(SqlClient.SqlClient, sql))

    /**
     * The place's article, created along with its ancestors' when missing.
     * Runs in the caller's transaction when there is one, so a failed reference creates nothing.
     */
    const ensurePlaceArticle = (id: WhosOnFirstId) =>
      ensure(id).pipe(sql.withTransaction, Effect.withSpan("places.ensurePlaceArticle"))

    return { ensurePlaceArticle }
  }),
}) {}
