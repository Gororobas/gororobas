import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const SnippetSize = defineTaggedUnion({
  Fits: {},
  Overflows: {},
})

export const Model = Schema.Struct({
  openDisclosureIds: Schema.HashSet(Schema.String),
  snippetSizes: Schema.HashMap(Schema.String, SnippetSize),
})
