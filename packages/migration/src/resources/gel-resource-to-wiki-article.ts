import {
  WikiArticleEditableTranslations,
  WikiBookArticle,
  WikiFilmArticle,
  WikiNoteworthyEntityArticle,
  WikiResourceArticle,
} from "@gororobas/domain"
import { Effect, Match, Schema } from "effect"

import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import { gelVegetableNamesToCrdtList } from "../vegetables/gel-vegetable-to-wiki-plant-article.js"

export const ResourceWikiArticle = Schema.Union([
  WikiBookArticle.EditableArticle,
  WikiFilmArticle.EditableArticle,
  WikiNoteworthyEntityArticle.EditableArticle,
  WikiResourceArticle.EditableArticle,
])
export type ResourceWikiArticle = typeof ResourceWikiArticle.Type

export const ResourceDataForMigration = Schema.Struct({
  latest_source: GelResourceWithRelations,
  article: ResourceWikiArticle,
})
export type ResourceDataForMigration = typeof ResourceDataForMigration.Type

const genericResourceFormatMap = {
  ACADEMIC_WORK: "ACADEMIC_WORK",
  ARTICLE: "ARTICLE",
  COURSE: "COURSE",
  DATASET: "DATASET",
  OTHER: "OTHER",
  PODCAST: "PODCAST",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  VIDEO: "VIDEO",
} as const

export const gelResourceToWikiArticle = Effect.fn("gelResourceToWikiArticle")(function* (
  source: GelResourceWithRelations,
) {
  // Round-about way of using the encoded version of the translation in the decode calls below
  const translationsEncoded = yield* Schema.decodeEffect(WikiArticleEditableTranslations)({
    pt: {
      commonNames: gelVegetableNamesToCrdtList([source.title]),
      content: source.description,
      grammaticalGender: null,
    },
  }).pipe(Effect.flatMap(Schema.encodeEffect(WikiArticleEditableTranslations)))

  const article = yield* Match.type<GelResourceWithRelations>().pipe(
    Match.withReturnType<Effect.Effect<ResourceWikiArticle, Schema.SchemaError>>(),
    Match.when({ format: "BOOK" }, () =>
      Schema.decodeEffect(WikiBookArticle.EditableArticle)({
        kind: "BOOK",
        translations: translationsEncoded,
        attributes: {}, // @todo add URL to book attributes
      }),
    ),
    Match.when({ format: "FILM" }, () =>
      Schema.decodeEffect(WikiFilmArticle.EditableArticle)({
        kind: "FILM",
        translations: translationsEncoded,
        attributes: {}, // @todo add URL to film attributes
      }),
    ),
    Match.when({ format: "ORGANIZATION" }, () =>
      Schema.decodeEffect(WikiNoteworthyEntityArticle.EditableArticle)({
        kind: "NOTEWORTHY_ENTITY",
        translations: translationsEncoded,
        attributes: {
          entityType: "OTHER", // @todo can we parse this?
          url: source.url,
          names: gelVegetableNamesToCrdtList([source.title]), // @todo remove `names` from WikiNoteworthyEntityArticle, already covered in translations
        },
      }),
    ),
    Match.whenOr(
      { format: "ACADEMIC_WORK" },
      { format: "ARTICLE" },
      { format: "COURSE" },
      { format: "DATASET" },
      { format: "OTHER" },
      { format: "PODCAST" },
      { format: "SOCIAL_MEDIA" },
      { format: "VIDEO" },
      (s) =>
        Schema.decodeEffect(WikiResourceArticle.EditableArticle)({
          kind: "RESOURCE",
          attributes: { format: genericResourceFormatMap[s.format], url: s.url },
          translations: translationsEncoded,
        }),
    ),
    Match.exhaustive,
  )(source)

  return article
})
