import { Crypto, DateTime, Effect, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { TokenDigest } from "../Schema";
import {
  OAuthRegistrationIntent,
  OAuthRegistrationReference,
  type OAuthRegistrationPolicy,
} from "./registrationModels";
import { OAuthRejected, OAuthUnavailable } from "./signInErrors";
import type { OAuthClaim, OAuthVerifiedExternalIdentity } from "./signInModels";
import { snapshotOAuthSync } from "./signInSnapshot";

const tuple = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-registration-bearer/v1"),
    OAuthRegistrationIntent.fields.context.fields.moduleId,
    OAuthRegistrationReference,
    OAuthRegistrationIntent.fields.context.fields.flowId,
    Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  ]),
);

export const credentialDigest = Effect.fn("OAuthRegistration.credentialDigest")(function* (
  moduleId: typeof OAuthRegistrationIntent.Type.context.moduleId,
  reference: OAuthRegistrationReference,
  flowId: typeof OAuthRegistrationIntent.Type.context.flowId,
  credential: Redacted.Redacted<string>,
) {
  const { digest } = yield* Crypto.Crypto;
  const raw = Redacted.value(credential);

  if (!Schema.is(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)))(raw))
    return yield* OAuthRejected.make({});
  const bytes = Result.getOrUndefined(Base64Url.decode(raw));

  if (
    raw.length !== 43 ||
    bytes === undefined ||
    bytes.length !== 32 ||
    Base64Url.encode(bytes) !== raw
  ) {
    bytes?.fill(0);

    return yield* OAuthRejected.make({});
  }
  bytes.fill(0);

  const encoded = yield* Schema.encodeEffect(tuple)([
    "effect-auth/oauth-registration-bearer/v1",
    moduleId,
    reference,
    flowId,
    raw,
  ]).pipe(Effect.mapError(() => OAuthRejected.make({})));

  const value = yield* digest("SHA-256", new TextEncoder().encode(encoded)).pipe(
    Effect.mapError(() => OAuthUnavailable.make({})),
  );

  return TokenDigest.make(Base64Url.encode(value));
});

export const prepare = Effect.fn("OAuthRegistration.prepareIntent")(function* (
  claim: OAuthClaim,
  identity: OAuthVerifiedExternalIdentity,
  verifiedAtMillis: number,
  policy: OAuthRegistrationPolicy,
) {
  const { randomBytes } = yield* Crypto.Crypto;
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  const expiresAtMillis = Math.min(
    now + policy.lifetimeMillis,
    claim.flow.context.requestBindingExpiresAtMillis,
    verifiedAtMillis + policy.maximumVerificationAgeMillis,
  );

  if (expiresAtMillis <= now) return undefined;

  const referenceBytes = yield* randomBytes(32).pipe(
    Effect.mapError(() => OAuthUnavailable.make({})),
  );

  const reference = OAuthRegistrationReference.make(Base64Url.encode(referenceBytes));

  referenceBytes.fill(0);

  const credentialBytes = yield* randomBytes(32).pipe(
    Effect.mapError(() => OAuthUnavailable.make({})),
  );

  const credential = Redacted.make(Base64Url.encode(credentialBytes));

  credentialBytes.fill(0);

  const intent = snapshotOAuthSync(OAuthRegistrationIntent, {
    namespace: "effect-auth/oauth-registration-intent/v1",
    reference,
    context: claim.flow.context,
    claimId: claim.claimId,
    claimedAtMillis: claim.claimedAtMillis,
    identity: identity.identity,
    ...(identity.profile === undefined ? {} : { profile: identity.profile }),
    verifiedAtMillis,
    credentialDigest: yield* credentialDigest(
      claim.flow.context.moduleId,
      reference,
      claim.flow.context.flowId,
      credential,
    ),
    issuedAtMillis: now,
    expiresAtMillis,
    retentionUntilMillis: Math.max(
      claim.flow.retentionUntilMillis,
      expiresAtMillis + policy.retentionMillis,
    ),
  });

  return {
    intent,
    command: Object.freeze({
      _tag: "Issue" as const,
      slot: "registration" as const,
      credential,
      expiresAtMillis,
    }),
  };
});
