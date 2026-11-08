import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { Block } from "foldkit"
import { Update } from "foldkit"

import { AuthenticationBlock } from "../blocks/authentication"
import { ExternalDataAdminDashboardBlock } from "../blocks/external-data-admin-dashboard"
import { ProfileBlock } from "../blocks/profile"
import { ProfileEditorBlock } from "../blocks/profile-editor"
import { SearchBlock } from "../blocks/search"
import { WikiArticleBlock } from "../blocks/wiki-article"
import { WikiArticleDebugBlock } from "../blocks/wiki-article-debug"
import { PopoverDrawerBlock } from "../ui/popover-drawer"
import { NavigateInternal } from "./command"
import { ApplicationBlock } from "./definition"
import type { Model } from "./model"
import { ApplicationRoute, applicationRouteUrl, profileEditorUrl, searchUrl } from "./route"

export const AuthenticationBinding = ApplicationBlock.makeRequiredFieldBinding(
  AuthenticationBlock,
  {
    field: "authentication",
    delivery: { toUpdateContext: (model) => [model.language] },
  },
).withOutMessagePolicy({
  fold: ApplicationBlock.makeOutMessageFold(AuthenticationBlock, {
    // New accounts go on to fill in the rest of their profile.
    CompletedOnboarding: () =>
      ApplicationBlock.makeCommandsStep((model) => [
        NavigateInternal({ url: profileEditorUrl(model.language) }),
      ]),
  }),
})

/** The app bar's menu: a globe for visitors, their avatar for people signed in. */
export const SettingsMenuBinding = ApplicationBlock.makeRequiredFieldBinding(PopoverDrawerBlock, {
  field: "settingsMenu",
  init: { contextToArgs: () => [{ id: "app-settings-menu" }] },
})

export const SearchBinding = ApplicationBlock.makeRequiredFieldBinding(SearchBlock, {
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

export const WikiArticleBinding = ApplicationBlock.makeOptionalKeyedFieldBinding(WikiArticleBlock, {
  field: "maybeWikiArticle",
  key: "articleKey",
  childField: "model",
  delivery: { when: isWikiArticleRouteFor, toUpdateContext: (model) => [model.language] },
  subscriptions: { when: isWikiArticleRouteFor },
})

const isDebugRouteFor = (route: ApplicationRoute, wikiArticleId: string) =>
  ApplicationRoute.guards.WikiArticleDebug(route) && route.wikiArticleId === wikiArticleId

export const WikiArticleDebugBinding = ApplicationBlock.makeOptionalKeyedFieldBinding(
  WikiArticleDebugBlock,
  {
    field: "maybeWikiArticleDebug",
    key: "wikiArticleId",
    childField: "model",
    delivery: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
    subscriptions: { when: (model, wikiArticleId) => isDebugRouteFor(model.route, wikiArticleId) },
  },
)

/** A profile in a language: reading it in another one loads its content afresh. */
export const profileKey = (language: SupportedLanguage, handle: string) => `${language}/${handle}`

const isProfileRouteFor = (model: typeof Model.Type, key: string) =>
  ApplicationRoute.guards.Profile(model.route) &&
  profileKey(model.language, model.route.handle) === key

export const ProfileBinding = ApplicationBlock.makeOptionalKeyedFieldBinding(ProfileBlock, {
  field: "maybeProfile",
  key: "profileKey",
  childField: "model",
  delivery: { when: isProfileRouteFor, toUpdateContext: (model) => [model.language] },
  subscriptions: { when: isProfileRouteFor },
})

export const ExternalDataAdminDashboardBinding = ApplicationBlock.makeOptionalKeyedFieldBinding(
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

export const ProfileEditorBinding = ApplicationBlock.makeOptionalFieldBinding(ProfileEditorBlock, {
  field: "maybeProfileEditor",
  delivery: { when: (model) => ApplicationRoute.guards.ProfileEditor(model.route) },
  subscriptions: { when: (model) => ApplicationRoute.guards.ProfileEditor(model.route) },
}).withOutMessagePolicy({
  fold: ApplicationBlock.makeOutMessageFold(ProfileEditorBlock, {
    RequestedSignOut: () => AuthenticationBinding.requestSignOut(),
    // Their saved language becomes the one the app speaks, on the same page.
    ChoseLanguage: ({ language }) =>
      ApplicationBlock.makeCommandsStep((model) => [
        NavigateInternal({ url: applicationRouteUrl(language, model.route) }),
      ]),
    DeletedAccount: () =>
      Update.combineSteps([
        AuthenticationBinding.requestSignOut(),
        ApplicationBlock.makeCommandsStep((model) => [
          NavigateInternal({ url: searchUrl(model.language) }),
        ]),
      ]),
  }),
})

export const ApplicationComposition = ApplicationBlock.makeComposition({
  bindings: [
    AuthenticationBinding,
    SettingsMenuBinding,
    SearchBinding,
    WikiArticleBinding,
    WikiArticleDebugBinding,
    ProfileBinding,
    ProfileEditorBinding,
    ExternalDataAdminDashboardBinding,
  ],
})

export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>
