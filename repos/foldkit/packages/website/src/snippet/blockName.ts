import { Block } from 'foldkit'

import { Message } from './message'
import { Model } from './model'

export const SettingsDefinition = Block.makeDefinition('Settings', {
  Model,
  Message,
})
