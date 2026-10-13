import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal } from 'foldkit/route'

export const AppRoute = defineRouteUnion({
  Home: {},
  Guide: {},
  Algebra: {},
  Generative: {},
  Theming: {},
  FoldkitUi: {},
  Reference: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(Route.root, Route.mapTo(AppRoute.Home))
export const guideRouter = pipe(literal('guide'), Route.mapTo(AppRoute.Guide))
export const algebraRouter = pipe(literal('algebra'), Route.mapTo(AppRoute.Algebra))
export const generativeRouter = pipe(
  literal('generative'),
  Route.mapTo(AppRoute.Generative),
)
export const themingRouter = pipe(literal('theming'), Route.mapTo(AppRoute.Theming))
export const foldkitUiRouter = pipe(
  literal('foldkit-ui'),
  Route.mapTo(AppRoute.FoldkitUi),
)
export const referenceRouter = pipe(literal('reference'), Route.mapTo(AppRoute.Reference))

const routeParser = Route.oneOf(
  guideRouter,
  algebraRouter,
  generativeRouter,
  themingRouter,
  foldkitUiRouter,
  referenceRouter,
  homeRouter,
)

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)

/** The page Cloudflare serves for any path that has no file. */
export const NOT_FOUND_PATH = '/404'

export const PATHS: ReadonlyArray<string> = [
  homeRouter(),
  guideRouter(),
  algebraRouter(),
  generativeRouter(),
  themingRouter(),
  foldkitUiRouter(),
  referenceRouter(),
  NOT_FOUND_PATH,
]
