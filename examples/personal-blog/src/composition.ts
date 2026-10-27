import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { CounterBlock } from './island'

export const CounterBinding = ApplicationDefinition.makeBinding(CounterBlock, {
  field: 'counter',
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [CounterBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
