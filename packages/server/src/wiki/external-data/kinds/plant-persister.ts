import { type ExternalDataFetchRequest, type PlantExternalDataResult } from "@gororobas/domain"
import { Effect, Result, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import { persist } from "../persist-utils.js"

// @todo refactor SqlSchema definitions to reuse existing schemas
const insertExternalLink = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: Schema.String,
    locale: Schema.String,
    url: Schema.String,
  }),
  execute: (link) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_article_external_links ${sql.insert(link)}`
    }),
})

const insertTaxonomyGroup = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: Schema.String,
    gbifTaxonId: Schema.String,
    taxonomyGroup: Schema.NullOr(Schema.String),
  }),
  execute: (group) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_plant_taxonomy_group ${sql.insert(group)}`
    }),
})

const insertTaxonomyClassification = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: Schema.String,
    taxonId: Schema.String,
    scientificName: Schema.String,
    taxonRank: Schema.String,
  }),
  execute: (classification) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_plant_taxonomy_classification ${sql.insert(classification)} ON CONFLICT DO NOTHING`
    }),
})

const insertExternalMedia = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: Schema.String,
    mediaUrl: Schema.String,
    sourceUrl: Schema.String,
    creditLine: Schema.String,
    licenseUrl: Schema.NullOr(Schema.String),
  }),
  execute: (media) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_article_external_media ${sql.insert(media)} ON CONFLICT DO NOTHING`
    }),
})

export const persistPlant = (request: ExternalDataFetchRequest, data: PlantExternalDataResult) =>
  persist(
    request,
    Effect.gen(function* () {
      const wikiArticleId = request.wikiArticleId
      const { wikidata, gbif } = data.attributes

      if (wikidata !== null) {
        yield* Effect.forEach(
          wikidata.wikipediaLinks,
          (link) => insertExternalLink({ wikiArticleId, ...link }),
          { discard: true, concurrency: 1 },
        )
      }

      if (gbif === null || Result.isFailure(gbif)) return

      const taxon = gbif.success
      yield* insertTaxonomyGroup({
        wikiArticleId,
        gbifTaxonId: taxon.gbifTaxonId,
        taxonomyGroup: taxon.taxonomyGroup,
      })

      yield* Effect.forEach(
        taxon.classification,
        (classification) => insertTaxonomyClassification({ wikiArticleId, ...classification }),
        { discard: true, concurrency: 1 },
      )

      yield* Effect.forEach(
        taxon.media,
        (media) => insertExternalMedia({ wikiArticleId, ...media }),
        { discard: true, concurrency: 1 },
      )
    }),
  )
