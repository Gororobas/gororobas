import { Block } from 'foldkit'

import {
  AsyncCounterDemoComposition,
  EffectsLayer,
  init,
  update,
  view,
} from './asyncCounterDemo'
import type { Model } from './definition'

const prepare = () =>
  AsyncCounterDemoComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
export const AsyncCounterDemoBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
