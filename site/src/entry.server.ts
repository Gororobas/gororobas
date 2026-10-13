import { Effect, Option } from 'effect'
import { Server } from 'foldkit/experimental'
import { fromString } from 'foldkit/url'

import { renderDocument as renderWithPleat } from '@pleat/foldkit/server'

import { FONT_URLS } from './design.ts'
import { init, view } from './main.ts'
import { NOT_FOUND_PATH, PATHS, urlToAppRoute } from './route.ts'

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Crect width='20' height='20' rx='4' fill='%232f45c9'/%3E%3Cpath d='M3 15 6.5 5.5 10 15l3.5-9.5L17 15' fill='none' stroke='%23f7f3ec' stroke-width='1.9' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E"

/** Renders the docs document with its fonts, metadata, and Pleat styles. */
export const renderDocument = renderWithPleat({
  head: [
    `<link rel="icon" href="${ICON}">`,
    '<meta name="description" content="Algebraic, typed styles for Foldkit and Effect v4. Every rule compiled before the first render.">',
    '<meta name="color-scheme" content="light dark">',
    ...FONT_URLS.map(
      url => `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`,
    ),
  ].join(''),
})

/** The docs pages and the not-found document generated during the build. */
export const prerenderPaths: ReadonlyArray<string> = PATHS

/** Renders a page with HTTP 404 when its route is unknown. */
export const renderPage = (request: Request): Promise<Server.EntryResult> => {
  const url = Option.getOrThrow(fromString(request.url))
  const isNotFound = urlToAppRoute(url)._tag === 'NotFound'
  // Prerendering requires status 200 for the source document copied to 404.html.
  const isNotFoundDocument =
    url.pathname === NOT_FOUND_PATH || url.pathname === `${NOT_FOUND_PATH}/`
  return Effect.runPromise(
    Server.renderToString({ routing: {}, init, view }, { url: request.url }).pipe(
      Effect.map(application =>
        Server.Rendered(application, {
          status: isNotFound && !isNotFoundDocument ? 404 : 200,
        }),
      ),
    ),
  )
}
