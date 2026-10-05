import { makeSessionKernel } from "@yielded/auth-persistence/Adapter";

import { drizzleQueryOperations } from "./query-operations";
export type { SessionSqlDatabase } from "@yielded/auth-persistence/Adapter";
export { CurrentSessionSql } from "@yielded/auth-persistence/Adapter";
export type { SessionSqlOptions } from "@yielded/auth-persistence/Adapter";

export const {
  makeSqlAuthenticationAuthority,
  makeSqlPendingAuthentication,
  makeSqlStatefulSessions,
  makeSqlSignedValidity,
  makeSqlSessionStepUp,
} = makeSessionKernel(drizzleQueryOperations);
