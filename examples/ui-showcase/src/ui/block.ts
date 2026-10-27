import { Block } from 'foldkit'

import { UiComposition } from './composition'
import { init } from './init'
import { Message } from './message'
import type { Model } from './model'
import { update } from './update'

const prepare = () =>
  UiComposition.prepareBlock({
    init,
    update,
    operations: {
      requestOpenMobileMenu: Message.RequestedOpenMobileMenu,
      requestCloseMobileMenu: Message.RequestedCloseMobileMenu,
    },
  })
export const UiBlock: Block.FromAssemblyWithoutViewOrOutMessage<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
