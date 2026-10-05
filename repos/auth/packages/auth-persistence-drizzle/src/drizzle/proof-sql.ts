import { makeProofKernel } from "@yielded/auth-persistence/Adapter";

import { drizzleQueryOperations } from "./query-operations";
export type { ProofSqlQuery } from "@yielded/auth-persistence/Adapter";
export type { ProofSqlDatabase } from "@yielded/auth-persistence/Adapter";
export { CurrentProofSql } from "@yielded/auth-persistence/Adapter";
export type { ProofSqlConfiguration } from "@yielded/auth-persistence/Adapter";

export const { makeSqlProofPersistence, checkProofCompletionIn, completeProofPlanIn } =
  makeProofKernel(drizzleQueryOperations);
