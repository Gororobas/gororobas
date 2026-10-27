import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'

import { ApplicationBlock, Flags } from './application'

export const renderDocument = Server.renderDocument

export const renderPage = (): Promise<Server.EntryResult> =>
  Effect.runPromise(
    Server.renderToString(
      ApplicationBlock,
      { Flags },
      { flags: { start: 0 } },
    ).pipe(Effect.map(Server.Rendered)),
  )
