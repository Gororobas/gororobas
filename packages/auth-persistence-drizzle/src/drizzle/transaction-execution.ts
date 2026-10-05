import { makeTransactionExecutionKernel } from "@yielded/auth-persistence/Adapter";

import { makeTransactionOwner, reportTransactionFailure } from "./transaction-owner";
export type { TransactionTargetConfiguration } from "@yielded/auth-persistence/Adapter";
export type { TransactionCoordinatorError } from "@yielded/auth-persistence/Adapter";
export type { TransactionBound } from "@yielded/auth-persistence/Adapter";
export type { TransactionExecution } from "@yielded/auth-persistence/Adapter";

export const {
  sqlClientTransactionStandaloneGuard,
  makeTransactionExecution,
  coordinateTransactionOwner,
} = makeTransactionExecutionKernel({ makeTransactionOwner, reportTransactionFailure });
