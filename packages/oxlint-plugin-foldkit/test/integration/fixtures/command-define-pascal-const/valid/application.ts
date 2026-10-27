import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({ value: Schema.String })
const Message = defineMessageUnion({ CompletedFetchUser: {} })
const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})

export const FetchUser = ApplicationDefinition.makeCommand('FetchUser', {
  messages: [Message.CompletedFetchUser],
})
