import { Layer } from "effect"

import * as Authentication from "../blocks/authentication"
import * as ExternalDataAdminDashboard from "../blocks/external-data-admin-dashboard"
import * as Profile from "../blocks/profile"
import * as ProfileEditor from "../blocks/profile-editor"
import * as Search from "../blocks/search"
import * as WikiArticle from "../blocks/wiki-article"
import * as WikiArticleDebug from "../blocks/wiki-article-debug"
import { layer as PopoverDrawerLayer } from "../ui/popover-drawer"
import { EffectsLayer } from "./command"
import { ApplicationBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

export const layer = ApplicationBlock.makeLayer({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer),
}).pipe(
  Layer.provide(
    Layer.mergeAll(
      Authentication.layer,
      PopoverDrawerLayer,
      Search.layer,
      WikiArticle.layer,
      WikiArticleDebug.layer,
      Profile.layer,
      ProfileEditor.layer,
      ExternalDataAdminDashboard.layer,
    ),
  ),
)

export { ApplicationBlock } from "./definition"
