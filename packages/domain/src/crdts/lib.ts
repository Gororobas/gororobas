import { Clock, Effect, Schema } from "effect"
import { LoroDoc, VersionVector } from "loro-crdt"
import { InferInputType, SchemaType as LoroMirrorSchema, Mirror } from "loro-mirror"

import {
  CrdtCommit,
  CrdtCommitEncoded,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
} from "../crdts/domain.js"
import { InvalidCrdtUpdateError } from "./errors.js"

export function loroDocToSnapshot(doc: LoroDoc) {
  return doc.export({ mode: "snapshot" })
}

export function loroDocToUpdate(doc: LoroDoc) {
  return doc.export({
    from: new VersionVector(null),
    mode: "update",
  })
}

export function snapshotToLoroDoc(crdtBlob: LoroDocSnapshot): LoroDoc {
  const doc = new LoroDoc()
  doc.import(crdtBlob)
  return doc
}

export function createLoroDocFromData(data: unknown, schema: LoroMirrorSchema): LoroDoc {
  const initialDoc = new LoroDoc()
  const initialDocStore = new Mirror({
    doc: initialDoc,
    schema,
  })
  initialDocStore.setState(() => data)

  const doc = initialDoc.fork()
  initialDocStore.dispose()
  return doc
}

/** Operates based on the JS object for the new data. For applying a `crdtUpdate`, use `applyCrdtUpdateWithCommit` */
export const modifyLoroDocWithCommit = Effect.fn("modifyLoroDocWithCommit")(function* <
  S extends LoroMirrorSchema,
>({
  initialDoc,
  loroMirrorSchema: schema,
  newData,
  commit,
}: {
  initialDoc: LoroDoc
  loroMirrorSchema: S
  newData: InferInputType<S>
  commit: CrdtCommit
}) {
  const editedDoc = initialDoc.fork()
  const editedDocStore = new Mirror({
    doc: editedDoc,
    schema,
  })
  editedDocStore.setState(() => newData)
  editedDocStore.dispose()

  const diff = editedDoc.diff(initialDoc.frontiers(), editedDoc.frontiers())

  const cleanFinalDocument = initialDoc.fork()
  cleanFinalDocument.applyDiff(diff)

  cleanFinalDocument.commit({
    message: yield* Schema.encodeEffect(CrdtCommitEncoded)(commit),
    timestamp: yield* Clock.currentTimeMillis,
  })

  return cleanFinalDocument
})

const applyUpdate = (crdt_update: Uint8Array<ArrayBufferLike>, sourceDocument: LoroDoc) =>
  Effect.try({
    try: () => {
      const forkedDoc = sourceDocument.fork()

      const importStatus = forkedDoc.import(crdt_update)
      if (!importStatus.success) throw new Error("Invalid CRDT update")

      return forkedDoc
    },
    catch: () => new InvalidCrdtUpdateError({ reason: "InvalidFormat" }),
  })

const validateSchema = <S extends Schema.Schema<any>>(
  updatedDoc: LoroDoc,
  targetSchema: S,
): Effect.Effect<S["Type"], InvalidCrdtUpdateError, never> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(targetSchema as never)(updatedDoc.toJSON()) as S["Type"],
    catch: () => new InvalidCrdtUpdateError({ reason: "SchemaValidation" }),
  })

export const parseCrdtUpdate = Effect.fn("parseCrdtUpdate")(function* <
  S extends Schema.Schema<any>,
>(props: { crdtUpdate: Uint8Array<ArrayBufferLike>; targetSchema: S; sourceDocument: LoroDoc }) {
  const updatedDoc = yield* applyUpdate(props.crdtUpdate, props.sourceDocument)
  const data = yield* validateSchema(updatedDoc, props.targetSchema)

  return { data, loroDoc: updatedDoc }
})

/**
 * Applies the update ignoring intermediary values stored in the CRDT edit history (for storage size and user privacy)
 */
export const applyCrdtUpdateWithCommit = Effect.fn("applyCrdtUpdateWithCommit")(function* <
  S extends Schema.Schema<any>,
>({
  commit,
  crdtUpdate,
  targetSchema,
  snapshot,
}: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  targetSchema: S
  snapshot: LoroDocSnapshot
}) {
  const currentDoc = snapshotToLoroDoc(snapshot)
  const { data, loroDoc: fullUpdatedDoc } = yield* parseCrdtUpdate<S>({
    crdtUpdate: crdtUpdate,
    sourceDocument: currentDoc,
    targetSchema,
  })

  const diff = fullUpdatedDoc.diff(currentDoc.frontiers(), fullUpdatedDoc.frontiers())

  // We could export the `update` snapshot from `editedDoc`, but then every intermediary update would be captured.
  // This mean bloat and potentially leaking private data (say a user accidentally pasted sensitive data in the form).
  // Instead, we generate a diff, which captures only the final updates, and then a apply it to a new, 3rd document.
  // Now, this 3rd document can export the CRDT update without any of the intermediary data in it.
  // Private in-betweens (only what the user explicitly chose to publish is included) and lean result.
  const cleanFinalDocument = currentDoc.fork()

  cleanFinalDocument.applyDiff(diff)

  // Include the commit message, encoded (stringified JSON)
  cleanFinalDocument.commit({
    message: yield* Schema.encodeEffect(CrdtCommitEncoded)(commit),
    timestamp: yield* Clock.currentTimeMillis,
  })

  return {
    cleanDoc: cleanFinalDocument,
    crdtUpdate: cleanFinalDocument.export({
      from: currentDoc.version(),
      mode: "update",
    }),
    data,
    fromCrdtFrontier: LoroDocFrontier.make(currentDoc.frontiers()),
    nextCrdtFrontier: LoroDocFrontier.make(cleanFinalDocument.frontiers()),
    nextSnapshot: loroDocToSnapshot(cleanFinalDocument),
  } as const
})

/** @todo is this needed? */
export const rebuildLoroDocFromUpdates = Effect.fn("rebuildLoroDocFromUpdates")(function* (params: {
  updates: ReadonlyArray<LoroDocUpdate>
}) {
  const rebuiltDoc = new LoroDoc()

  for (const update of params.updates) {
    const importStatus = rebuiltDoc.import(update)
    if (!importStatus.success) {
      return yield* Effect.fail(new InvalidCrdtUpdateError({ reason: "InvalidFormat" }))
    }
  }

  return {
    currentCrdtFrontier: LoroDocFrontier.make(rebuiltDoc.frontiers()),
    doc: rebuiltDoc,
    snapshot: loroDocToSnapshot(rebuiltDoc),
  } as const
})

export const EMPTY_LORO_DOC_FRONTIER = LoroDocFrontier.make([])
