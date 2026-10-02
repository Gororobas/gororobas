import { Schema } from "effect"

export class ExternalDataFetchError extends Schema.TaggedError<ExternalDataFetchError>()(
  "ExternalDataFetchError",
  {
    provider: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
  },
) {}
