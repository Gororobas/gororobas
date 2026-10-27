import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

const EditorMode = defineTaggedUnion({
  Browsing: {},
  Editing: { noteId: Schema.String },
  Previewing: { noteId: Schema.String },
})

const Model = Schema.Struct({
  editorMode: EditorMode,
})

const initialModel = (): typeof Model.Type => ({
  editorMode: EditorMode.Browsing(),
})

const modeLabel = (mode: typeof EditorMode.Type): string =>
  EditorMode.match(mode, {
    Browsing: () => 'Browsing notes',
    Editing: ({ noteId }) => `Editing ${noteId}`,
    Previewing: ({ noteId }) => `Previewing ${noteId}`,
  })
