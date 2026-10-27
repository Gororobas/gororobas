import { Block } from 'foldkit'

import { LoggedInComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  LoggedInComposition.prepareBlock({
    init,
    update,
    view,
  })
export const LoggedInBlock: Block.FromAssemblyWithViewAndOutMessage<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
