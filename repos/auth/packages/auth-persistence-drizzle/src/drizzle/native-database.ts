import type {
  TransactionNativeDatabase,
  SessionSqlDatabase,
  PasswordSqlDatabase,
  EmailSqlDatabase,
  ProofSqlDatabase,
} from "@yielded/auth-persistence/Adapter";
import { Effect } from "effect";

/** Drizzle omits its captured $client from database class types, and only D1
 * exposes batch. Its generic query builders implement the SQL kernel contracts
 * through drizzleQueryOperations. The selected driver mode controls native calls. */
export const nativeDatabase = <Database, E, R>(acquire: Effect.Effect<Database, E, R>) =>
  Effect.map(
    acquire,
    (database) =>
      database as unknown as Database &
        TransactionNativeDatabase &
        SessionSqlDatabase &
        PasswordSqlDatabase &
        EmailSqlDatabase &
        ProofSqlDatabase,
  );
