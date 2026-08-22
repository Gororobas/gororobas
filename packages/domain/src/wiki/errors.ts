/** Wiki article-related errors. */
import { Schema } from "effect"

import { WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { WikiArticleKind } from "./wiki-article.js"

export class WikiArticleNotFoundError extends Schema.TaggedError<WikiArticleNotFoundError>()(
  "WikiArticleNotFoundError",
  {
    id: Schema.optional(WikiArticleId),
    handle: Schema.optional(Handle),
    kind: Schema.optional(WikiArticleKind),
  },
  { httpApiStatus: 404 },
) {}

export class WikiArticleRevisionNotFoundError extends Schema.TaggedError<WikiArticleRevisionNotFoundError>()(
  "WikiArticleRevisionNotFoundError",
  { id: Schema.optional(WikiArticleRevisionId) },
  { httpApiStatus: 404 },
) {}
