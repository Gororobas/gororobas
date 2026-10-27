import { Crypto, Effect } from 'effect'

import { Message, WorkHistoryDefinition } from './definition'

export const GenerateWorkHistoryEntryId = WorkHistoryDefinition.makeCommand(
  'GenerateWorkHistoryEntryId',
  {
    messages: [
      Message.SucceededGenerateWorkHistoryEntryId,
      Message.FailedGenerateWorkHistoryEntryId,
    ],
    handler: function* () {
      const crypto = yield* Crypto.Crypto

      return () =>
        crypto.randomUUIDv4.pipe(
          Effect.map(entryId =>
            Message.SucceededGenerateWorkHistoryEntryId({ entryId }),
          ),
          Effect.catch(() =>
            Effect.succeed(Message.FailedGenerateWorkHistoryEntryId()),
          ),
        )
    },
  },
)

export const EffectsLayer = GenerateWorkHistoryEntryId.layer
