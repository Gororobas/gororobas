import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { MountMap } from './mount'

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  mounts: [MountMap],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
