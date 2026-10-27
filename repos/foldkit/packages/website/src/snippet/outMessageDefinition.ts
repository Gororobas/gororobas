import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const Message = defineMessageUnion({
  SubmittedLoginForm: {},
  SucceededAuthenticate: { sessionId: Schema.String },
})

export const OutMessage = defineMessageUnion({
  SucceededLogin: { sessionId: Schema.String },
})
