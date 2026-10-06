import {
  applyCrdtUpdateWithCommit,
  createLoroDocFromData,
  type CrdtCommit,
  InvalidCrdtUpdateError,
  Locale,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PublicationSourceDataStorage,
  PublicationSourceDataStorageLoro,
  PublicationSourceData,
  SystemCommit,
  TiptapDocument,
  loroDocToSnapshot,
  loroDocToUpdate,
  publicationSourceDataStorageToSourcePublicationData,
  sourcePublicationDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { Mirror } from "loro-mirror"

/** @todo pretty sure this is vibe slop and is not needed */
const decodePublicationStorageDataEffect = (storageData: PublicationSourceDataStorage) =>
  Effect.try({
    try: () => publicationSourceDataStorageToSourcePublicationData(storageData),
    catch: () => new InvalidCrdtUpdateError({ reason: "SchemaValidation" }),
  })

export const createPublicationSnapshot = (sourceData: PublicationSourceData) => {
  const sourceDoc = createLoroDocFromData(
    sourcePublicationDataToCrdtStorage(sourceData),
    PublicationSourceDataStorageLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}

/** @todo pretty sure this is vibe slop and is not needed */
export const applyPublicationCrdtUpdateWithCommit = (params: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  Effect.gen(function* () {
    const applied = yield* applyCrdtUpdateWithCommit({
      commit: params.commit,
      crdtUpdate: params.crdtUpdate,
      snapshot: params.snapshot,
      targetSchema: PublicationSourceDataStorage,
    })

    const sourceData = yield* decodePublicationStorageDataEffect(applied.data)

    return {
      ...applied,
      sourceData,
    } as const
  })

/** @todo split the update method in the publications repository to have the translation update be a dedicated function */
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
      try: () => Schema.decodeUnknownSync(PublicationSourceDataStorage)(currentDoc.toJSON()),
      catch: () => new InvalidCrdtUpdateError({ reason: "SchemaValidation" }),
    })
    const currentSourceData = yield* decodePublicationStorageDataEffect(currentStorageData)
    const nextSourceData = PublicationSourceData.make({
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
      schema: PublicationSourceDataStorageLoro,
    })

    nextDocStore.setState(() => sourcePublicationDataToCrdtStorage(nextSourceData))
    nextDocStore.dispose()

    return nextDoc.export({
      from: currentDoc.version(),
      mode: "update",
    })
  })
