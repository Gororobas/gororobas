import { makePasswordKernel } from "@yielded/auth-persistence/Adapter";

import { completeProofPlanIn } from "./proof-sql";
import { drizzleQueryOperations } from "./query-operations";
export type { PasswordSqlQuery } from "@yielded/auth-persistence/Adapter";
export type { PasswordSqlDatabase } from "@yielded/auth-persistence/Adapter";
export { CurrentPasswordSql } from "@yielded/auth-persistence/Adapter";
export type { PasswordSqlConfiguration } from "@yielded/auth-persistence/Adapter";

export const { makeSqlPasswordPersistence, passwordSqlKernel } = makePasswordKernel(
  drizzleQueryOperations,
  { completeProofPlanIn },
);
