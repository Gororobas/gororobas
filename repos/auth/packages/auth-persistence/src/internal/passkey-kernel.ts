import { makePasskeyAdmissionKernel } from "./passkey/admission";
import { makePasskeyCredentialsKernel } from "./passkey/credentials";
import { makePasskeyEnrollmentKernel } from "./passkey/enrollment";
import { makePasskeyFlowKernel } from "./passkey/flow";
import { makePasskeyManagementKernel } from "./passkey/management";
import { makePasskeyRegistrationCeremonyKernel } from "./passkey/registration-ceremony";
import { makePasskeyRegistrationCustodyKernel } from "./passkey/registration-custody";
import { makePasskeyRegistrationWriteKernel } from "./passkey/registration-write";
import { makePasskeyStateKernel } from "./passkey/state";
import { makePasskeyTargetKernel } from "./passkey/target";
import { makePasskeyWriteStateKernel } from "./passkey/write-state";
import { makePasskeyWriteTargetKernel } from "./passkey/write-target";
import type { QueryOperations } from "./query-operations";
import { makeTransactionExecutionKernel } from "./transaction-execution-kernel";
import { makeTransactionKernel } from "./transaction-kernel";

export type PasskeyKernel = ReturnType<typeof makePasskeyKernel>;

/** One set of passkey state machines, supplied with a SQL compiler and transaction owner. */
export const makePasskeyKernel = (operations: QueryOperations) => {
  const transactions = makeTransactionKernel(operations);
  const execution = makeTransactionExecutionKernel(transactions);
  const state = makePasskeyStateKernel(operations, transactions);
  const credentials = makePasskeyCredentialsKernel(operations, state, transactions);
  const admission = makePasskeyAdmissionKernel(operations, state, transactions);
  const registrationCustody = makePasskeyRegistrationCustodyKernel(state);

  const flow = makePasskeyFlowKernel(
    operations,
    admission,
    credentials,
    registrationCustody,
    state,
    transactions,
  );

  const registrationCeremony = makePasskeyRegistrationCeremonyKernel(
    operations,
    admission,
    credentials,
    flow,
    registrationCustody,
    state,
    transactions,
  );

  const target = makePasskeyTargetKernel(
    credentials,
    flow,
    registrationCeremony,
    state,
    execution,
    operations,
  );

  const writeState = makePasskeyWriteStateKernel(operations, state, transactions);

  const enrollment = makePasskeyEnrollmentKernel(
    operations,
    admission,
    credentials,
    flow,
    state,
    writeState,
    transactions,
  );

  const management = makePasskeyManagementKernel(
    operations,
    admission,
    credentials,
    state,
    writeState,
    transactions,
  );

  const registrationWrite = makePasskeyRegistrationWriteKernel(
    operations,
    admission,
    credentials,
    flow,
    registrationCustody,
    state,
    writeState,
    transactions,
  );

  const writeTarget = makePasskeyWriteTargetKernel(
    operations,
    enrollment,
    management,
    registrationWrite,
    state,
    target,
    execution,
  );

  return {
    state,
    credentials,
    admission,
    registrationCustody,
    flow,
    registrationCeremony,
    target,
    writeState,
    enrollment,
    management,
    registrationWrite,
    writeTarget,
  };
};
