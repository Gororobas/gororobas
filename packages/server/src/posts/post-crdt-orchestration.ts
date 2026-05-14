import {
  applyCrdtUpdateWithCommit,
  createLoroDocFromData,
  type CrdtCommit,
  InvalidCrdtUpdateError,
  Locale,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PostSourceDataStorage,
  PostSourceDataStorageLoro,
  PostSourceData,
  SystemCommit,
  TiptapDocument,
  loroDocToSnapshot,
  loroDocToUpdate,
  postSourceDataStorageToSourcePostData,
  sourcePostDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { Mirror } from "loro-mirror"

/** @todo pretty sure this is vibe slop and is not needed */
const decodePostStorageDataEffect = (storageData: PostSourceDataStorage) =>
  Effect.try({
    try: () => postSourceDataStorageToSourcePostData(storageData),
    catch: () => new InvalidCrdtUpdateError({ reason: "SchemaValidation" }),
  })

export const createPostSnapshot = (sourceData: PostSourceData) => {
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

/** @todo pretty sure this is vibe slop and is not needed */
export const applyPostCrdtUpdateWithCommit = (params: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  Effect.gen(function* () {
    const applied = yield* applyCrdtUpdateWithCommit({
      commit: params.commit,
      crdtUpdate: params.crdtUpdate,
      snapshot: params.snapshot,
      targetSchema: PostSourceDataStorage,
    })

    const sourceData = yield* decodePostStorageDataEffect(applied.data)

    return {
      ...applied,
      sourceData,
    } as const
  })

/** @todo split the update method in the posts repository to have the translation update be a dedicated function */
export const createSystemTranslationCrdtUpdate = (params: {
  expectedCurrentCrdtFrontier: LoroDocFrontier
  snapshot: LoroDocSnapshot
  sourceLocale: Locale
  targetLocale: Locale
  translatedContent: TiptapDocument
  commit: SystemCommit
}) =>
  Effect.gen(function* () {
    const currentDoc = snapshotToLoroDoc(params.snapshot)
    const currentStorageData = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(PostSourceDataStorage)(currentDoc.toJSON()),
      catch: () => new InvalidCrdtUpdateError({ reason: "SchemaValidation" }),
    })
    const currentSourceData = yield* decodePostStorageDataEffect(currentStorageData)
    const nextSourceData = PostSourceData.make({
      ...currentSourceData,
      locales: {
        ...currentSourceData.locales,
        [params.targetLocale]: {
          content: params.translatedContent,
          originalLocale: params.sourceLocale,
          translatedAtCrdtFrontier: params.expectedCurrentCrdtFrontier,
          translationSource: "AUTOMATIC",
        },
      },
    })

    const nextDoc = currentDoc.fork()
    const nextDocStore = new Mirror({
      doc: nextDoc,
      schema: PostSourceDataStorageLoro,
    })

    nextDocStore.setState(() => sourcePostDataToCrdtStorage(nextSourceData))
    nextDocStore.dispose()

    return nextDoc.export({
      from: currentDoc.version(),
      mode: "update",
    })
  })
