import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'

import { Note, NoteId, Notebook, NotebookId } from './domain'

const NotebooksAsyncData = AsyncData.Schema(S.Array(Notebook), S.String)
const NotebookAsyncData = AsyncData.Schema(Notebook, S.String)
const NotesAsyncData = AsyncData.Schema(S.Array(Note), S.String)
const NoteAsyncData = AsyncData.Schema(Note, S.String)

export const Model = S.Struct({
  // ...
  notebooks: NotebooksAsyncData.schema,
  notebookById: S.HashMap(NotebookId, NotebookAsyncData.schema),
  allNotes: NotesAsyncData.schema,
  notesByNotebook: S.HashMap(NotebookId, NotesAsyncData.schema),
  noteById: S.HashMap(NoteId, NoteAsyncData.schema),
})
