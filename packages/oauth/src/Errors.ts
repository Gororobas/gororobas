import { Schema } from "effect";

/** Local protocol configuration is invalid; no remote response or credential is retained. */
export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "OAuthConfigurationError",
  {
    reason: Schema.Literals(["issuer", "metadata", "authentication", "parameters", "endpoint"]),
  },
) {}

/** A definite, authenticated claim rejection or a complete HTTP 400 invalid_grant. */
export class Rejected extends Schema.TaggedError<Rejected>()("OAuthRejected", {
  reason: Schema.Literals(["invalid_grant", "claims"]),
}) {}

/** The outcome is unknown. This error never authorizes retrying a grant. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("OAuthUnavailable", {}) {}
