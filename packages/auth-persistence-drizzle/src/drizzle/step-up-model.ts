import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { DrizzleTableModel } from "./table-model";

export {
  type RequiredSessionStepUpConstraints,
  requiredSessionStepUpConstraints,
} from "@yielded/auth-persistence/Adapter";

/** Distinct from login-pending storage. Snapshot is TEXT encoded by the core's
 * SessionStepUpIntent schema; it contains no Claims and needs no consumer decoder. */
export type SessionStepUpIntentTables<
  Intent extends Table,
  NativeSubjectId,
> = Shared.SessionStepUpIntentTables<DrizzleTableModel<Intent>, NativeSubjectId>;

/** Fixed source discriminator is checked against every stored intent. A minimal
 * pure-signed installation does not provide dummy session or tombstone tables. */
export type SessionStepUpSourceTables<
  Claims,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.SessionStepUpSourceTables<
  Claims,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId
>;

export type SessionStepUpMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Intent extends Table,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.SessionStepUpMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Intent>,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId
>;

export type D1SessionStepUpMapping<
  Claims,
  Subject extends Table,
  Credential extends Table,
  Intent extends Table,
  Session extends Table,
  Tombstone extends Table,
  NativeSubjectId,
  NativeSessionId,
> = Shared.D1SessionStepUpMapping<
  Claims,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<Intent>,
  DrizzleTableModel<Session>,
  DrizzleTableModel<Tombstone>,
  NativeSubjectId,
  NativeSessionId,
  SQL
>;
