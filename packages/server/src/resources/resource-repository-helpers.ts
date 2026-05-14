import {
  LoroDocFrontier,
  LoroDocUpdate,
  PersonId,
  ResourceId,
  ResourceRevisionId,
  RevisionEvaluation,
  SourceResourceData,
  createLoroDocFromData,
  sourceResourceDataToCrdtStorage,
  ResourceSourceDataStorageLoro,
  loroDocToUpdate,
  loroDocToSnapshot,
} from "@gororobas/domain"
import { Schema } from "effect"

/** @todo shouldn't these schemas live in resources/domain? */
export const CreateResourceInput = Schema.Struct({
  createdById: PersonId,
  sourceData: SourceResourceData,
})
export type CreateResourceInput = typeof CreateResourceInput.Type

export const CreateResourceRevisionInput = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  createdById: PersonId,
  resourceId: ResourceId,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type CreateResourceRevisionInput = typeof CreateResourceRevisionInput.Type

export const EvaluateResourceRevisionInput = Schema.Struct({
  revisionId: ResourceRevisionId,
  evaluatedById: PersonId,
  evaluation: RevisionEvaluation,
})
export type EvaluateResourceRevisionInput = typeof EvaluateResourceRevisionInput.Type

export const createResourceSnapshot = (sourceData: SourceResourceData) => {
  const sourceDoc = createLoroDocFromData(
    sourceResourceDataToCrdtStorage(sourceData),
    ResourceSourceDataStorageLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}
