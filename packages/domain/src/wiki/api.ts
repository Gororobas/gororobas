import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { BookmarkState, SupportedLanguage } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import {
  ExternalDataObservationId,
  MediaAssetId,
  WikiArticleId,
  WikiArticleRevisionId,
} from "../common/ids.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { InvalidMediaAssetError, MediaNotFoundError } from "../media-assets/errors.js"
import {
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
  EvaluateWikiArticleRevisionPayload,
  WikiArticleLookup,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
  RelatedWikiArticle,
  WikiArticleBookmarker,
  WikiArticleContributor,
  WikiChildPlacesPage,
  WikiChildPlacesParams,
  WikiSearchParams,
} from "./domain.js"
import {
  ExternalDataObservationNotFoundError,
  WikiArticleRevisionAlreadyEvaluatedError,
  WikiArticleRevisionNotFoundError,
  WikiArticleNotFoundError,
  WikiArticleWikidataIdTakenError,
} from "./errors.js"
import { ExternalDataFetchError } from "./external-data/error.js"
import {
  BookIdSuggestion,
  BookIdSuggestionsQuery,
} from "./external-data/kinds/book-external-data.js"
import {
  ExternalDataObservationDetail,
  ExternalDataObservationLogPage,
  ExternalDataObservationLogQuery,
} from "./external-data/observation-log.js"
import { WikiArticleRevisionRow } from "./wiki-article.js"

export class WikiApiGroup extends HttpApiGroup.make("wiki")
  .add(
    HttpApiEndpoint.get("suggestBookIds", "/wiki/books/id-suggestions", {
      query: BookIdSuggestionsQuery,
      success: Schema.Array(BookIdSuggestion),
      error: ExternalDataFetchError.pipe(HttpApiSchema.status(502)),
    }),
  )
  .add(
    HttpApiEndpoint.get("getWikiArticleDebug", "/wiki/:wikiArticleId/debug", {
      params: Schema.Struct({ wikiArticleId: WikiArticleId }),
      success: Schema.Record(Schema.String, Schema.Json),
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError, UnauthorizedError],
    }),
  )
  .add(
    HttpApiEndpoint.get("getWikiBookmarks", "/wiki/bookmarks", {
      success: Schema.Array(Schema.Struct({ wikiArticleId: WikiArticleId, state: BookmarkState })),
      error: UnauthorizedError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getWikiRevisionHistory", "/wiki/:kind/:handle/revisions", {
      success: Schema.Array(WikiArticleRevisionRow),
      params: WikiArticleLookup,
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
    }),
  )
  .add(
    HttpApiEndpoint.get("searchWikiArticles", "/wiki", {
      success: Schema.Array(WikiArticleQueriedCardData),
      query: WikiSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getWikiArticleByHandleAndKind", "/wiki/:kind/:handle", {
      success: WikiArticleQueriedPageData,
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
      query: Schema.Struct({ language: Schema.optional(SupportedLanguage) }),
    }),
  )
  .add(
    HttpApiEndpoint.get("listRelatedWikiArticles", "/wiki/:kind/:handle/related", {
      success: Schema.Array(RelatedWikiArticle),
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
      query: Schema.Struct({ language: Schema.optional(SupportedLanguage) }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createWikiArticle", "/wiki", {
      success: Schema.Struct({ id: WikiArticleId }),
      error: [
        HandleTakenError,
        WikiArticleNotFoundError,
        InvalidCrdtUpdateError,
        UnauthorizedError,
        InvalidMediaAssetError,
        MediaNotFoundError,
        WikiArticleWikidataIdTakenError,
      ],
      payload: CreateWikiArticlePayload,
    }),
  )
  .add(
    HttpApiEndpoint.post("createWikiArticleRevision", "/wiki/:kind/:handle/revisions", {
      success: Schema.Struct({ id: WikiArticleRevisionId }),
      error: Schema.Union([
        WikiArticleNotFoundError,
        InvalidCrdtUpdateError,
        UnauthorizedError,
        InvalidMediaAssetError,
        MediaNotFoundError,
      ]),
      params: WikiArticleLookup,
      payload: CreateWikiArticleRevisionPayload,
    }),
  )
  .add(
    HttpApiEndpoint.post("evaluateWikiArticleRevision", "/wiki/revisions/:revisionId", {
      success: Schema.Struct({ id: WikiArticleRevisionId }),
      error: [
        WikiArticleNotFoundError,
        WikiArticleRevisionNotFoundError,
        WikiArticleRevisionAlreadyEvaluatedError,
        WikiArticleWikidataIdTakenError,
        InvalidCrdtUpdateError,
        UnauthorizedError,
        InvalidMediaAssetError,
        MediaNotFoundError,
      ],
      params: Schema.Struct({
        revisionId: WikiArticleRevisionId,
      }),
      payload: EvaluateWikiArticleRevisionPayload,
    }),
  )
  .add(
    HttpApiEndpoint.put("setWikiArticleBookmark", "/wiki/:kind/:handle/bookmark", {
      params: WikiArticleLookup,
      payload: Schema.Struct({ state: BookmarkState }),
      error: [WikiArticleNotFoundError, UnauthorizedError, InvalidCrdtUpdateError],
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeWikiArticleBookmark", "/wiki/:kind/:handle/bookmark", {
      params: WikiArticleLookup,
      error: [WikiArticleNotFoundError, UnauthorizedError, InvalidCrdtUpdateError],
    }),
  )
  .add(
    HttpApiEndpoint.get("listWikiArticleBookmarkers", "/wiki/:kind/:handle/bookmarkers", {
      success: Schema.Array(WikiArticleBookmarker),
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
    }),
  )
  .add(
    HttpApiEndpoint.get("listWikiArticleContributors", "/wiki/:kind/:handle/contributors", {
      success: Schema.Array(WikiArticleContributor),
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
    }),
  )
  .add(
    HttpApiEndpoint.get("listWikiArticleCultivars", "/wiki/:kind/:handle/cultivars", {
      success: Schema.Array(WikiArticleQueriedCardData),
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
      query: Schema.Struct({ language: SupportedLanguage }),
    }),
  )
  .add(
    HttpApiEndpoint.get("listWikiArticleChildPlaces", "/wiki/:kind/:handle/child-places", {
      success: WikiChildPlacesPage,
      error: [WikiArticleNotFoundError, InvalidCrdtUpdateError],
      params: WikiArticleLookup,
      query: WikiChildPlacesParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("listExternalDataObservations", "/external-data/observations", {
      success: ExternalDataObservationLogPage,
      error: UnauthorizedError,
      query: ExternalDataObservationLogQuery,
    }),
  )
  .add(
    HttpApiEndpoint.get(
      "getExternalDataObservation",
      "/external-data/observations/:observationId",
      {
        success: ExternalDataObservationDetail,
        error: [UnauthorizedError, ExternalDataObservationNotFoundError],
        params: Schema.Struct({ observationId: ExternalDataObservationId }),
      },
    ),
  )
  .add(
    HttpApiEndpoint.put("setMainMedia", "/wiki/:wikiArticleId/main-media", {
      params: Schema.Struct({ wikiArticleId: WikiArticleId }),
      payload: Schema.Struct({ mediaAssetId: MediaAssetId }),
      error: [UnauthorizedError, WikiArticleNotFoundError, MediaNotFoundError],
    }),
  ) {}
