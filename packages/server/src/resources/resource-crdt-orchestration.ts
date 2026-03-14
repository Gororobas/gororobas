import {
  createLoroDocFromData,
  type CrdtCommit,
  LoroDocFrontier,
  type LoroDocSnapshot,
  modifyLoroDocWithCommit,
  ResourceSourceDataStorageLoro,
  loroDocToSnapshot,
  loroDocToUpdate,
  sourceResourceDataToCrdtStorage,
  type SourceResourceData,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { Effect } from "effect"

export const createResourceSnapshot = (sourceData: SourceResourceData) => {
  const sourceDoc = createLoroDocFromData(
    sourceResourceDataToCrdtStorage(sourceData),
    ResourceSourceDataStorageLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.makeUnsafe(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}

export const evolveResourceSnapshot = (params: {
  commit: CrdtCommit
  nextSourceData: SourceResourceData
  snapshot: LoroDocSnapshot
}) =>
  Effect.gen(function* () {
    const currentDoc = snapshotToLoroDoc(params.snapshot)
    const currentFrontier = LoroDocFrontier.makeUnsafe(currentDoc.frontiers())

    const nextDoc = yield* modifyLoroDocWithCommit({
      commit: params.commit,
      initialDoc: currentDoc,
      newData: sourceResourceDataToCrdtStorage(params.nextSourceData),
      schema: ResourceSourceDataStorageLoro,
    })

    return {
      commit: params.commit,
      crdtUpdate: nextDoc.export({
        from: currentDoc.version(),
        mode: "update",
      }),
      fromCrdtFrontier: currentFrontier,
      nextFrontier: LoroDocFrontier.makeUnsafe(nextDoc.frontiers()),
      nextSnapshot: loroDocToSnapshot(nextDoc),
      sourceData: params.nextSourceData,
    } as const
  })
