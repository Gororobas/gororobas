import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'

import { renderDocument as renderWithPleat } from '@pleat/foldkit/server'

import { init, view } from './main.ts'

// Each page gets a <style data-pleat> with the rules it uses. The
// browser inserts any others the first time a view uses them.
export const renderDocument = renderWithPleat({
  head: '<link rel="icon" href="/icon.svg">',
})

export const renderPage = (
  request: Request,
): Promise<Server.EntryResult> =>
  Effect.runPromise(
    Server.renderToString(
      { routing: {}, init, view },
      { url: request.url },
    ).pipe(Effect.map(Server.Rendered)),
  )
