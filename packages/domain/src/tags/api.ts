import { Schema } from "effect"
/**
 * Tags HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { Locale } from "../common/enums.js"
import { TagId } from "../common/ids.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { TagRow } from "./domain.js"
import { TagNotFoundError } from "./errors.js"

const CreateTagData = Schema.Struct({
  id: TagId,
  cluster: Schema.NullOr(Schema.String),
  description: Schema.NullOr(TiptapDocument),
  names: Schema.fromJsonString(Schema.Record(Locale, Schema.Trimmed.check(Schema.isNonEmpty()))),
})

export class TagsApiGroup extends HttpApiGroup.make("tags")
  .add(
    HttpApiEndpoint.get("getAllTags", "/tags", {
      success: Schema.Array(TagRow),
    }),
  )
  .add(
    HttpApiEndpoint.post("createTag", "/tags", {
      success: Schema.Struct({ id: TagId }),
      payload: CreateTagData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("editTag", "/tags/:id", {
      success: Schema.Struct({ id: TagId }),
      params: Schema.Struct({ id: TagId }),
      error: TagNotFoundError,
      payload: CreateTagData,
    }),
  ) {}
