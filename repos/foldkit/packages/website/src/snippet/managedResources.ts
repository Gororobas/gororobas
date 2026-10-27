import { Effect, Layer, Option, Schema, pipe } from 'effect'
import { Block } from 'foldkit'

import { TakePhoto } from './command'
import { init } from './init'
import { Message } from './message'
import type { Model } from './model'
import { Camera, CameraComposition, CameraStream } from './resource'
import { update } from './update'
import { view } from './view'

const managedResources = Camera.makeManagedResources(entry => ({
  camera: entry(
    'ManageCamera',
    Schema.Option(Schema.Struct({ facingMode: Schema.String })),
    {
      resource: CameraStream,
      modelToMaybeRequirements: model =>
        pipe(
          model.callState,
          Option.liftPredicate(callState => callState._tag === 'InCall'),
          Option.map(callState => ({ facingMode: callState.facingMode })),
        ),
      onAcquired: () => Message.AcquiredCamera(),
      onReleased: () => Message.ReleasedCamera(),
      onAcquireError: error =>
        Message.FailedAcquireCamera({ error: globalThis.String(error) }),
      handler: function* () {
        return {
          acquire: ({ facingMode }) =>
            Effect.tryPromise(() =>
              navigator.mediaDevices.getUserMedia({ video: { facingMode } }),
            ),
          release: stream =>
            Effect.sync(() =>
              stream.getTracks().forEach(track => track.stop()),
            ),
        }
      },
    },
  ),
}))

const prepare = () =>
  CameraComposition.prepareBlock({
    init,
    update,
    view,
    managedResources,
    EffectsLayer: Layer.mergeAll(
      TakePhoto.layer,
      managedResources.camera.layer,
    ),
  })
export const CameraBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
