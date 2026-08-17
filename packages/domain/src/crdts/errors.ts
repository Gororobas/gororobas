import { Schema } from "effect"

export class InvalidCrdtUpdateError extends Schema.TaggedError<InvalidCrdtUpdateError>()(
  "InvalidCrdtUpdateError",
  {
    reason: Schema.Union([Schema.Literal("InvalidFormat"), Schema.Literal("SchemaValidation")]),
  },
) {}
