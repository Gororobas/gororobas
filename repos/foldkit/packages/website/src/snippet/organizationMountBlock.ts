import { Block } from 'foldkit'

import { PanelComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { MeasurePanel } from './mount'
import { update } from './update'
import { view } from './view'

export const EffectsLayer = MeasurePanel.layer

const prepare = () =>
  PanelComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
export const PanelBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
