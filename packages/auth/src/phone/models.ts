import { Schema } from "effect";

import { RequestBindingCredential, RequestBindingFlowId } from "../operations/requestBinding";
import { ProofReference } from "../proofs/models";
import { AuthenticationRevision, SecurityRevision } from "../sessions/models";

/** Canonical international input. Country eligibility belongs to the application. */
export const PhoneNumber = Schema.String.check(Schema.isPattern(/^\+[1-9][0-9]{1,14}$/));
export type PhoneNumber = typeof PhoneNumber.Type;

export const PhoneOtpComplete = Schema.Struct({
  flowId: RequestBindingFlowId,
  phoneNumber: PhoneNumber,
  requestBinding: RequestBindingCredential,
  reference: ProofReference,
  code: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[0-9]{6,10}$/))),
});

export type PhoneOtpComplete = typeof PhoneOtpComplete.Type;

export const PhoneCredentialSnapshot = Schema.Struct({
  moduleId: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  phoneNumber: PhoneNumber,
  custodyRevision: SecurityRevision,
  verifiedAtMillis: Schema.Int,
  credentialId: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  credentialRevision: SecurityRevision,
  revision: AuthenticationRevision,
});

export type PhoneCredentialSnapshot = typeof PhoneCredentialSnapshot.Type;

export class PhoneOtpRejected extends Schema.TaggedError<PhoneOtpRejected>()(
  "PhoneOtpRejected",
  {},
) {}

export class PhoneOtpUnavailable extends Schema.TaggedError<PhoneOtpUnavailable>()(
  "PhoneOtpUnavailable",
  {},
) {}
