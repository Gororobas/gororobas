import {
  WikiArticleId,
  ImageId,
  WikiArticleEditableTranslations,
  WikiBookArticle,
  WikiFilmArticle,
  WikiNoteworthyEntityArticle,
  WikiResourceArticle,
} from "@gororobas/domain"
import { Effect, Match, Record, Schema } from "effect"

import { migrateRichText } from "../migrate-rich-text.js"
import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import { MigrationContext } from "../services/migration-context.js"
import { gelVegetableNamesToCrdtList as stringsToCrdtList } from "../vegetables/gel-vegetable-to-wiki-plant-article.js"
import { WikiMigrationVersion } from "../wiki-migration-history.js"

export const ResourceWikiArticle = Schema.Union([
  WikiBookArticle.EditableArticle,
  WikiFilmArticle.EditableArticle,
  WikiNoteworthyEntityArticle.EditableArticle,
  WikiResourceArticle.EditableArticle,
])
export type ResourceWikiArticle = typeof ResourceWikiArticle.Type

export const ResourceAuditLog = Schema.Struct({
  id: Schema.String,
  timestamp: Schema.Date,
  action: Schema.String,
  performed_by: Schema.NullOr(Schema.Struct({ id: Schema.String })),
  old: Schema.Unknown,
  new: Schema.Unknown,
})
export const ResourceDataForMigration = Schema.Struct({
  id: WikiArticleId,
  thumbnailId: Schema.NullOr(ImageId),
  versions: Schema.Array(WikiMigrationVersion),
  auditLogs: Schema.Array(ResourceAuditLog),
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

const organizationEntityTypesByHandle: Record<
  string,
  | "MOVEMENT"
  | "NETWORK"
  | "NONPROFIT"
  | "MEDIA_ORGANIZATION"
  | "RESEARCH_ORGANIZATION"
  | "PUBLIC_AGENCY"
> = {
  mcp: "MOVEMENT",
  "instituto-mapinguari-e5efced9": "NONPROFIT",
  serta: "NONPROFIT",
  "em-pratos-limpos": "MEDIA_ORGANIZATION",
  "o-joio-e-o-trigo": "MEDIA_ORGANIZATION",
  "teia-dos-povos": "NETWORK",
  fpsan: "NETWORK",
  "grupo-aue": "RESEARCH_ORGANIZATION",
  mst: "MOVEMENT",
  conaq: "NETWORK",
  "campesena-93aa3ca3": "PUBLIC_AGENCY",
  "la-via-campesina": "NETWORK",
  "centro-sabia": "NONPROFIT",
  "combate-racismo-ambiental-95da2209": "MEDIA_ORGANIZATION",
  "ctazm-mg": "NONPROFIT",
  mpa: "MOVEMENT",
  mmc: "MOVEMENT",
  rama: "NETWORK",
  cepeas: "RESEARCH_ORGANIZATION",
  "de-olho-nos-ruralistas": "MEDIA_ORGANIZATION",
  aspta: "NONPROFIT",
  "rede-mg": "NETWORK",
  "muda-floresta": "NONPROFIT",
  ana: "NETWORK",
}

export const gelResourceToWikiArticle = Effect.fn("gelResourceToWikiArticle")(function* (
  source: GelResourceWithRelations,
) {
  const context = yield* MigrationContext
  const tagIds = yield* Effect.forEach(source.tags, ({ id }) => context.resolveId(id, "Tag"), {
    concurrency: 1,
  })
  const tags = Record.fromEntries(tagIds.map((id) => [id, true] as const))

  // Organisations have no creditLine attribute; retain attribution in their content.
  const description =
    source.format === "ORGANIZATION" && source.credit_line
      ? {
          type: "doc" as const,
          version: 1 as const,
          content: [
            ...(source.description?.content ?? []),
            {
              type: "paragraph",
              content: [{ type: "text", text: `Créditos: ${source.credit_line}` }],
            },
          ],
        }
      : source.description

  // Round-about way of using the encoded version of the translation in the decode calls below
  const translationsEncoded = yield* Schema.decodeEffect(WikiArticleEditableTranslations)({
    pt: {
      commonNames: stringsToCrdtList([source.title]),
      content: description ? yield* migrateRichText(description) : description,
      grammaticalGender: null,
    },
  }).pipe(Effect.flatMap(Schema.encodeEffect(WikiArticleEditableTranslations)))

  const article = yield* Match.type<GelResourceWithRelations>().pipe(
    Match.withReturnType<Effect.Effect<ResourceWikiArticle, Schema.SchemaError>>(),
    Match.when({ format: "BOOK" }, () =>
      Schema.decodeEffect(WikiBookArticle.EditableArticle)({
        kind: "BOOK",
        translations: translationsEncoded,
        attributes: {
          authors: source.credit_line ? stringsToCrdtList([source.credit_line]) : undefined,
          url: source.url,
          tags,
        },
      }),
    ),
    Match.when({ format: "FILM" }, () =>
      Schema.decodeEffect(WikiFilmArticle.EditableArticle)({
        kind: "FILM",
        translations: translationsEncoded,
        attributes: {
          tags,
        },
      }),
    ),
    Match.when({ format: "ORGANIZATION" }, () =>
      Schema.decodeEffect(WikiNoteworthyEntityArticle.EditableArticle)({
        kind: "NOTEWORTHY_ENTITY",
        translations: translationsEncoded,
        attributes: {
          entityType: organizationEntityTypesByHandle[source.handle] ?? "OTHER",
          url: source.url,
          tags,
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
          attributes: {
            format: genericResourceFormatMap[s.format],
            url: s.url,
            creditLine: s.credit_line ?? undefined,
            tags,
          },
          translations: translationsEncoded,
        }),
    ),
    Match.exhaustive,
  )(source)

  return article
})
