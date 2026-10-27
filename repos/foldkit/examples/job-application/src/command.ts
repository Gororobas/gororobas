import { Duration, Effect } from 'effect'

import { ApplicationDefinition } from './definition'
import { Message } from './message'

export const SubmitApplication = ApplicationDefinition.makeCommand(
  'SubmitApplication',
  {
    messages: [
      Message.SucceededSubmitApplication,
      Message.FailedSubmitApplication,
    ],
    handler: function* () {
      return () =>
        Effect.gen(function* () {
          yield* Effect.sleep(Duration.millis(1500))
          return Message.SucceededSubmitApplication()
        })
    },
  },
)

export const EffectsLayer = SubmitApplication.layer
