import type { LoggedOutRoute } from '../../route'
import { LoggedOutComposition } from './composition'

export const init = LoggedOutComposition.makeInit(
  (route: typeof LoggedOutRoute.Type) => ({
    model: { _tag: 'LoggedOut', route },
  }),
)
