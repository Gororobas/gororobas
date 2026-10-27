import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { ApplicationRoute } from './route'

export const CatalogStatus = Schema.Literals(['Idle', 'Loading', 'Ready'])

export const PaintingStatus = defineTaggedUnion({
  Idle: {},
  Loading: { paintingId: Schema.Number },
  Ready: { paintingId: Schema.Number },
})

export const LoggedTransition = Schema.Struct({
  sequenceNumber: Schema.Number,
  maybePreviousRoute: Schema.Option(ApplicationRoute),
  nextRoute: ApplicationRoute,
})

export const Model = Schema.Struct({
  route: ApplicationRoute,
  transitionLog: Schema.Array(LoggedTransition),
  catalogStatus: CatalogStatus,
  paintingStatus: PaintingStatus,
  studioDraft: Schema.String,
  maybeSavedDraft: Schema.Option(Schema.String),
})
