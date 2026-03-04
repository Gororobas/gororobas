import { Schema } from "effect"
/**
 * Vegetables HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { HandleTakenError } from "../common/errors.js"
import { VegetableId, VegetableRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { VegetableCardData, VegetablePageData, VegetableSearchParams } from "./domain.js"
import { VegetableNotFoundError } from "./errors.js"

export class VegetablesApiGroup extends HttpApiGroup.make("vegetables")
  .add(
    HttpApiEndpoint.get("searchVegetables", "/vegetables")
      .addSuccess(Schema.Array(VegetableCardData))
      .setUrlParams(VegetableSearchParams),
  )
  .add(
    HttpApiEndpoint.get("getVegetableByHandle", "/vegetables/:handle")
      .addSuccess(VegetablePageData)
      .addError(VegetableNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ handle: Handle })),
  )
  .add(
    HttpApiEndpoint.post("createVegetable", "/vegetables")
      .addSuccess(Schema.Struct({ id: VegetableId, handle: Handle }))
      .addError(HandleTakenError, { status: 409 })
      .setPayload(
        Schema.Struct({
          loroDoc: LoroDocSnapshot,
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("createVegetableRevision", "/vegetables/:handle/revisions")
      .addSuccess(Schema.Struct({ id: VegetableRevisionId }))
      .addError(VegetableNotFoundError, { status: 404 })
      .setPayload(Schema.Struct({ crdtUpdate: LoroDocUpdate }))
      .setPath(Schema.Struct({ handle: Handle })),
  )
  .add(
    HttpApiEndpoint.post("evaluateVegetableRevision", "/vegetables/:handle/revision/:revision_id")
      .addSuccess(Schema.Struct({ id: VegetableRevisionId }))
      .addError(VegetableNotFoundError, { status: 404 })
      .setPayload(
        Schema.Struct({
          approved: Schema.Boolean,
          reason: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
      )
      .setPath(Schema.Struct({ handle: Handle, revisionId: VegetableRevisionId })),
  )
  .add(
    HttpApiEndpoint.post("toggleVegetableBookmark", "/vegetables/:handle/bookmark")
      .addSuccess(Schema.Literal(true))
      .addError(VegetableNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: VegetableId })),
  ) {}
