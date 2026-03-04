/**
 * Tags HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

import { TagId } from "../common/ids.js"
import { TagRow } from "./domain.js"

export class TagsApiGroup extends HttpApiGroup.make("tags")
  .add(HttpApiEndpoint.get("getAllTags", "/tags").addSuccess(Schema.Array(TagRow)))
  .add(
    HttpApiEndpoint.post("createTag", "/tags")
      .addSuccess(Schema.Struct({ id: TagId }))
      .setPayload(TagRow.omit("createdAt", "createdById", "updatedAt", "handle")),
  )
  .add(
    HttpApiEndpoint.patch("editTag", "/tags/:id")
      .addSuccess(Schema.Struct({ id: TagId }))
      .setPath(Schema.Struct({ id: TagId }))
      .setPayload(TagRow.omit("createdAt", "createdById", "updatedAt", "handle")),
  ) {}
