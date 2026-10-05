import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { DrizzleTableModel } from "./table-model";

export {
  type SessionIdCodec,
  type RequiredSessionConstraints,
  type RequiredPendingAuthenticationConstraints,
  type RequiredStatefulPendingConstraints,
  type RequiredSignedValidityConstraints,
  requiredSessionConstraints,
  requiredPendingAuthenticationConstraints,
  requiredStatefulPendingConstraints,
  requiredSignedValidityConstraints,
  type SessionConstraintClassifier,
} from "@yielded/auth-persistence/Adapter";

export type SessionSubjectTables<Subject extends Table, NativeId> = Shared.SessionSubjectTables<
  DrizzleTableModel<Subject>,
  NativeId
>;

export type SessionAuthorityTables<
  Subject extends Table,
  Credential extends Table,
  NativeId,
> = Shared.SessionAuthorityTables<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  NativeId
>;

export type SessionFlowTables<Flow extends Table, NativeSubjectId> = Shared.SessionFlowTables<
  DrizzleTableModel<Flow>,
  NativeSubjectId
>;

export type StatefulSessionTables<
  Claims,
  Session extends Table,
  Flow extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.StatefulSessionTables<
  Claims,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Flow>,
  NativeSubjectId,
  NativeSessionId
>;

export type PendingAuthenticationTables<
  Claims,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
> = Shared.PendingAuthenticationTables<
  Claims,
  DrizzleTableModel<Pending>,
  DrizzleTableModel<Flow>,
  NativeSubjectId
>;

export type SignedSessionValidityTables<
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.SignedSessionValidityTables<
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId
>;

export type AuthenticationAuthorityMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
> = Shared.AuthenticationAuthorityMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Flow>,
  DrizzleTableModel<Pending>,
  NativeSubjectId
>;

export type StatefulSessionMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Session extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.StatefulSessionMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Flow>,
  DrizzleTableModel<Pending>,
  NativeSubjectId,
  NativeSessionId
>;

export type PendingAuthenticationMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
> = Shared.PendingAuthenticationMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Pending>,
  DrizzleTableModel<Flow>,
  NativeSubjectId
>;

export type SignedSessionValidityMapping<
  Subject extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.SignedSessionValidityMapping<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId
>;

/** D1 evaluates these expressions inside the atomic batch, after queueing delay.
 * `engineNow` must use the exact native representation of every mapped instant
 * column. `engineNowMillis` is Unix epoch milliseconds for proof freshness.
 * Changes to the consumer's factor policy MUST bump subject.securityRevision.
 * Supply the authoritative primary D1 database, never a replica-affined
 * `withSession` handle, because verification and security revision reads must
 * observe completed revocation writes across clients.
 */
export type D1SessionClockMapping = Shared.D1SessionClockMapping<SQL>;

export type D1AuthenticationAuthorityMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
> = Shared.D1AuthenticationAuthorityMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Flow>,
  DrizzleTableModel<Pending>,
  NativeSubjectId,
  SQL
>;

export type D1PendingAuthenticationMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Pending extends Table,
  Flow extends Table,
  NativeSubjectId,
> = Shared.D1PendingAuthenticationMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Pending>,
  DrizzleTableModel<Flow>,
  NativeSubjectId,
  SQL
>;

export type D1StatefulSessionMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Session extends Table,
  Flow extends Table,
  Pending extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.D1StatefulSessionMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Flow>,
  DrizzleTableModel<Pending>,
  NativeSubjectId,
  NativeSessionId,
  SQL
>;

export type D1SignedSessionValidityMapping<
  Subject extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.D1SignedSessionValidityMapping<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId,
  SQL
>;
