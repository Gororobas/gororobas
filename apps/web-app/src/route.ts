import { Schema, pipe } from "effect"
import { Route } from "foldkit"
import { defineRouteUnion, literal, slash } from "foldkit/route"

export const AppRoute = defineRouteUnion({
  WikiSearch: {},
  ProfileSearch: {},
  PublicationSearch: {},
  Login: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export const wikiSearchRouter = pipe(Route.root, Route.mapTo(AppRoute.WikiSearch))

export const profileSearchRouter = pipe(
  literal("search"),
  slash(literal("profiles")),
  Route.mapTo(AppRoute.ProfileSearch),
)

export const publicationSearchRouter = pipe(
  literal("search"),
  slash(literal("publications")),
  Route.mapTo(AppRoute.PublicationSearch),
)

export const loginRouter = pipe(literal("login"), Route.mapTo(AppRoute.Login))
export const urlToAppRoute = Route.parseUrlWithFallback(
  Route.oneOf(wikiSearchRouter, profileSearchRouter, publicationSearchRouter, loginRouter),
  AppRoute.NotFound,
)
