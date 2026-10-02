import {
  ExternalLink,
  ExternalMedia,
  GbifPlantResult,
  GbifClassification,
  WikiArticleId,
  type ExternalDataFetchRequest,
  type PlantExternalDataResult,
} from "@gororobas/domain"
import { Effect, Result, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import { persist } from "../persist-utils.js"

const insertExternalLink = SqlSchema.void({
  Request: ExternalLink.mapFields(Struct.assign({ wikiArticleId: WikiArticleId })),
  execute: (link) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_article_external_links ${sql.insert(link)}`
    }),
})

const insertTaxonomyGroup = SqlSchema.void({
  Request: GbifPlantResult.mapFields(Struct.pick(["gbifTaxonId", "taxonomyGroup"])).mapFields(
    Struct.assign({ wikiArticleId: WikiArticleId }),
  ),
  execute: (group) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_plant_taxonomy_group ${sql.insert(group)}`
    }),
})

const insertTaxonomyClassification = SqlSchema.void({
  Request: GbifClassification.mapFields(Struct.assign({ wikiArticleId: WikiArticleId })),
  execute: (classification) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_plant_taxonomy_classification ${sql.insert(classification)} ON CONFLICT DO NOTHING`
    }),
})

const insertExternalMedia = SqlSchema.void({
  Request: ExternalMedia.mapFields(Struct.assign({ wikiArticleId: WikiArticleId })),
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
