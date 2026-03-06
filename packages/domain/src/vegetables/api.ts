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
    HttpApiEndpoint.get("searchVegetables", "/vegetables", {
      success: Schema.Array(VegetableCardData),
      query: VegetableSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getVegetableByHandle", "/vegetables/:handle", {
      success: VegetablePageData,
      error: VegetableNotFoundError,
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createVegetable", "/vegetables", {
      success: Schema.Struct({ id: VegetableId, handle: Handle }),
      error: HandleTakenError,
      payload: Schema.Struct({
        loroDoc: LoroDocSnapshot,
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createVegetableRevision", "/vegetables:handle/revisions", {
      success: Schema.Struct({ id: VegetableRevisionId }),
      error: VegetableNotFoundError,
      payload: Schema.Struct({
        crdtUpdate: LoroDocUpdate,
      }),
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("evaluateVegetableRevision", "/vegetables/:handle/revision/:revision_id", {
      success: Schema.Struct({ id: VegetableRevisionId }),
      error: VegetableNotFoundError,
      payload: Schema.Struct({
        approved: Schema.Boolean,
        reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
      }),
      params: Schema.Struct({ handle: Handle, revisionId: VegetableRevisionId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("toggleVegetableBookmark", "/vegetables/:handle/bookmark", {
      success: Schema.Literal(true),
      error: VegetableNotFoundError,
      params: Schema.Struct({ id: VegetableId }),
    }),
  ) {}
