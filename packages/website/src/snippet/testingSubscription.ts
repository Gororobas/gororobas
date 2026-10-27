import {
  Subscription,
  given,
  scene,
  subscriptions as sceneSubscriptions,
} from 'foldkit/scene'

const rootSubscriptions = ApplicationDefinition.makeSubscriptions(entry => ({
  clockTicks: entry('ClockTicks', { messages: [Message.Ticked] }),
}))

const subscriptions = sceneSubscriptions(
  ApplicationComposition,
  rootSubscriptions,
)

scene(
  { update, view, subscriptions },
  given(initialModel),
  Subscription.emit(subscriptions.clockTicks, Message.Ticked()),
)

scene(
  { update, view, subscriptions },
  given(initialModel),
  Subscription.emit(
    subscriptions['chat/chatServerFrames'],
    Chat.ChatBlock.Message.ReceivedServerFrame({ frame }),
  ),
)
