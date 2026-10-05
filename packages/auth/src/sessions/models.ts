import { Schema } from "effect";

import { AuthenticationAssurance, AuthenticationFactor } from "../operations/context";
import { SubjectId, TokenDigest } from "../Schema";

export const SessionId = Schema.NonEmptyString.pipe(Schema.brand("effect-auth/SessionId"));
export type SessionId = typeof SessionId.Type;

export const SecurityRevision = Schema.NonEmptyString.pipe(
  Schema.brand("effect-auth/SecurityRevision"),
);

export type SecurityRevision = typeof SecurityRevision.Type;

export const AuthenticationFlowId = Schema.NonEmptyString.pipe(
  Schema.brand("effect-auth/AuthenticationFlowId"),
);

export type AuthenticationFlowId = typeof AuthenticationFlowId.Type;

export const CredentialRevision = Schema.Struct({
  credentialId: Schema.NonEmptyString,
  revision: SecurityRevision,
});

export type CredentialRevision = typeof CredentialRevision.Type;

/** Captured by the method's authority before cryptographic credential verification begins. */
export const AuthenticationRevision = Schema.Struct({
  subjectId: SubjectId,
  securityRevision: SecurityRevision,
  credentials: Schema.Array(CredentialRevision).check(Schema.isMaxLength(64)),
});

export type AuthenticationRevision = typeof AuthenticationRevision.Type;

export const AuthenticationProof = Schema.Struct({
  method: Schema.NonEmptyString,
  /** Distinguishes independently verified credentials without exposing credential material. */
  credentialId: Schema.NonEmptyString,
  factors: Schema.Array(AuthenticationFactor),
  userVerified: Schema.Boolean,
  phishingResistant: Schema.Boolean,
  verifiedAt: Schema.DateTimeUtcFromMillis,
});

export type AuthenticationProof = typeof AuthenticationProof.Type;

/** Trusted method evidence. No public endpoint accepts subject/factor assertions as proof. */
export const AuthenticationEvidence = Schema.Struct({
  revision: AuthenticationRevision,
  flowId: AuthenticationFlowId,
  bindingDigest: TokenDigest,
  proofs: Schema.NonEmptyArray(AuthenticationProof).check(Schema.isMaxLength(64)),
});

export type AuthenticationEvidence = typeof AuthenticationEvidence.Type;

/** Private authenticated source evidence. Never derive this from public metadata. */
export const SessionAuthenticationProvenance = Schema.Struct({
  evidence: Schema.Struct({
    ...AuthenticationEvidence.fields,
    revision: Schema.Struct({
      ...AuthenticationRevision.fields,
      credentials: Schema.Array(CredentialRevision).check(Schema.isMaxLength(64)),
    }),
    proofs: Schema.NonEmptyArray(AuthenticationProof).check(Schema.isMaxLength(64)),
  }),
});

export type SessionAuthenticationProvenance = typeof SessionAuthenticationProvenance.Type;

/** Identifies the exact issued credential, independently of storage CAS versions. */
export const SessionCredentialVersion = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{43}$/),
).pipe(Schema.brand("effect-auth/SessionCredentialVersion"));

export type SessionCredentialVersion = typeof SessionCredentialVersion.Type;

export const AssuranceAlternative = Schema.Struct({
  factors: Schema.Array(AuthenticationFactor),
  userVerified: Schema.Boolean,
  phishingResistant: Schema.Boolean,
  minimumCredentials: Schema.Int.check(Schema.isGreaterThan(0)),
});

export const AuthenticationRequirement = Schema.Struct({
  alternatives: Schema.NonEmptyArray(AssuranceAlternative),
  maximumAgeMillis: Schema.Int.check(Schema.isGreaterThan(0)),
});

export type AuthenticationRequirement = typeof AuthenticationRequirement.Type;

export const SessionMetadata = Schema.Struct({
  sessionId: SessionId,
  subjectId: SubjectId,
  securityRevision: SecurityRevision,
  assurance: AuthenticationAssurance,
  issuedAt: Schema.DateTimeUtcFromMillis,
  expiresAt: Schema.DateTimeUtcFromMillis,
  absoluteExpiresAt: Schema.DateTimeUtcFromMillis,
});

export type SessionMetadata = typeof SessionMetadata.Type;

export interface SessionInspection<Claims> {
  readonly session: SessionMetadata & { readonly claims: Claims };
  readonly provenance: SessionAuthenticationProvenance;
  readonly credentialVersion: SessionCredentialVersion;
}

export const PendingConsumption = Schema.Struct({
  flowId: AuthenticationFlowId,
  digest: TokenDigest,
  bindingDigest: TokenDigest,
  version: SecurityRevision,
});

export type PendingConsumption = typeof PendingConsumption.Type;

export const SessionSignOut = Schema.Struct({
  clearCredential: Schema.Literal(true),
  invalidation: Schema.Literals(["revoked", "already-invalid", "client-only"]),
});

export type SessionSignOut = typeof SessionSignOut.Type;

export const SessionCapabilities = Schema.Struct({
  mode: Schema.Literals(["stateful", "stateless", "state-assisted"]),
  listing: Schema.Boolean,
  perSessionRevocation: Schema.Boolean,
  subjectInvalidation: Schema.Literals(["immediate", "absolute-expiry"]),
  renewal: Schema.Literals(["single-winner", "replayable"]),
  /** Default authoritative checks never reuse positive authorization caches. */
  positiveCacheMillis: Schema.Literal(0),
});

export type SessionCapabilities = typeof SessionCapabilities.Type;
