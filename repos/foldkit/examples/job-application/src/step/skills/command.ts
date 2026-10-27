import { Crypto, Effect } from 'effect'

import { Message, SkillsDefinition } from './definition'

export const GenerateSkillsEntryId = SkillsDefinition.makeCommand(
  'GenerateSkillsEntryId',
  {
    messages: [
      Message.SucceededGenerateSkillsEntryId,
      Message.FailedGenerateSkillsEntryId,
    ],
    handler: function* () {
      const crypto = yield* Crypto.Crypto

      return () =>
        crypto.randomUUIDv4.pipe(
          Effect.map(entryId =>
            Message.SucceededGenerateSkillsEntryId({ entryId }),
          ),
          Effect.catch(() =>
            Effect.succeed(Message.FailedGenerateSkillsEntryId()),
          ),
        )
    },
  },
)

export const EffectsLayer = GenerateSkillsEntryId.layer
