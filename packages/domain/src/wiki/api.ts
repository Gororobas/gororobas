import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { HandleTakenError } from "../common/errors.js"
import { WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import {
  WikiArticleEditableData,
  WikiArticleKind,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
  WikiSearchParams,
} from "./domain.js"
import { WikiArticleNotFoundError } from "./errors.js"

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
      params: Schema.Struct({ handle: Handle, kind: WikiArticleKind }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createWikiArticle", "/wiki", {
      success: Schema.Struct({ id: WikiArticleId, kind: WikiArticleKind, handle: Handle }),
      error: HandleTakenError,
      payload: Schema.Struct({ wikiArticle: WikiArticleEditableData }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createWikiArticleRevision", "/wiki/:kind/:handle/revisions", {
      success: Schema.Struct({ id: WikiArticleRevisionId }),
      error: WikiArticleNotFoundError,
      params: Schema.Struct({ handle: Handle, kind: WikiArticleKind }),
      payload: Schema.Struct({ crdtUpdate: LoroDocUpdate }),
    }),
  )
  .add(
    HttpApiEndpoint.post(
      "evaluateWikiArticleRevision",
      "/wiki/:kind/:handle/revision/:revision_id",
      {
        success: Schema.Struct({ id: WikiArticleRevisionId }),
        error: WikiArticleNotFoundError,
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
