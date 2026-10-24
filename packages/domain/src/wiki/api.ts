import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { BookmarkState, SupportedLanguage } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { MediaAssetId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { InvalidMediaAssetError, MediaNotFoundError } from "../media-assets/errors.js"
import {
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
  EvaluateWikiArticleRevisionPayload,
  WikiArticleKind,
  WikiArticleLookup,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
  WikiSearchParams,
} from "./domain.js"
import {
  WikiArticleRevisionAlreadyEvaluatedError,
  WikiArticleRevisionNotFoundError,
  WikiArticleNotFoundError,
} from "./errors.js"
import { ExternalDataFetchError } from "./external-data/error.js"
import {
  BookIdSuggestion,
  BookIdSuggestionsQuery,
} from "./external-data/kinds/book-external-data.js"
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
      success: Schema.Array(WikiArticleQueriedCardData),
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
    HttpApiEndpoint.post("toggleWikiArticleBookmark", "/wiki/:kind/:handle/bookmark", {
      success: Schema.Literal(true),
      error: [WikiArticleNotFoundError, UnauthorizedError, InvalidCrdtUpdateError],
      params: Schema.Struct({ handle: Handle, kind: WikiArticleKind }),
    }),
  )
  .add(
    HttpApiEndpoint.put("setMainMedia", "/wiki/:wikiArticleId/main-media", {
      params: Schema.Struct({ wikiArticleId: WikiArticleId }),
      payload: Schema.Struct({ mediaAssetId: MediaAssetId }),
      error: [UnauthorizedError, WikiArticleNotFoundError, MediaNotFoundError],
    }),
  ) {}
