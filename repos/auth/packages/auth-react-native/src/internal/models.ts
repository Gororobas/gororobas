import {
  PasskeyAssertion,
  PasskeyAttestation,
  PasskeyAuthenticationStarted,
} from "@yielded/auth/Passkey";
import { Schema } from "effect";

/** OS availability only; does not attest to entitlements, linking, or a saved key. */
export const PasskeyReactNativeCapabilities = Schema.Struct({
  supported: Schema.Boolean,
  conditionalGet: Schema.Literal("unsupported"),
  cancellation: Schema.Literal("unsupported"),
});

export type PasskeyReactNativeCapabilities = typeof PasskeyReactNativeCapabilities.Type;

export const PasskeyReactNativeRegistration = Schema.Struct({
  flowId: PasskeyAuthenticationStarted.fields.flowId,
  response: PasskeyAttestation,
});

export type PasskeyReactNativeRegistration = typeof PasskeyReactNativeRegistration.Type;

export const PasskeyReactNativeAuthentication = Schema.Struct({
  flowId: PasskeyAuthenticationStarted.fields.flowId,
  response: PasskeyAssertion,
});

export type PasskeyReactNativeAuthentication = typeof PasskeyReactNativeAuthentication.Type;

export class PasskeyReactNativeInputRejected extends Schema.TaggedError<PasskeyReactNativeInputRejected>()(
  "PasskeyReactNativeInputRejected",
  {},
) {}

export class PasskeyReactNativeUnsupported extends Schema.TaggedError<PasskeyReactNativeUnsupported>()(
  "PasskeyReactNativeUnsupported",
  {},
) {}

export class PasskeyReactNativeBusy extends Schema.TaggedError<PasskeyReactNativeBusy>()(
  "PasskeyReactNativeBusy",
  {},
) {}

/** A local outcome, never evidence that a credential was not created. */
export class PasskeyReactNativeNotCompleted extends Schema.TaggedError<PasskeyReactNativeNotCompleted>()(
  "PasskeyReactNativeNotCompleted",
  {
    reason: Schema.Literals([
      "cancelled",
      "no-credentials",
      "credential-exists",
      "interrupted",
      "timed-out",
      "request-failed",
    ]),
  },
) {}

export class PasskeyReactNativeInvalidResponse extends Schema.TaggedError<PasskeyReactNativeInvalidResponse>()(
  "PasskeyReactNativeInvalidResponse",
  {},
) {}

/** Configuration failures, native defects, and unrecognized failures; no native message/cause. */
export class PasskeyReactNativeUnavailable extends Schema.TaggedError<PasskeyReactNativeUnavailable>()(
  "PasskeyReactNativeUnavailable",
  {},
) {}

export const PasskeyReactNativeFailure = Schema.Union([
  PasskeyReactNativeInputRejected,
  PasskeyReactNativeUnsupported,
  PasskeyReactNativeBusy,
  PasskeyReactNativeNotCompleted,
  PasskeyReactNativeInvalidResponse,
  PasskeyReactNativeUnavailable,
]);

export type PasskeyReactNativeFailure = typeof PasskeyReactNativeFailure.Type;
