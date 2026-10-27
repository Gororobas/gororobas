import { Block } from 'foldkit'

import { Message, OutMessage } from './message'
import { Model } from './model'

export const LoggedOutDefinition = Block.makeDefinition('LoggedOut', {
  Model,
  Message,
  OutMessage,
})
