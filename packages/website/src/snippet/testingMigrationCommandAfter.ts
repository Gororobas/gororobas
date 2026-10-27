// ✅ Match the original Definition and supply the child's raw result.
import { Command, given, message, story } from 'foldkit/story'

import {
  init,
  Message,
  PinsBlock,
  ReadPins,
  update,
} from './testingMigrationFixture'

story(
  update,
  given(init().model),
  message(Message.RequestedRefreshPins()),
  Command.expectHas(ReadPins),
  Command.resolve(ReadPins, PinsBlock.Message.CompletedReadPins({ count: 3 })),
)
