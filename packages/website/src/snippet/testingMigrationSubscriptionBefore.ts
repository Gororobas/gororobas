// ❌ Emit a Message without identifying its registered Subscription.
import { Scene } from 'foldkit'

import { model, update, view } from './application'
import { Message } from './application/message'

Scene.scene(
  { update, view },
  Scene.given(model),
  Scene.Subscription.emit(Message.ObservedPins({ count: 3 })),
)
