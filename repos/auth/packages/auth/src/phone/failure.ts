import { Schema } from "effect";

import { HookDenied } from "../hooks/models";
import { RequestBindingInvalid } from "../operations/requestBinding";
import { ProofInvalid, ProofRequestConflict } from "../proofs/errors";
import {
  PendingAuthenticationInvalid,
  SessionConflict,
  SessionInvalid,
  StaleAuthentication,
} from "../sessions/errors";
import { PhoneActionRequired } from "./lifecycleModels";
import { PhoneOtpRejected, PhoneOtpUnavailable } from "./models";

/** An unavailable/ambiguous commit cannot truthfully be reported as rejected. */
export const phoneFailure = (
  error: unknown,
): PhoneOtpRejected | PhoneOtpUnavailable | HookDenied => {
  if (Schema.is(HookDenied)(error)) return error;
  if (Schema.is(PhoneOtpUnavailable)(error)) return error;
  if (
    Schema.is(PhoneOtpRejected)(error) ||
    Schema.is(RequestBindingInvalid)(error) ||
    Schema.is(ProofInvalid)(error) ||
    Schema.is(ProofRequestConflict)(error) ||
    Schema.is(StaleAuthentication)(error) ||
    Schema.is(PendingAuthenticationInvalid)(error) ||
    Schema.is(SessionInvalid)(error) ||
    Schema.is(SessionConflict)(error)
  )
    return PhoneOtpRejected.make({});

  return PhoneOtpUnavailable.make({});
};

export const phoneActionFailure = (error: unknown) => {
  const failure = phoneFailure(error);

  return failure._tag === "PhoneOtpRejected" ? PhoneActionRequired.make({}) : failure;
};
