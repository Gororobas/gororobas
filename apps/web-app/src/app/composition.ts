import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { AuthenticationBlock } from "../blocks/authentication"
import { ExternalDataAdminDashboardBlock } from "../blocks/external-data-admin-dashboard"
import { ProfileBlock } from "../blocks/profile"
import { ProfileLocationsEditorBlock } from "../blocks/profile-locations-editor"
import { SearchBlock } from "../blocks/search"
import { WikiArticleBlock } from "../blocks/wiki-article"
import { WikiArticleDebugBlock } from "../blocks/wiki-article-debug"
import { DeviceLocation } from "../lib/device-location"
import { LocateDevice } from "./command"
import { ApplicationBlock } from "./definition"
import type { Model } from "./model"
import { ApplicationRoute } from "./route"

export const AuthenticationBinding = ApplicationBlock.makeBinding(AuthenticationBlock, {
  field: "authentication",
})

export const SearchBinding = ApplicationBlock.makeBinding(SearchBlock, {
  field: "search",
  delivery: { toUpdateContext: (model) => [model.language] },
  subscriptions: { when: (model) => ApplicationRoute.guards.Search(model.route) },
})

/** An article in a language: reading it in another one loads its content afresh. */
export const wikiArticleKey = (
  language: SupportedLanguage,
  lookup: Readonly<{ kind: string; handle: string }>,
) => `${language}/${lookup.kind}/${lookup.handle}`

const isWikiArticleRouteFor = (model: typeof Model.Type, articleKey: string) =>
  ApplicationRoute.guards.WikiArticle(model.route) &&
  wikiArticleKey(model.language, model.route) === articleKey

export const WikiArticleBinding = ApplicationBlock.makeBinding(WikiArticleBlock, {
  field: "maybeWikiArticle",
  key: "articleKey",
  childField: "model",
  delivery: { when: isWikiArticleRouteFor },
  subscriptions: { when: isWikiArticleRouteFor },
})

const isDebugRouteFor = (route: ApplicationRoute, wikiArticleId: string) =>
  ApplicationRoute.guards.WikiArticleDebug(route) && route.wikiArticleId === wikiArticleId

export const WikiArticleDebugBinding = ApplicationBlock.makeBinding(WikiArticleDebugBlock, {
  field: "maybeWikiArticleDebug",
  key: "wikiArticleId",
  childField: "model",
  delivery: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
  subscriptions: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
})

/** A profile in a language: reading it in another one loads its content afresh. */
export const profileKey = (language: SupportedLanguage, handle: string) => `${language}/${handle}`

const isProfileRouteFor = (model: typeof Model.Type, key: string) =>
  ApplicationRoute.guards.Profile(model.route) &&
  profileKey(model.language, model.route.handle) === key

export const ProfileBinding = ApplicationBlock.makeBinding(ProfileBlock, {
  field: "maybeProfile",
  key: "profileKey",
  childField: "model",
  delivery: { when: isProfileRouteFor },
  subscriptions: { when: isProfileRouteFor },
})

export const ExternalDataAdminDashboardBinding = ApplicationBlock.makeBinding(
  ExternalDataAdminDashboardBlock,
  {
    field: "maybeExternalDataAdminDashboard",
    key: "queryKey",
    childField: "model",
    delivery: {
      when: (model) => ApplicationRoute.guards.ExternalDataAdminDashboard(model.route),
    },
  },
)

export const ProfileLocationsEditorBinding = ApplicationBlock.makeBinding(
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
  fold: ApplicationBlock.makeOutMessageFold(ProfileLocationsEditorBlock, {
    RequestedDeviceLocation: () =>
      ApplicationBlock.makeStep((model) => ({
        model: modifyFields(model, { deviceLocation: () => DeviceLocation.Locating() }),
        commands: [LocateDevice()],
      })),
  }),
})

export const ApplicationComposition = ApplicationBlock.makeComposition({
  bindings: [
    AuthenticationBinding,
    SearchBinding,
    WikiArticleBinding,
    WikiArticleDebugBinding,
    ProfileBinding,
    ProfileLocationsEditorBinding,
    ExternalDataAdminDashboardBinding,
  ],
})

export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
