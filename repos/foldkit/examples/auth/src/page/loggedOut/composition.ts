import type { Block } from 'foldkit'

import { LoggedOutDefinition } from './definition'
import { OutMessage } from './message'
import { LoginBlock } from './page/login'

export const LoginBinding = LoggedOutDefinition.makeBinding(LoginBlock, {
  field: 'loginModel',
  init: { contextToArgs: () => [] },
}).withOutMessagePolicy({
  forward: LoggedOutDefinition.makeOutMessageForward({
    SucceededLogin: ({ session }) => OutMessage.SucceededLogin({ session }),
  }),
})

export const LoggedOutComposition = LoggedOutDefinition.makeComposition({
  bindings: [LoginBinding],
})
export type LoggedOutViewBuilder = Block.ViewBuilderFor<
  typeof LoggedOutComposition
>
