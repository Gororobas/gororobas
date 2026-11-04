import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Schema } from "effect"

import { AuthenticationBlock } from "../blocks/authentication"
import { ExternalDataObservationsBlock } from "../blocks/external-data-observations"
import { ProfileLocationsEditorBlock } from "../blocks/profile-locations-editor"
import { SearchBlock } from "../blocks/search"
import { WikiArticleBlock } from "../blocks/wiki-article"
import { WikiArticleDebugBlock } from "../blocks/wiki-article-debug"
import { DeviceLocation } from "../lib/device-location"
import { ApplicationRoute } from "./route"

export const WikiArticleDebugInstance = Schema.Struct({
  wikiArticleId: WikiArticleId,
  model: WikiArticleDebugBlock.Model,
})

export const WikiArticleInstance = Schema.Struct({
  /** `kind/handle`, so switching tabs keeps the loaded article. */
  articleKey: Schema.String,
  model: WikiArticleBlock.Model,
})

export const ExternalDataObservationsInstance = Schema.Struct({
  /** The log's URL, so changing a filter loads it afresh. */
  queryKey: Schema.String,
  model: ExternalDataObservationsBlock.Model,
})

export const Model = Schema.Struct({
  route: ApplicationRoute,
  authentication: AuthenticationBlock.Model,
  search: SearchBlock.Model,
  /** Today's date, read once at startup, for relative dates such as "Há 3 dias". */
  maybeToday: Schema.Option(Schema.DateTimeUtc),
  /** Read only when a page asks for it, such as to find the municipality someone is in. */
  deviceLocation: DeviceLocation,
  maybeWikiArticle: Schema.Option(WikiArticleInstance),
  maybeWikiArticleDebug: Schema.Option(WikiArticleDebugInstance),
  maybeProfileLocationsEditor: Schema.Option(ProfileLocationsEditorBlock.Model),
  maybeExternalDataObservations: Schema.Option(ExternalDataObservationsInstance),
  /** Set by the app shell's search link, whose click arrives before the navigation it starts:
   *  the search page focuses its field once it renders. */
  isSearchFieldFocusPending: Schema.Boolean,
})
