import { Effect, FileSystem, Path, Result, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelNoteWithRelations, NoteDataForMigration } from "../schemas/gel/entities.js"
import { gelNoteToPublication } from "./gel-note-to-publication.js"

const notesQuery = `
  select Note {
    *,
    created_by: { id, handle, name },
    related_to_vegetables: { id, handle, names },
    related_to_notes: { id, handle },
  }
`

export const sourceGelNotes = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gelClient = yield* GelClient
  const notes = yield* gelClient
    .use((client) => client.query(notesQuery))
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(GelNoteWithRelations))))
  const directory = path.join(import.meta.dirname, "..", "..", "debug", "notes")
  yield* fs.makeDirectory(directory, { recursive: true })
  const privateNotes = notes.filter(
    (note) => (note.publish_status ?? (note.public ? "PUBLIC" : "PRIVATE")) === "PRIVATE",
  )
  const journalDirectory = path.join(import.meta.dirname, "..", "..", "debug", "journal")
  yield* fs.makeDirectory(journalDirectory, { recursive: true })
  const journalJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(Schema.Array(GelNoteWithRelations), { space: 2 }),
  )(privateNotes)
  yield* fs.writeFileString(path.join(journalDirectory, "notes.json"), journalJson)
  // Remove earlier publication exports only after the journal archive is safely written.
  yield* Effect.forEach(
    privateNotes,
    (note) => fs.remove(path.join(directory, `${note.handle}.json`), { force: true }),
    { concurrency: 1 },
  )
  const publicationNotes = notes.filter((note) => !privateNotes.includes(note))
  const conversions = yield* Effect.forEach(
    publicationNotes,
    (note) =>
      Effect.gen(function* () {
        const converted = yield* gelNoteToPublication(note).pipe(Effect.result)
        const data = Result.match(converted, {
          onSuccess: (publication) => ({
            latest_source: note,
            publication,
            conversion_error: null,
          }),
          onFailure: (error) => ({
            latest_source: note,
            publication: null,
            conversion_error: error.message,
          }),
        })
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(NoteDataForMigration, { space: 2 }),
        )(data)
        yield* fs.writeFileString(path.join(directory, `${note.handle}.json`), encoded)
        return Result.isSuccess(converted)
      }),
    { concurrency: 1 },
  )
  const successful = conversions.filter(Boolean).length
  yield* Effect.log(
    `Exported ${notes.length} Gel notes: ${successful} publications converted, ${publicationNotes.length - successful} conversion failures retained, ${privateNotes.length} journal notes archived`,
  )
})
