import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { UiBlock } from './ui'

export const UiBinding = ApplicationDefinition.makeBinding(UiBlock, {
  field: 'uiModel',
  init: { contextToArgs: ({ today }) => [today] },
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [UiBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
