import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { AuthenticationBlock } from "../blocks/authentication"
import { ProfileLocationsEditorBlock } from "../blocks/profile-locations-editor"
import { SearchBlock } from "../blocks/search"
import { WikiArticleBlock } from "../blocks/wiki-article"
import { WikiArticleDebugBlock } from "../blocks/wiki-article-debug"
import { DeviceLocation } from "../lib/device-location"
import { LocateDevice } from "./command"
import { ApplicationDefinition } from "./definition"
import { ApplicationRoute } from "./route"

export const AuthenticationBinding = ApplicationDefinition.makeBinding(AuthenticationBlock, {
  field: "authentication",
})

export const SearchBinding = ApplicationDefinition.makeBinding(SearchBlock, {
  field: "search",
  subscriptions: { when: (model) => ApplicationRoute.guards.Search(model.route) },
})

export const wikiArticleKey = (lookup: Readonly<{ kind: string; handle: string }>) =>
  `${lookup.kind}/${lookup.handle}`

const isWikiArticleRouteFor = (route: ApplicationRoute, articleKey: string) =>
  ApplicationRoute.guards.WikiArticle(route) && wikiArticleKey(route) === articleKey

export const WikiArticleBinding = ApplicationDefinition.makeBinding(WikiArticleBlock, {
  field: "maybeWikiArticle",
  key: "articleKey",
  childField: "model",
  delivery: { when: (model, articleKey) => isWikiArticleRouteFor(model.route, articleKey) },
  subscriptions: { when: (model, articleKey) => isWikiArticleRouteFor(model.route, articleKey) },
})

const isDebugRouteFor = (route: ApplicationRoute, wikiArticleId: string) =>
  ApplicationRoute.guards.WikiArticleDebug(route) && route.wikiArticleId === wikiArticleId

export const WikiArticleDebugBinding = ApplicationDefinition.makeBinding(WikiArticleDebugBlock, {
  field: "maybeWikiArticleDebug",
  key: "wikiArticleId",
  childField: "model",
  delivery: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
  subscriptions: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
})

export const ProfileLocationsEditorBinding = ApplicationDefinition.makeBinding(
  ProfileLocationsEditorBlock,
  {
    field: "maybeProfileLocationsEditor",
    delivery: {
      when: (model) => ApplicationRoute.guards.MyPlaces(model.route),
      toUpdateContext: (model) => [model.deviceLocation],
    },
    subscriptions: { when: (model) => ApplicationRoute.guards.MyPlaces(model.route) },
  },
).withOutMessagePolicy({
  fold: ApplicationDefinition.makeOutMessageFold(ProfileLocationsEditorBlock, {
    RequestedDeviceLocation: () =>
      ApplicationDefinition.makeStep((model) => ({
        model: modifyFields(model, { deviceLocation: () => DeviceLocation.Locating() }),
        commands: [LocateDevice()],
      })),
  }),
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    AuthenticationBinding,
    SearchBinding,
    WikiArticleBinding,
    WikiArticleDebugBinding,
    ProfileLocationsEditorBinding,
  ],
})

export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
