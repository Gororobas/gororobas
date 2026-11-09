/** Wiki article-related errors. */
import { Schema } from "effect"

import { WikidataId } from "../common/external-identifiers.js"
import { ExternalDataObservationId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
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

export class WikiArticleRevisionAlreadyEvaluatedError extends Schema.TaggedError<WikiArticleRevisionAlreadyEvaluatedError>()(
  "WikiArticleRevisionAlreadyEvaluatedError",
  { id: WikiArticleRevisionId },
  { httpApiStatus: 409 },
) {}

export class WikiArticleWikidataIdTakenError extends Schema.TaggedError<WikiArticleWikidataIdTakenError>()(
  "WikiArticleWikidataIdTakenError",
  { wikidataId: WikidataId, wikiArticleId: WikiArticleId },
  { httpApiStatus: 409 },
) {}

export class ExternalDataObservationNotFoundError extends Schema.TaggedError<ExternalDataObservationNotFoundError>()(
  "ExternalDataObservationNotFoundError",
  { id: ExternalDataObservationId },
  { httpApiStatus: 404 },
) {}
