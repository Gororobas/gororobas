import { HttpClient } from 'effect/http'
import { Block } from 'foldkit'

import { Message, Model, fetchCount } from './counterHttpCommand'

const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})

export const FetchCount = ApplicationDefinition.makeCommand('FetchCount', {
  messages: [Message.SucceededFetchCount, Message.FailedFetchCount],
  handler: function* () {
    const client = yield* HttpClient.HttpClient

    return () => fetchCount(client)
  },
})

export const EffectsLayer = FetchCount.layer
