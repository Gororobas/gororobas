import { Block } from 'foldkit'

import { ApplicationComposition, init, update } from './application'
import type { Model } from './todo'
import { view } from './view.optimised'

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view: ApplicationComposition.makeView(view),
  })
export const ApplicationBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
