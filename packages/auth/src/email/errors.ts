import { Schema } from "effect";

import { HookDenied } from "../hooks/models";
import {
  ProofInvalid,
  ProofRequestConflict,
  ProofIngressDenied,
  ProofCapabilityUnsupported,
} from "../proofs/errors";
import {
  SessionCapabilityUnsupported,
  SessionInvalid,
  SessionConflict,
  PendingAuthenticationInvalid,
  StaleAuthentication,
} from "../sessions/errors";

export class EmailRejected extends Schema.TaggedError<EmailRejected>()("EmailRejected", {}) {}

export class EmailUnavailable extends Schema.TaggedError<EmailUnavailable>()(
  "EmailUnavailable",
  {},
) {}

export class EmailActionRequired extends Schema.TaggedError<EmailActionRequired>()(
  "EmailActionRequired",
  {},
) {}

export class EmailMethodUnsupported extends Schema.TaggedError<EmailMethodUnsupported>()(
  "EmailMethodUnsupported",
  {},
) {}

export class EmailConfigurationError extends Schema.TaggedError<EmailConfigurationError>()(
  "EmailConfigurationError",
  {},
) {}

/** Unknown completion/receipt failures may follow a durable write. */
export const emailCompletionFailure = (
  error: unknown,
): EmailRejected | EmailUnavailable | EmailMethodUnsupported | HookDenied => {
  if (Schema.is(HookDenied)(error)) return error;
  if (Schema.is(Schema.Union([SessionCapabilityUnsupported, ProofCapabilityUnsupported]))(error))
    return EmailMethodUnsupported.make({});
  if (
    Schema.is(
      Schema.Union([
        ProofIngressDenied,
        SessionInvalid,
        SessionConflict,
        PendingAuthenticationInvalid,
        StaleAuthentication,
        ProofInvalid,
        ProofRequestConflict,
      ]),
    )(error)
  )
    return EmailRejected.make({});

  return EmailUnavailable.make({});
};
