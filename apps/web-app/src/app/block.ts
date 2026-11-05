import { Effect, Layer } from "effect"

import * as Authentication from "../blocks/authentication"
import * as ExternalDataAdminDashboard from "../blocks/external-data-admin-dashboard"
import * as ProfileLocationsEditor from "../blocks/profile-locations-editor"
import * as Search from "../blocks/search"
import * as WikiArticle from "../blocks/wiki-article"
import * as WikiArticleDebug from "../blocks/wiki-article-debug"
import { EffectsLayer } from "./command"
import {
  AuthenticationBinding,
  ExternalDataAdminDashboardBinding,
  ProfileLocationsEditorBinding,
  SearchBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
} from "./composition"
import { ApplicationBlock } from "./definition"
import { init } from "./init"
import { update } from "./update"
import { view } from "./view"

export const layer = ApplicationBlock.makeLayer(
  Effect.gen(function* () {
    const authentication = yield* AuthenticationBinding
    const search = yield* SearchBinding
    const wikiArticle = yield* WikiArticleBinding
    const wikiArticleDebug = yield* WikiArticleDebugBinding
    const profileLocationsEditor = yield* ProfileLocationsEditorBinding
    const externalDataAdminDashboard = yield* ExternalDataAdminDashboardBinding

    return {
      children: [
        authentication,
        search,
        wikiArticle,
        wikiArticleDebug,
        profileLocationsEditor,
        externalDataAdminDashboard,
      ],
      init,
      update,
      view,
      EffectsLayer,
    }
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Authentication.layer,
      Search.layer,
      WikiArticle.layer,
      WikiArticleDebug.layer,
      ProfileLocationsEditor.layer,
      ExternalDataAdminDashboard.layer,
    ),
  ),
)

export { ApplicationBlock } from "./definition"
