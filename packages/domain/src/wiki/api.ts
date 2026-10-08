import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { SupportedLanguage } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { InvalidMediaAssetError, MediaNotFoundError } from "../media-assets/errors.js"
import {
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
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

export class WikiApiGroup extends HttpApiGroup.make("wiki")
  .add(
    HttpApiEndpoint.get("searchWikiArticles", "/wiki", {
      success: Schema.Array(WikiArticleQueriedCardData),
      query: WikiSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getWikiArticleByHandleAndKind", "/wiki/:kind/:handle", {
      success: WikiArticleQueriedPageData,
      error: WikiArticleNotFoundError,
      params: WikiArticleLookup,
      query: Schema.Struct({ language: Schema.optional(SupportedLanguage) }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createWikiArticle", "/wiki", {
      success: Schema.Struct({ id: WikiArticleId, kind: WikiArticleKind, handle: Handle }),
      error: [
        HandleTakenError,
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
    HttpApiEndpoint.post(
      "evaluateWikiArticleRevision",
      "/wiki/:kind/:handle/revision/:revision_id",
      {
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
          handle: Handle,
          kind: WikiArticleKind,
          revisionId: WikiArticleRevisionId,
        }),
        payload: Schema.Struct({
          isApproved: Schema.Boolean,
          reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
        }),
      },
    ),
  )
  .add(
    HttpApiEndpoint.post("toggleWikiArticleBookmark", "/wiki/:kind/:handle/bookmark", {
      success: Schema.Literal(true),
      error: WikiArticleNotFoundError,
      params: Schema.Struct({ handle: Handle, kind: WikiArticleKind }),
    }),
  ) {}
