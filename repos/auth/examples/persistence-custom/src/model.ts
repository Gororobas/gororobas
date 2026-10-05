import {
  Identity,
  Passkey as AuthPasskey,
  Password as AuthPassword,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { Schema } from "effect";

import { Claims, Registration, Username } from "./contract";

export const Customer = Schema.Struct({
  id: AuthSchema.SubjectId,
  active: Schema.Boolean,
  securityRevision: Sessions.SecurityRevision,
  displayName: Schema.String,
  username: Username,
  email: AuthSchema.Email,
  identifierRevision: Sessions.SecurityRevision,
  verifiedAtMillis: Schema.optionalKey(Schema.Int),
  emailCredential: Schema.optionalKey(
    Schema.Struct({ id: Schema.NonEmptyString, revision: Sessions.SecurityRevision }),
  ),
});

export type Customer = typeof Customer.Type;

const Password = Schema.Struct({
  subjectId: AuthSchema.SubjectId,
  credentialId: Schema.NonEmptyString,
  revision: Sessions.SecurityRevision,
  verifierVersion: Sessions.SecurityRevision,
  replacement: AuthPassword.PasswordReplacement,
});

export const Session = Schema.Struct({
  ...Sessions.SessionMetadata.fields,
  claims: Claims,
  digest: AuthSchema.TokenDigest,
  version: Sessions.SecurityRevision,
  provenance: Sessions.SessionAuthenticationProvenance,
  credentialVersion: Sessions.SessionCredentialVersion,
});

export type Session = typeof Session.Type;

const Attempt = Schema.Struct({
  id: AuthPassword.PasswordAttemptId,
  moduleId: Schema.NonEmptyString,
  action: Schema.Literals(["sign-in", "change"]),
  captured: Schema.optionalKey(AuthPassword.PasswordCredentialSnapshot),
  pending: Schema.Boolean,
  deadline: Schema.Int,
  retentionUntil: Schema.Int,
});

export const ProofRecord = Schema.Struct({
  moduleId: Schema.NonEmptyString,
  purpose: Proofs.ProofPurpose,
  proofId: Proofs.ProofId,
  requestId: Proofs.ProofRequestId,
  fingerprint: AuthSchema.TokenDigest,
  deliveryId: Proofs.ProofDeliveryId,
  binding: Proofs.ProofBinding,
  verifier: Schema.Struct({ keyId: Schema.NonEmptyString, digest: AuthSchema.TokenDigest }),
  issuedAtMillis: Schema.Int,
  expiresAtMillis: Schema.Int,
  version: Proofs.ProofVersion,
});

const Proof = Schema.Struct({
  record: ProofRecord,
  policy: Proofs.ProofPolicy,
  series: Schema.String,
  state: Schema.Literals(["active", "consumed", "superseded", "cancelled"]),
  retentionUntil: Schema.Int,
  sendCount: Schema.Natural,
  deliveryState: Schema.Literals(["new", "claimed", "accepted", "failed", "ambiguous"]),
  claimVersion: Schema.optionalKey(Proofs.ProofVersion),
  claimDeadline: Schema.optionalKey(Schema.Int),
  retryAt: Schema.optionalKey(Schema.Int),
});

const Continuation = Schema.Struct({
  moduleId: Schema.NonEmptyString,
  purpose: Proofs.ProofPurpose,
  id: Proofs.ProofContinuationId,
  digest: AuthSchema.TokenDigest,
  proofId: Proofs.ProofId,
  binding: Proofs.ProofBinding,
  expiresAt: Schema.Int,
  consumed: Schema.Boolean,
  retentionUntil: Schema.Int,
});

const Passkey = Schema.Struct({
  credential: AuthPasskey.PasskeyCredential,
  summary: AuthPasskey.PasskeyCredentialSummary,
});

const Ceremony = Schema.Struct({
  ceremony: AuthPasskey.PasskeyCeremony,
  policy: AuthPasskey.PasskeyMethodPolicy,
  state: Schema.Literals(["pending", "claimed", "verified", "rejected", "ambiguous"]),
  claim: Schema.optionalKey(AuthPasskey.PasskeyClaim),
  credential: Schema.optionalKey(AuthPasskey.PasskeyCredential),
});

/** Application records, not SQL roles. Every disk value is decoded before use. */
export const Database = Schema.Struct({
  version: Schema.Literal(1),
  sequence: Schema.Natural,
  customers: Schema.Array(Customer),
  passwords: Schema.Array(Password),
  sessions: Schema.Array(Session),
  flows: Schema.Array(Schema.Struct({ id: Schema.String, expiresAt: Schema.Int })),
  attempts: Schema.Array(Attempt),
  registrations: Schema.Array(
    Schema.Struct({
      requestId: Schema.String,
      identifier: Identity.LoginIdentifier,
      registration: Registration,
      replacement: AuthPassword.PasswordReplacement,
    }),
  ),
  charges: Schema.Array(
    Schema.Struct({ bucket: Schema.String, at: Schema.Int, retentionUntil: Schema.Int }),
  ),
  proofRequests: Schema.Array(
    Schema.Struct({
      moduleId: Schema.String,
      fingerprint: AuthSchema.TokenDigest,
      receipt: Proofs.ProofRequestReceipt,
      retentionUntil: Schema.Int,
    }),
  ),
  proofs: Schema.Array(Proof),
  continuations: Schema.Array(Continuation),
  passkeys: Schema.Array(Passkey),
  handles: Schema.Array(
    Schema.Struct({
      rpId: Schema.String,
      subjectId: AuthSchema.SubjectId,
      handle: AuthPasskey.PasskeyUserHandle,
    }),
  ),
  ceremonies: Schema.Array(Ceremony),
  renames: Schema.Array(
    Schema.Struct({
      moduleId: Schema.String,
      commandId: Schema.String,
      subjectId: AuthSchema.SubjectId,
      name: Schema.String,
      result: AuthPasskey.PasskeyCredentialSummary,
      retentionUntil: Schema.Int,
    }),
  ),
  removals: Schema.Array(
    Schema.Struct({
      moduleId: Schema.String,
      commandId: Schema.String,
      subjectId: AuthSchema.SubjectId,
      result: AuthPasskey.PasskeyRemoved,
      retentionUntil: Schema.Int,
    }),
  ),
  mutations: Schema.Array(
    Schema.Struct({
      moduleId: Schema.String,
      commandId: Schema.String,
      subjectId: AuthSchema.SubjectId,
      kind: Schema.Literals(["email", "password"]),
      retentionUntil: Schema.Int,
    }),
  ),
});

export type State = { -readonly [K in keyof typeof Database.Type]: (typeof Database.Type)[K] };

export const emptyDatabase = (): State => ({
  version: 1,
  sequence: 0,
  customers: [],
  passwords: [],
  sessions: [],
  flows: [],
  attempts: [],
  registrations: [],
  charges: [],
  proofRequests: [],
  proofs: [],
  continuations: [],
  passkeys: [],
  handles: [],
  ceremonies: [],
  renames: [],
  removals: [],
  mutations: [],
});

export const nextId = (state: State, prefix: string) => `${prefix}-${++state.sequence}`;

export interface Budget {
  readonly bucket: string;
  readonly limit: number;
  readonly windowMillis: number;
}

/** Charge each open bucket by default. Issuance requires every budget to admit
 * before charging any of them; attempts still charge open buckets on rejection.
 */
export const charge = (
  state: State,
  budgets: ReadonlyArray<Budget>,
  now: number,
  options: { readonly requireAll?: boolean } = {},
) => {
  const open = budgets.filter(
    (budget) =>
      state.charges.filter(
        (event) => event.bucket === budget.bucket && event.at >= now - budget.windowMillis,
      ).length < budget.limit,
  );

  if (options.requireAll && open.length !== budgets.length) return false;

  state.charges = [
    ...state.charges,
    ...open.map((budget) => ({
      bucket: budget.bucket,
      at: now,
      retentionUntil: now + budget.windowMillis,
    })),
  ];

  return open.length === budgets.length;
};
