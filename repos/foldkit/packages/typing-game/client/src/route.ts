import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, slash, string } from 'foldkit/route'

export const ApplicationRoute = defineRouteUnion({
  Home: {},
  Room: { roomId: Schema.String },
  NotFound: { path: Schema.String },
})

export const isRoomRouteFor = (
  route: typeof ApplicationRoute.Type,
  roomId: string,
) => ApplicationRoute.guards.Room(route) && route.roomId === roomId

export const homeRouter = pipe(Route.root, Route.mapTo(ApplicationRoute.Home))
export const roomRouter = pipe(
  literal('room'),
  slash(string('roomId')),
  Route.mapTo(ApplicationRoute.Room),
)
const routeParser = Route.oneOf(roomRouter, homeRouter)

export const urlToApplicationRoute = Route.parseUrlWithFallback(
  routeParser,
  ApplicationRoute.NotFound,
)
