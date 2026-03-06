import { Clock, Effect, Schema } from "effect"
import { LoroDoc, VersionVector } from "loro-crdt"
import { Mirror, SchemaType as LoroMirrorSchema, InferInputType } from "loro-mirror"

import {
  LoroDocUpdate,
  LoroDocFrontier,
  LoroDocSnapshot,
  CrdtCommit,
  CrdtCommitEncoded,
} from "../crdts/domain.js"

export function loroDocToSnapshot(doc: LoroDoc) {
  return doc.export({ mode: "snapshot" }) as LoroDocSnapshot
}

export function loroDocToUpdate(doc: LoroDoc) {
  return doc.export({
    from: new VersionVector(null),
    mode: "update",
  }) as LoroDocUpdate
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

export const modifyLoroDocWithCommit = Effect.fn("modifyLoroDocWithCommit")(function* <
  S extends LoroMirrorSchema,
>({
  initialDoc,
  schema,
  newData,
  commit,
}: {
  initialDoc: LoroDoc
  schema: S
  newData: InferInputType<S>
  commit: CrdtCommit
}) {
  const editedDoc = initialDoc.fork()
  const initialDocStore = new Mirror({
    doc: initialDoc,
    schema,
  })
  initialDocStore.setState(() => newData)
  initialDocStore.dispose()

  const diff = editedDoc.diff(initialDoc.frontiers(), editedDoc.frontiers())

  const cleanFinalDocument = initialDoc.fork()
  cleanFinalDocument.applyDiff(diff)

  cleanFinalDocument.commit({
    message: yield* Schema.encodeEffect(CrdtCommitEncoded)(commit),
    timestamp: yield* Clock.currentTimeMillis,
  })

  return cleanFinalDocument
})

export const EMPTY_LORO_DOC_FRONTIER = LoroDocFrontier.makeUnsafe([])
