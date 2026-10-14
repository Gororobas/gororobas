import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { ClockMapping } from "./native-clock";
import type { DrizzleTableModel } from "./table-model";

export {
  type RequiredSessionStepUpConstraints,
  requiredSessionStepUpConstraints,
} from "@yielded/auth-persistence/Adapter";

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
> = ClockMapping<
  Shared.SessionStepUpMapping<
    Claims,
    DrizzleTableModel<Subject>,
    DrizzleTableModel<Credential>,
    DrizzleTableModel<Intent>,
    DrizzleTableModel<Session>,
    DrizzleTableModel<Tombstone>,
    NativeSubjectId,
    NativeSessionId,
    SQL
  >
>;
