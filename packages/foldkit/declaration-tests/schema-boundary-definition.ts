import { Block } from 'foldkit'

import { Message } from './schema-boundary-message.js'
import { Model } from './schema-boundary-model.js'
export const ChildDefinition = Block.makeDefinition('PublicModelChild', {
  Model,
  Message,
})
