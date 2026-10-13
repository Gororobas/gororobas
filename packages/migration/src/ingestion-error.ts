import { Schema } from "effect"

export class IngestionError extends Schema.TaggedError<IngestionError>()("IngestionError", {
  message: Schema.String,
}) {}
