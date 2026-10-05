import { makeTransactionKernel } from "@yielded/auth-persistence/Adapter";

import { drizzleQueryOperations } from "./query-operations";
export type { Row } from "@yielded/auth-persistence/Adapter";
export type { TransactionNativeDatabase } from "@yielded/auth-persistence/Adapter";
export type { Observation } from "@yielded/auth-persistence/Adapter";
export type { GuardedUpdate } from "@yielded/auth-persistence/Adapter";
export type { TransactionOwner } from "@yielded/auth-persistence/Adapter";

export const { reportTransactionFailure, both, makeTransactionRows, makeTransactionOwner } =
  makeTransactionKernel(drizzleQueryOperations);
