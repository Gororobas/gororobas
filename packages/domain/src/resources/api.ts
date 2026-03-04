/**
 * Resources HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

import { Locale } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { ResourceId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { ResourceCardData, ResourcePageData, ResourceSearchParams } from "./domain.js"
import { ResourceNotFoundError } from "./errors.js"

export class ResourcesApiGroup extends HttpApiGroup.make("resources")
  .add(
    HttpApiEndpoint.get("searchResources", "/resources")
      .addSuccess(Schema.Array(ResourceCardData))
      .setUrlParams(ResourceSearchParams),
  )
  .add(
    HttpApiEndpoint.get("getResourceByHandle", "/resources/:handle")
      .addSuccess(ResourcePageData)
      .addError(ResourceNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ handle: Handle })),
  )
  .add(
    HttpApiEndpoint.post("createResource", "/resources")
      .addSuccess(Schema.Struct({ id: ResourceId, handle: Handle }))
      .addError(HandleTakenError, { status: 409 })
      .setPayload(
        Schema.Struct({
          loroDoc: LoroDocSnapshot,
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("proposeResourceRevision", "/resources/:id/revisions")
      .addSuccess(Schema.Struct({ id: Schema.String }))
      .addError(ResourceNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ResourceId }))
      .setPayload(
        Schema.Struct({
          crdtUpdate: LoroDocUpdate,
          locale: Schema.optional(Locale),
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("getResourceLink", "/go/:id")
      .addSuccess(Schema.Struct({ url: Schema.NonEmptyTrimmedString }))
      .addError(ResourceNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ResourceId })),
  )
  .add(
    HttpApiEndpoint.post("toggleResourceBookmark", "/resources/:id/bookmark")
      .addSuccess(Schema.Literal(true))
      .addError(ResourceNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ResourceId })),
  ) {}
