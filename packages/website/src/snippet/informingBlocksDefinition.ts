import { Block } from 'foldkit'

import { Message } from './informingBlocksMessage'
import { Model } from './informingBlocksModel'

export const PeopleDefinition = Block.makeDefinition('People', {
  Model,
  Message,
})
export const PeopleComposition = PeopleDefinition.makeComposition()
