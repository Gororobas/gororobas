import {
  HumanCommit,
  modifyLoroDocWithCommit,
  type EventSourceData,
  type NoteSourceData,
  type PersonId,
} from "@gororobas/domain"
import { Effect } from "effect"
import { LoroDoc, VersionVector } from "loro-crdt"
import { Mirror } from "loro-mirror"

import { EventSourceDataLoro, NoteSourceDataLoro } from "./post-loro.lib.js"

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
  initialDoc,
  updateData,
  personId,
}: {
  initialDoc: LoroDoc
  updateData: (current: NoteSourceData | EventSourceData) => NoteSourceData | EventSourceData
  personId: PersonId
}) {
  const updated = updateData(initialDoc.toJSON())
  const updatedDoc = yield* modifyLoroDocWithCommit({
    initialDoc,
    commit: HumanCommit.makeUnsafe({
      personId,
    }),
    schema: NoteSourceDataLoro,
    // @TODO find a better way to type this
    newData: updated as any,
  })

  return {
    crdt_update: updatedDoc.export({
      from: initialDoc.version(),
      mode: "update",
    }),
    doc: updatedDoc,
  }
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
