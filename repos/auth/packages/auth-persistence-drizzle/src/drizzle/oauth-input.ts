import {
  OAuthAccountRevision,
  OAuthActionAuthorization,
  OAuthLinkAccess,
  OAuthLinkClaim,
  OAuthLinkOutcome,
  OAuthLinkPendingFlow,
  OAuthRegistrationAccess,
  OAuthRegistrationFingerprint,
  OAuthRegistrationIntent,
  OAuthClaim,
  OAuthClaimId,
  OAuthCleanupInput,
  OAuthCommandId,
  OAuthCredentialSnapshot,
  OAuthInstant,
  OAuthModuleId,
  OAuthPendingFlow,
  OAuthSignInTransactionContext,
  OAuthVerifiedExternalIdentity,
  snapshotOAuthSync,
  type OAuthUnavailable,
} from "@yielded/auth/OAuth";
import { SessionInvalidationWindow } from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- private adapter wraps only the Effect-valued semantic ports. */
import { Effect, Schema } from "effect";

import { invariant, unavailable } from "./oauth-state";

const fields = OAuthSignInTransactionContext.fields;

const claimInput = Schema.Struct({
  moduleId: fields.moduleId,
  generation: fields.generation,
  flowId: fields.flowId,
  provider: fields.provider,
  callbackId: fields.callbackId,
  stateDigest: fields.stateDigest,
  requestBindingVerifier: fields.requestBindingVerifier,
  requestBindingExpiresAtMillis: fields.requestBindingExpiresAtMillis,
  responseIssuer: Schema.optionalKey(fields.issuer),
  claimId: OAuthClaimId,
  nowMillis: OAuthInstant,
});

const signInOutcome = Schema.Union([
  Schema.TaggedStruct("Verified", { identity: OAuthVerifiedExternalIdentity }),
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("Ambiguous", {}),
]);

const signInSettle = Schema.Struct({
  claim: OAuthClaim,
  outcome: signInOutcome,
  nowMillis: OAuthInstant,
});

const registrationSettle = Schema.Struct({
  claim: OAuthClaim,
  identity: OAuthVerifiedExternalIdentity,
  intent: Schema.optionalKey(OAuthRegistrationIntent),
  nowMillis: OAuthInstant,
});

const registerPrivate = Schema.Struct({
  access: OAuthRegistrationAccess,
  intent: OAuthRegistrationIntent,
  commandId: OAuthCommandId,
  fingerprint: OAuthRegistrationFingerprint,
});

const capture = Schema.Struct({
  moduleId: OAuthModuleId,
  subjectId: OAuthAccountRevision.fields.subjectId,
});

const linkIssue = Schema.Struct({
  flow: OAuthLinkPendingFlow,
  authorization: OAuthActionAuthorization,
});

const linkClaim = Schema.Struct({
  access: OAuthLinkAccess,
  flow: OAuthLinkPendingFlow,
  claimId: OAuthClaimId,
  authorization: OAuthActionAuthorization,
});

const linkSettle = Schema.Struct({
  claim: OAuthLinkClaim,
  outcome: OAuthLinkOutcome,
  authorization: OAuthActionAuthorization,
  invalidation: SessionInvalidationWindow,
  nowMillis: OAuthInstant,
});

const unlinkInspect = Schema.Struct({
  moduleId: OAuthModuleId,
  subjectId: OAuthAccountRevision.fields.subjectId,
  commandId: OAuthCommandId,
  credentialId: OAuthCredentialSnapshot.fields.credentialId,
});

const unlink = Schema.Struct({
  moduleId: OAuthModuleId,
  commandId: OAuthCommandId,
  credential: OAuthCredentialSnapshot,
  authorization: OAuthActionAuthorization,
  invalidation: SessionInvalidationWindow,
  nowMillis: OAuthInstant,
  retentionUntilMillis: OAuthInstant,
});

const snapshot = (schema: Schema.Codec<any, any, never, never>) => (input: any) =>
  snapshotOAuthSync(schema, input);

export const signInInputs = {
  issue: snapshot(OAuthPendingFlow),
  claim: snapshot(claimInput),
  settle: snapshot(signInSettle),
  cleanup: snapshot(OAuthCleanupInput),
};

export const registrationIntentInputs = { settle: snapshot(registrationSettle) };

const capturedApplication = (
  application: { readonly encode: (data: any) => string; readonly decode: (stored: string) => any },
  data: any,
) => {
  const encoded = application.encode(data);

  invariant(typeof encoded === "string" && new TextEncoder().encode(encoded).length <= 1048576);
  const retained = application.decode(encoded);

  invariant(application.encode(retained) === encoded);

  return retained;
};

export const registrationInputs = (application: {
  readonly encode: (data: any) => string;
  readonly decode: (stored: string) => any;
}) => ({
  read: snapshot(OAuthRegistrationAccess),
  inspect: (input: any) => ({
    intent: snapshotOAuthSync(OAuthRegistrationIntent, input.intent),
    registration: capturedApplication(application, input.registration),
  }),
  register: (input: any) => ({
    ...snapshotOAuthSync(registerPrivate, input),
    registration: capturedApplication(application, input.registration),
  }),
  cleanup: snapshot(OAuthCleanupInput),
});

export const accountsInputs = {
  capture: snapshot(capture),
  issue: snapshot(linkIssue),
  preflight: snapshot(OAuthLinkAccess),
  claim: snapshot(linkClaim),
  settle: snapshot(linkSettle),
  inspectUnlink: snapshot(unlinkInspect),
  unlink: snapshot(unlink),
  cleanup: snapshot(OAuthCleanupInput),
};

/** Snapshot before the first asynchronous owner/allocator step; closed bound
 * authorities reject before running even an application codec or inspector. */
export const capturedOAuthService = <
  S extends { [K in keyof S]: (...args: any[]) => Effect.Effect<any, OAuthUnavailable> },
>(
  service: S,
  inputs: { readonly [K in keyof S]: (input: any) => any },
  active: () => boolean,
  poison: () => void,
): S =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(service).map(([key, method]) => [
        key,
        (input: any, prepare?: any) =>
          Effect.suspend(() => {
            if (!active()) return Effect.fail(unavailable());
            const retained = inputs[key as keyof S](input);

            return (method as (...args: any[]) => Effect.Effect<any, OAuthUnavailable>)(
              retained,
              prepare,
            );
          }).pipe(
            Effect.onExit((exit) =>
              Effect.sync(() => {
                if (exit._tag === "Failure") poison();
              }),
            ),
            Effect.catchDefect(() => Effect.fail(unavailable())),
          ),
      ]),
    ),
  ) as S;
