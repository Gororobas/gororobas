import { Block } from 'foldkit'

import { AttachmentsComposition } from './composition'
import type { Model } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  AttachmentsComposition.prepareBlock({
    init,
    update,
    view,
  })
export const AttachmentsBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
