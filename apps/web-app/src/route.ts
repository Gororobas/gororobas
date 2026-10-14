import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Schema, pipe } from "effect"
import { Route } from "foldkit"
import { defineRouteUnion, literal, schemaSegment, slash } from "foldkit/route"

export const AppRoute = defineRouteUnion({
  WikiSearch: {},
  WikiArticleDebug: { wikiArticleId: WikiArticleId },
  ProfileSearch: {},
  PublicationSearch: {},
  Login: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export const wikiSearchRouter = pipe(Route.root, Route.mapTo(AppRoute.WikiSearch))

export const wikiArticleDebugRouter = pipe(
  literal("wiki"),
  slash(schemaSegment("wikiArticleId", WikiArticleId)),
  slash(literal("debug")),
  Route.mapTo(AppRoute.WikiArticleDebug),
)

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
  Route.oneOf(
    wikiArticleDebugRouter,
    wikiSearchRouter,
    profileSearchRouter,
    publicationSearchRouter,
    loginRouter,
  ),
  AppRoute.NotFound,
)
