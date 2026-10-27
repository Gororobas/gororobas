// ✅ Register the Scene's sources and emit the child's declared Message.
import { Scene } from 'foldkit'

import {
  ApplicationComposition,
  init,
  pinsSubscriptions,
  PinsBlock,
  update,
  view,
} from './testingMigrationFixture'

const subscriptions = Scene.subscriptions(ApplicationComposition)

Scene.scene(
  { update, view, subscriptions },
  Scene.given(init().model),
  Scene.Subscription.emit(
    pinsSubscriptions.observations,
    PinsBlock.Message.ObservedPins({ count: 3 }),
  ),
)
