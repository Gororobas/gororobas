import type { Session } from '../../domain/session'
import type { LoggedInRoute } from '../../route'
import { LoggedInComposition } from './composition'
import { Model } from './model'

export const init = LoggedInComposition.makeInit(
  (route: typeof LoggedInRoute.Type, session: typeof Session.Type) => ({
    model: Model({ route, session }),
  }),
)
