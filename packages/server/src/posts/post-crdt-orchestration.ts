import {
  createLoroDocFromData,
  type CrdtCommit,
  modifyLoroDocWithCommit,
  LoroDocFrontier,
  LoroDocSnapshot,
  PostSourceDataStorageLoro,
  loroDocToSnapshot,
  loroDocToUpdate,
  sourcePostDataToCrdtStorage,
  snapshotToLoroDoc,
  type SourcePostData,
} from "@gororobas/domain"
import { Effect } from "effect"

export const createPostSnapshot = (sourceData: SourcePostData) => {
  const sourceDoc = createLoroDocFromData(
    sourcePostDataToCrdtStorage(sourceData),
    PostSourceDataStorageLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}

export const evolvePostSnapshot = (params: {
  commit: CrdtCommit
  nextSourceData: SourcePostData
  snapshot: LoroDocSnapshot
}) =>
  Effect.gen(function* () {
    const currentDoc = snapshotToLoroDoc(params.snapshot)
    const currentFrontier = LoroDocFrontier.make(currentDoc.frontiers())

    const nextDoc = yield* modifyLoroDocWithCommit({
      commit: params.commit,
      initialDoc: currentDoc,
      newData: sourcePostDataToCrdtStorage(params.nextSourceData),
      schema: PostSourceDataStorageLoro,
    })

    return {
      commit: params.commit,
      crdtUpdate: nextDoc.export({
        from: currentDoc.version(),
        mode: "update",
      }),
      fromCrdtFrontier: currentFrontier,
      nextFrontier: LoroDocFrontier.make(nextDoc.frontiers()),
      nextSnapshot: loroDocToSnapshot(nextDoc),
      sourceData: params.nextSourceData,
    } as const
  })
