import type { Block } from 'foldkit'

import { ApplicationDefinition } from '../definition'
import { DragAndDropBinding } from './dragAndDrop'

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [DragAndDropBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
