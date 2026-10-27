// resource.ts
import { Block } from 'foldkit'

import { Message } from './message'
import { Model } from './model'

export const CameraDefinition = Block.makeDefinition('Camera', {
  Model,
  Message,
})
export const CameraComposition = CameraDefinition.makeComposition()
export const CameraStream =
  CameraDefinition.makeResource<MediaStream>()('CameraStream')
