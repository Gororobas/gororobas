import { Schema } from "effect";

export class OAuthRejected extends Schema.TaggedError<OAuthRejected>()("OAuthRejected", {}) {}

export class OAuthUnavailable extends Schema.TaggedError<OAuthUnavailable>()(
  "OAuthUnavailable",
  {},
) {}

export class OAuthMethodUnsupported extends Schema.TaggedError<OAuthMethodUnsupported>()(
  "OAuthMethodUnsupported",
  {},
) {}

export class OAuthProtocolRejected extends Schema.TaggedError<OAuthProtocolRejected>()(
  "OAuthProtocolRejected",
  {},
) {}

export class OAuthConfigurationError extends Schema.TaggedError<OAuthConfigurationError>()(
  "OAuthConfigurationError",
  { reason: Schema.Literals(["module", "policy", "keyring", "return-target"]) },
) {}
