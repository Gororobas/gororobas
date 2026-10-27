import { Block } from 'foldkit'

import { EffectsLayer } from './command'
import { ApplicationComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view/view'

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
export const ApplicationBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
