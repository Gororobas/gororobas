import { Effect, Option, Schema } from 'effect'
import { Block } from 'foldkit'

import { init } from './init'
import { Message } from './message'
import { Model } from './model'
import { update } from './update'
import * as VideoCall from './videoCall'

const SIGNALING_URL = 'wss://example.com/call/signaling'

const CallDefinition = Block.makeDefinition('Call', { Model, Message })
const SignalingSocket =
  CallDefinition.makeResource<WebSocket>()('SignalingSocket')

const VideoCallBinding = CallDefinition.makeBinding(VideoCall.VideoCallBlock, {
  field: 'videoCall',
})

const CallComposition = CallDefinition.makeComposition({
  bindings: [VideoCallBinding],
})

export const managedResources = CallDefinition.makeManagedResources(entry => ({
  signalingSocket: entry('ManageSignalingSocket', Schema.Option(Schema.Null), {
    resource: SignalingSocket,
    modelToMaybeRequirements: model => Option.as(model.videoCall, null),
    onAcquired: () => Message.OpenedSignaling(),
    onReleased: () => Message.ClosedSignaling(),
    onAcquireError: error =>
      Message.FailedSignaling({ error: globalThis.String(error) }),
    handler: function* () {
      return {
        acquire: () => Effect.try(() => new WebSocket(SIGNALING_URL)),
        release: socket => Effect.sync(() => socket.close()),
      }
    },
  }),
}))

const prepare = () =>
  CallComposition.prepareBlock({
    init,
    update,
    managedResources,
    EffectsLayer: managedResources.signalingSocket.layer,
  })
export const CallBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
