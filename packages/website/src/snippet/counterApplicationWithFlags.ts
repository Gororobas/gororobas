import { Block } from 'foldkit'

import type { Model } from './counterFlagsRoot'
import { ApplicationComposition, init, update, view } from './counterFlagsRoot'

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view,
  })
export const ApplicationBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
