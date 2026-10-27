import { Block } from 'foldkit'

import { UiComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  UiComposition.prepareBlock({
    init,
    update,
    view,
  })
export const UiBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
