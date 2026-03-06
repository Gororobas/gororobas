import { Schema } from "effect"
/**
 * Resources HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { Locale } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { ResourceId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { ResourceCardData, ResourcePageData, ResourceSearchParams } from "./domain.js"
import { ResourceNotFoundError } from "./errors.js"

export class ResourcesApiGroup extends HttpApiGroup.make("resources")
  .add(
    HttpApiEndpoint.get("searchResources", "/resources", {
      success: Schema.Array(ResourceCardData),
      query: ResourceSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getResourceByHandle", "/resources/:handle", {
      success: ResourcePageData,
      error: ResourceNotFoundError,
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createResource", "/resources", {
      success: Schema.Struct({ id: ResourceId, handle: Handle }),
      error: HandleTakenError,
      payload: Schema.Struct({
        loroDoc: LoroDocSnapshot,
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("proposeResourceRevision", "/resources/:id/revisions", {
      success: Schema.Struct({ id: Schema.String }),
      error: ResourceNotFoundError,
      params: Schema.Struct({ id: ResourceId }),
      payload: Schema.Struct({
        crdtUpdate: LoroDocUpdate,
        locale: Schema.optional(Locale),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getResourceLink", "/go/:id", {
      success: Schema.Struct({ url: Schema.Trimmed.check(Schema.isNonEmpty()) }),
      error: ResourceNotFoundError,
      params: Schema.Struct({ id: ResourceId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("toggleResourceBookmark", "/resources/:id/bookmark", {
      success: Schema.Literal(true),
      error: ResourceNotFoundError,
      params: Schema.Struct({ id: ResourceId }),
    }),
  ) {}
