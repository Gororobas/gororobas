import { Schema } from "effect";

export class ProofInvalid extends Schema.TaggedError<ProofInvalid>()("ProofInvalid", {}) {}

export class ProofUnavailable extends Schema.TaggedError<ProofUnavailable>()(
  "ProofUnavailable",
  {},
) {}

export class ProofConfigurationError extends Schema.TaggedError<ProofConfigurationError>()(
  "ProofConfigurationError",
  {
    reason: Schema.Literals([
      "policy",
      "keyring",
      "binding",
      "delivery",
      "unsupported-transaction",
    ]),
  },
) {}

export class ProofRequestConflict extends Schema.TaggedError<ProofRequestConflict>()(
  "ProofRequestConflict",
  {},
) {}

export class ProofCapabilityUnsupported extends Schema.TaggedError<ProofCapabilityUnsupported>()(
  "ProofCapabilityUnsupported",
  {},
) {}

export class ProofIngressDenied extends Schema.TaggedError<ProofIngressDenied>()(
  "ProofIngressDenied",
  {},
) {}

export const ProofError = Schema.Union([
  ProofInvalid,
  ProofUnavailable,
  ProofRequestConflict,
  ProofCapabilityUnsupported,
  ProofIngressDenied,
]);

export type ProofError = typeof ProofError.Type;
