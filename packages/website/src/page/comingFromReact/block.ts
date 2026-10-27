import { Block } from 'foldkit'

import { ComingFromReactComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  ComingFromReactComposition.prepareBlock({
    init,
    update,
    view,
  })
export const ComingFromReactBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
