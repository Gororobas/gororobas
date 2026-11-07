import { Effect, Layer } from "effect"

import * as Authentication from "../blocks/authentication"
import * as ExternalDataAdminDashboard from "../blocks/external-data-admin-dashboard"
import * as Profile from "../blocks/profile"
import * as ProfileLocationsEditor from "../blocks/profile-locations-editor"
import * as Search from "../blocks/search"
import * as WikiArticle from "../blocks/wiki-article"
import * as WikiArticleDebug from "../blocks/wiki-article-debug"
import { layer as PopoverDrawerLayer } from "../ui/popover-drawer"
import { EffectsLayer } from "./command"
import {
  AuthenticationBinding,
  ExternalDataAdminDashboardBinding,
  SettingsMenuBinding,
  ProfileBinding,
  ProfileLocationsEditorBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
} from "./composition"
import { ApplicationBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

export const layer = ApplicationBlock.makeLayer(
  Effect.gen(function* () {
    const authentication = yield* AuthenticationBinding
    const settingsMenu = yield* SettingsMenuBinding
    const search = yield* SearchBinding
    const wikiArticle = yield* WikiArticleBinding
    const wikiArticleDebug = yield* WikiArticleDebugBinding
    const profile = yield* ProfileBinding
    const profileLocationsEditor = yield* ProfileLocationsEditorBinding
    const externalDataAdminDashboard = yield* ExternalDataAdminDashboardBinding

    return {
      children: [
        authentication,
        settingsMenu,
        search,
        wikiArticle,
        wikiArticleDebug,
        profile,
        profileLocationsEditor,
        externalDataAdminDashboard,
      ],
      init,
      update,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer),
    }
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Authentication.layer,
      PopoverDrawerLayer,
      Search.layer,
      WikiArticle.layer,
      WikiArticleDebug.layer,
      Profile.layer,
      ProfileLocationsEditor.layer,
      ExternalDataAdminDashboard.layer,
    ),
  ),
)

export { ApplicationBlock } from "./definition"
