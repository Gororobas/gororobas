import { Block } from 'foldkit'

import { Message } from './message'
import { Model } from './model'

export const ComingFromReactComposition = Block.makeDefinition(
  'ComingFromReact',
  {
    Model,
    Message,
  },
).makeComposition()
export type ComingFromReactViewBuilder = Block.ViewBuilderFor<
  typeof ComingFromReactComposition
>
