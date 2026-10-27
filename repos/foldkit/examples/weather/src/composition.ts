import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'

export const ApplicationComposition = ApplicationDefinition.makeComposition()
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
