import { Block } from 'foldkit'

import { LoggedOutComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  LoggedOutComposition.prepareBlock({
    init,
    update,
    view,
  })
export const LoggedOutBlock: Block.FromAssemblyWithViewAndOutMessage<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
