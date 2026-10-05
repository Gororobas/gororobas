import { RequestBindingFlowId } from "@yielded/auth/Operations";
import { PasskeyAssertion, PasskeyAttestation } from "@yielded/auth/Passkey";
import { Schema } from "effect";

export const PasskeyBrowserCapability = Schema.Literals(["supported", "unsupported", "unknown"]);
export type PasskeyBrowserCapability = typeof PasskeyBrowserCapability.Type;

export const PasskeyBrowserCapabilities = Schema.Struct({
  secureContext: Schema.Boolean,
  webAuthn: Schema.Boolean,
  conditionalGet: PasskeyBrowserCapability,
  userVerifyingPlatformAuthenticator: PasskeyBrowserCapability,
  hybridTransport: PasskeyBrowserCapability,
  passkeyPlatformAuthenticator: PasskeyBrowserCapability,
});

export type PasskeyBrowserCapabilities = typeof PasskeyBrowserCapabilities.Type;

export const PasskeyBrowserRegistration = Schema.Struct({
  flowId: RequestBindingFlowId,
  response: PasskeyAttestation,
});

export type PasskeyBrowserRegistration = typeof PasskeyBrowserRegistration.Type;

export const PasskeyBrowserAuthentication = Schema.Struct({
  flowId: RequestBindingFlowId,
  response: PasskeyAssertion,
});

export type PasskeyBrowserAuthentication = typeof PasskeyBrowserAuthentication.Type;

export class PasskeyBrowserInputRejected extends Schema.TaggedError<PasskeyBrowserInputRejected>()(
  "PasskeyBrowserInputRejected",
  {},
) {}

export class PasskeyBrowserUnsupported extends Schema.TaggedError<PasskeyBrowserUnsupported>()(
  "PasskeyBrowserUnsupported",
  {},
) {}

export class PasskeyBrowserBusy extends Schema.TaggedError<PasskeyBrowserBusy>()(
  "PasskeyBrowserBusy",
  {},
) {}

export class PasskeyBrowserNotCompleted extends Schema.TaggedError<PasskeyBrowserNotCompleted>()(
  "PasskeyBrowserNotCompleted",
  {},
) {}

export class PasskeyBrowserUnavailable extends Schema.TaggedError<PasskeyBrowserUnavailable>()(
  "PasskeyBrowserUnavailable",
  {},
) {}

export const PasskeyBrowserFailure = Schema.Union([
  PasskeyBrowserInputRejected,
  PasskeyBrowserUnsupported,
  PasskeyBrowserBusy,
  PasskeyBrowserNotCompleted,
  PasskeyBrowserUnavailable,
]);

export type PasskeyBrowserFailure = typeof PasskeyBrowserFailure.Type;
