import { makePhoneKernel } from "@yielded/auth-persistence/Adapter";

import { drizzleQueryOperations } from "./query-operations";
import { both, makeTransactionRows } from "./transaction-owner";
export { CurrentPhoneTransaction } from "@yielded/auth-persistence/Adapter";

const kernel = makePhoneKernel(drizzleQueryOperations, { both, makeTransactionRows });

export const {
  unavailable,
  equal,
  copiedRow,
  col,
  capturePhone,
  lookupPhone,
  admitPhone,
  preparePhoneMutation,
  cleanupPhoneAdmission,
} = kernel;

export const invariant: (value: unknown) => asserts value = kernel.invariant;
