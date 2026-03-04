import type { EventSourceData, NoteSourceData, PersonId } from "@gororobas/domain"
import { Clock, Effect, Schema } from "effect"
import { LoroDoc, VersionVector } from "loro-crdt"
import { Mirror } from "loro-mirror"

import { EventSourceDataLoro, NoteSourceDataLoro } from "./post-loro.lib.js"

const CommitMessage = Schema.Union(
  Schema.Struct({
    person_id: Schema.String,
    type: Schema.Literal("human-action"),
  }),
  Schema.Struct({
    reason: Schema.String,
    type: Schema.Literal("system-cleanup"),
  }),
  Schema.Struct({
    model: Schema.String,
    type: Schema.Literal("ai-translation"),
  }),
)

export function createDocFromNoteData(data: NoteSourceData): LoroDoc {
  const initialDoc = new LoroDoc()
  const initialDocStore = new Mirror({
    doc: initialDoc,
    schema: NoteSourceDataLoro,
  })
  initialDocStore.setState(() => data as any)
  return initialDoc
}

export function createDocFromEventData(data: EventSourceData): LoroDoc {
  const initialDoc = new LoroDoc()
  const initialDocStore = new Mirror({
    doc: initialDoc,
    schema: EventSourceDataLoro,
  })
  initialDocStore.setState(() => data as any)
  return initialDoc
}

export const editPostDoc = Effect.fn("editPostDoc")(function* ({
  initial_doc,
  updateData,
  person_id,
}: {
  initial_doc: LoroDoc
  updateData: (current: NoteSourceData | EventSourceData) => NoteSourceData | EventSourceData
  person_id: PersonId
}) {
  const editedDoc = initial_doc.fork()

  const editStore = new Mirror({
    doc: editedDoc,
    schema: NoteSourceDataLoro,
  })

  editStore.setState((current) => updateData(current as any) as any)

  const diff = editedDoc.diff(initial_doc.frontiers(), editedDoc.frontiers())

  const cleanFinalDocument = initial_doc.fork()

  cleanFinalDocument.applyDiff(diff)

  cleanFinalDocument.commit({
    message: Schema.encodeSync(Schema.parseJson(CommitMessage))({
      person_id: person_id,
      type: "human-action",
    }),
    timestamp: yield* Clock.currentTimeMillis,
  })

  const toReturn = {
    crdt_update: cleanFinalDocument.export({
      from: initial_doc.version(),
      mode: "update",
    }),
    doc: cleanFinalDocument,
  }

  return toReturn
})

export function exportSnapshot(doc: LoroDoc): Uint8Array {
  return doc.export({ mode: "snapshot" })
}

export function exportUpdate(doc: LoroDoc): Uint8Array {
  return doc.export({
    from: new VersionVector(null),
    mode: "update",
  })
}

export function importDoc(crdtBlob: Uint8Array): LoroDoc {
  const doc = new LoroDoc()
  doc.import(crdtBlob)
  return doc
}
