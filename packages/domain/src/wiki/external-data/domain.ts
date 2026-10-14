import { Schema } from "effect"

import { ExternalDataObservationId, WikiArticleId } from "../../common/ids.js"
import { LoroDocFrontier } from "../../crdts/domain.js"
import { ExternalDataProvider, Observation } from "./common.js"
import { ExternalDataFetchError } from "./error.js"
import { BookExternalDataInputs, BookExternalDataResult } from "./kinds/book-external-data.js"
import { PlantExternalDataInputs, PlantExternalDataResult } from "./kinds/plant-external-data.js"

export * from "./common.js"
export * from "./kinds/book-external-data.js"
export * from "./kinds/plant-external-data.js"

export const ExternalDataResult = Schema.Union([
  PlantExternalDataResult,
  BookExternalDataResult,
]).pipe(Schema.toTaggedUnion("kind"))
export type ExternalDataResult = typeof ExternalDataResult.Type

export const ExternalDataInputs = Schema.Union([
  PlantExternalDataInputs,
  BookExternalDataInputs,
  Schema.Struct({ kind: Schema.Literal("NONE") }),
]).pipe(Schema.toTaggedUnion("kind"))

export type ExternalDataInputs = typeof ExternalDataInputs.Type

export const ExternalDataFetchRequest = Schema.Struct({
  wikiArticleId: WikiArticleId,
  articleCrdtFrontier: LoroDocFrontier,
  inputs: ExternalDataInputs,
  refreshGeneration: Schema.optional(Schema.String),
})

export type ExternalDataFetchRequest = typeof ExternalDataFetchRequest.Type

export const ExternalDataObservation = Schema.Struct({
  id: ExternalDataObservationId,
  wikiArticleId: WikiArticleId,
  provider: ExternalDataProvider,
  observedAt: Schema.DateTimeUtcFromString,
  articleCrdtFrontier: LoroDocFrontier,
  inputs: ExternalDataInputs,
  outcome: Schema.Result(Schema.Array(Observation), ExternalDataFetchError),
})

export type ExternalDataObservation = typeof ExternalDataObservation.Type
