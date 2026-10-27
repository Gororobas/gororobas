import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ExampleSlug } from '../example/meta'

export const Message = defineMessageUnion({
  UpdatedNewsletterEmail: { value: Schema.String },
})

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  SelectedPlaygroundExample: { exampleSlug: ExampleSlug },
  UpdatedNewsletterEmail: { value: Schema.String },
})
