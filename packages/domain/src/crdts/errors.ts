import { Schema } from "effect"

export class InvalidCrdtUpdateError extends Schema.TaggedErrorClass<InvalidCrdtUpdateError>()(
  "InvalidCrdtUpdateError",
  {
    reason: Schema.Union([Schema.Literal("InvalidFormat"), Schema.Literal("SchemaValidation")]),
  },
) {}
