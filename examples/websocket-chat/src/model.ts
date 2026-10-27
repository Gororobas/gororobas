import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const ChatMessage = Schema.Struct({
  text: Schema.String,
  zoned: Schema.DateTimeZoned,
  isSent: Schema.Boolean,
})

export const ConnectionState = defineTaggedUnion({
  Disconnected: {},
  Connecting: {},
  Connected: {},
  Error: { error: Schema.String },
})

export const Model = Schema.Struct({
  connection: ConnectionState,
  messages: Schema.Array(ChatMessage),
  messageInput: Schema.String,
})
