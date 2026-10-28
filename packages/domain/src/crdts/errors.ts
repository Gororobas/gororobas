import { Schema } from "effect"

import { LoroListItemId } from "../common/ids.js"

export class InvalidCrdtUpdateError extends Schema.TaggedError<InvalidCrdtUpdateError>()(
  "InvalidCrdtUpdateError",
  {
    /** `InvariantViolation`: the document is valid on its own, but not as a successor of the current one. */
    reason: Schema.Union([
      Schema.Literal("InvalidFormat"),
      Schema.Literal("SchemaValidation"),
      Schema.Literal("InvariantViolation"),
    ]),
  },
  { httpApiStatus: 400 },
) {}

export class CrdtListItemNotFoundError extends Schema.TaggedError<CrdtListItemNotFoundError>()(
  "CrdtListItemNotFoundError",
  {
    id: LoroListItemId,
    list: Schema.String,
  },
) {}

export class CrdtContainerNotFoundError extends Schema.TaggedError<CrdtContainerNotFoundError>()(
  "CrdtContainerNotFoundError",
  {
    path: Schema.Array(Schema.String),
  },
) {}
