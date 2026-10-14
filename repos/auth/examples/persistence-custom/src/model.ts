import {
  Passkey as AuthPasskey,
  Password as AuthPassword,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { Schema, Struct } from "effect";

import { Claims, Username } from "./contract";

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
  provenance: Sessions.SessionAuthenticationProvenance,
  credentialVersion: Sessions.SessionCredentialVersion,
});

export type Session = typeof Session.Type;

const Proof = Schema.Struct({
  record: Proofs.ProofRecord,
  failedAttempts: Schema.Natural,
});

const Passkey = Schema.Struct({
  credential: AuthPasskey.PasskeyCredential.mapFields(Struct.omit(["requirement"])),
  summary: AuthPasskey.PasskeyCredentialSummary,
});

/** Application records, not SQL roles. Every disk value is decoded before use. */
export const Database = Schema.Struct({
  version: Schema.Literal(3),
  sequence: Schema.Natural,
  customers: Schema.Array(Customer),
  passwords: Schema.Array(Password),
  sessions: Schema.Array(Session),
  proofs: Schema.Array(Proof),
  passkeys: Schema.Array(Passkey),
  ceremonies: Schema.Array(AuthPasskey.PasskeyCeremony),
});

export type State = { -readonly [K in keyof typeof Database.Type]: (typeof Database.Type)[K] };

export const emptyDatabase = (): State => ({
  version: 3,
  sequence: 0,
  customers: [],
  passwords: [],
  sessions: [],
  proofs: [],
  passkeys: [],
  ceremonies: [],
});

export const nextId = (state: State, prefix: string) => `${prefix}-${++state.sequence}`;
