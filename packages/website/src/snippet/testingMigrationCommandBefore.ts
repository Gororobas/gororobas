// ❌ Match a Command's displayed name and construct its parent wrapper.
import { Command } from 'foldkit/story'
import { expect } from 'vitest'

import { model, pins, update } from './application'
import { Message } from './application/message'
import { ReadPins } from './pins/command'
import { Message as PinsMessage } from './pins/message'

const result = update(model, Message.RequestedRefreshPins())

expect(result.commands?.some(command => command.name === ReadPins.name)).toBe(
  true,
)

Command.resolve(
  ReadPins,
  Message.GotPinsMessage({
    message: PinsMessage.CompletedReadPins({ pins }),
  }),
)
