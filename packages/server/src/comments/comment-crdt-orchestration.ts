import {
  CommentSourceDataStorageLoro,
  createLoroDocFromData,
  type CrdtCommit,
  modifyLoroDocWithCommit,
  LoroDocFrontier,
  LoroDocSnapshot,
  loroDocToSnapshot,
  loroDocToUpdate,
  sourceCommentDataToCrdtStorage,
  type SourceCommentData,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { Effect } from "effect"

export const createCommentSnapshot = (sourceData: SourceCommentData) => {
  const sourceDoc = createLoroDocFromData(
    sourceCommentDataToCrdtStorage(sourceData),
    CommentSourceDataStorageLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.makeUnsafe(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}

export const evolveCommentSnapshot = (params: {
  commit: CrdtCommit
  nextSourceData: SourceCommentData
  snapshot: LoroDocSnapshot
}) =>
  Effect.gen(function* () {
    const currentDoc = snapshotToLoroDoc(params.snapshot)
    const currentFrontier = LoroDocFrontier.makeUnsafe(currentDoc.frontiers())

    const nextDoc = yield* modifyLoroDocWithCommit({
      commit: params.commit,
      initialDoc: currentDoc,
      newData: sourceCommentDataToCrdtStorage(params.nextSourceData),
      schema: CommentSourceDataStorageLoro,
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
