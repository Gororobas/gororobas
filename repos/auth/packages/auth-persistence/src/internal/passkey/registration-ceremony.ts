/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import {
  PasskeyClaim,
  type PasskeyAccess,
  type PasskeyCeremony,
  type PasskeyMethodPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import { Effect } from "effect";

import type { QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import type { makePasskeyAdmissionKernel } from "./admission";
import type { makePasskeyCredentialsKernel } from "./credentials";
import type { makePasskeyFlowKernel } from "./flow";
import type { makePasskeyRegistrationCustodyKernel } from "./registration-custody";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export const makePasskeyRegistrationCeremonyKernel = (
  operations: QueryOperations,
  admission: Pick<
    ReturnType<typeof makePasskeyAdmissionKernel>,
    "admissionCondition" | "guardAdmission" | "guardChargeSet" | "lockAdmission" | "readCharges"
  >,
  credentials: Pick<
    ReturnType<typeof makePasskeyCredentialsKernel>,
    "readModule" | "readPolicyGuards"
  >,
  flow: Pick<
    ReturnType<typeof makePasskeyFlowKernel>,
    "compatiblePolicy" | "liveCondition" | "matchesAccess" | "readFlow" | "terminalFlow"
  >,
  registrationCustody: Pick<
    ReturnType<typeof makePasskeyRegistrationCustodyKernel>,
    "releaseRegistrationCustody"
  >,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    "ceremonyStorage" | "equal" | "handleKey" | "invariant" | "mappedColumns" | "policyStorage"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;

  const { admissionCondition, guardAdmission, guardChargeSet, lockAdmission, readCharges } =
    admission;

  const { readModule, readPolicyGuards } = credentials;
  const { compatiblePolicy, liveCondition, matchesAccess, readFlow, terminalFlow } = flow;
  const { releaseRegistrationCustody } = registrationCustody;
  const { ceremonyStorage, equal, handleKey, mappedColumns, policyStorage } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;
  const { both } = transactions;

  /** The issuing registration authority owns the application value and reservation.
   * This facet only compares its opaque custody and cannot issue or provision. */
  const custody = Effect.fn("passkey.registrationCustody")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
    pending: boolean,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    invariant(ceremony.context._tag === "Registration");

    const context = ceremony.context,
      intent = mapping.intent,
      handle = mapping.handle;

    const identity = { [intent.moduleId]: mapping.moduleId, [intent.flowId]: ceremony.flowId };

    const advisory = (yield* owner.read(intent.table, equal(intent.table, identity), {
      limit: 1,
      lock: false,
      observe: false,
    })).rows[0];

    if (advisory === undefined) return false;
    const hashedHandle = handleKey(ceremony.profile.rpId, context.userHandle);

    const held = (yield* owner.read(
      handle.table,
      equal(handle.table, { [handle.handleKey]: hashedHandle }),
      { limit: 1, columns: mappedColumns(handle) },
    )).rows[0];

    if (
      held === undefined ||
      !handle.isReservedState(held[handle.state]) ||
      held[handle.handleKey] !== hashedHandle ||
      held[handle.rpId] !== ceremony.profile.rpId ||
      held[handle.userHandle] !== context.userHandle ||
      held[handle.reservationId] !== advisory[intent.reservationId]
    )
      return false;
    const heldCondition = sql`exists (select 1 from ${handle.table} where ${both(owner.exact(handle.table, held), handle.reservedCondition)})`;

    if (!(yield* owner.check(heldCondition))) return false;

    const row = (yield* owner.read(intent.table, equal(intent.table, identity), {
      limit: 1,
      columns: mappedColumns(intent),
    })).rows[0];

    if (
      row === undefined ||
      row[intent.commandId] !== ceremony.commandId ||
      row[intent.fingerprint] !== context.fingerprint ||
      row[intent.handleKey] !== hashedHandle ||
      row[intent.reservationId] !== held[handle.reservationId] ||
      row[intent.ceremonySnapshot] !== ceremonyStorage.encode(ceremony) ||
      typeof row[intent.applicationSnapshot] !== "string" ||
      new TextEncoder().encode(row[intent.applicationSnapshot]).length > 1048576 ||
      (pending && !intent.isPendingState(row[intent.state]))
    )
      return false;
    const condition = pending ? intent.pendingCondition : intent.custodyCondition;

    if (
      !(yield* owner.check(
        sql`exists (select 1 from ${intent.table} where ${both(owner.exact(intent.table, row), condition)})`,
      ))
    )
      return false;

    return [
      heldCondition,
      sql`exists (select 1 from ${intent.table} where ${both(owner.exact(intent.table, row), condition)})`,
    ];
  });

  const contextRegistration = Effect.fn("passkey.contextRegistration")(function* (
    mapping: any,
    access: PasskeyAccess,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    if (access.moduleId !== mapping.moduleId) return undefined;
    const current = yield* readModule(mapping);

    if (current === undefined) return undefined;
    yield* readPolicyGuards(mapping);
    const table = mapping.flow;

    const advisory = (yield* owner.read(
      table.table,
      equal(table.table, { [table.moduleId]: mapping.moduleId, [table.flowId]: access.flowId }),
      { limit: 1, lock: false, observe: false },
    )).rows[0];

    if (advisory === undefined) return undefined;
    const ceremony = ceremonyStorage.decode(advisory[table.snapshot]);

    if (ceremony.purpose !== "registration" || !matchesAccess(ceremony, access)) return undefined;
    const held = yield* custody(mapping, ceremony, true);

    if (!held) return undefined;
    const read = yield* readFlow(mapping, access.flowId);

    if (
      read === undefined ||
      read.state !== "Pending" ||
      ceremonyStorage.encode(read.ceremony) !== ceremonyStorage.encode(ceremony) ||
      !compatiblePolicy(read.ceremony, read.policy, current) ||
      !(yield* owner.check(liveCondition(mapping, ceremony)))
    )
      return undefined;
    owner.postconditions.push(...held, liveCondition(mapping, ceremony));

    return read.ceremony;
  });

  const claimRegistration = Effect.fn("passkey.claimRegistration")(function* (
    mapping: any,
    input: {
      readonly access: PasskeyAccess;
      readonly policy: PasskeyMethodPolicy;
      readonly ceremony: PasskeyCeremony;
      readonly claimId: string;
    },
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const current = yield* readModule(mapping);

    if (current === undefined || input.access.moduleId !== mapping.moduleId)
      return { _tag: "Rejected" } as const;
    yield* lockAdmission(mapping);
    yield* readPolicyGuards(mapping);
    const held = yield* custody(mapping, input.ceremony, true);
    const read = yield* readFlow(mapping, input.access.flowId);

    if (
      read === undefined ||
      read.state !== "Pending" ||
      !matchesAccess(read.ceremony, input.access)
    )
      return { _tag: "Rejected" } as const;
    invariant(ceremonyStorage.encode(read.ceremony) === ceremonyStorage.encode(input.ceremony));
    if (
      !held ||
      !compatiblePolicy(read.ceremony, read.policy, current) ||
      policyStorage.encode(current) !== policyStorage.encode(input.policy) ||
      !(yield* owner.check(liveCondition(mapping, read.ceremony))) ||
      !(yield* owner.check(
        admissionCondition(
          mapping,
          [read.policy, current],
          read.ceremony,
          undefined,
          [],
          false,
          false,
        ),
      ))
    ) {
      if (held) yield* releaseRegistrationCustody(mapping, read.ceremony);
      yield* terminalFlow(mapping, read, "Rejected");

      return { _tag: "Rejected" } as const;
    }
    yield* readCharges(mapping, read.ceremony, read.policy, undefined);
    const claimedAtMillis = yield* owner.now(mapping.clock);

    const claim = snapshotPasskeySync(PasskeyClaim, {
      ceremony: read.ceremony,
      claimId: input.claimId,
      claimedAtMillis,
      claimExpiresAtMillis: Math.min(
        claimedAtMillis + read.ceremony.claimLifetimeMillis,
        read.ceremony.expiresAtMillis,
      ),
    });

    const table = mapping.flow;

    yield* owner.update(
      table.table,
      { [table.moduleId]: mapping.moduleId, [table.flowId]: read.ceremony.flowId },
      {
        [table.state]: table.states.Claimed,
        [table.version]: owner.marker,
        [table.claimId]: claim.claimId,
        [table.claimedAt]: mapping.clock.encodeInstant(claim.claimedAtMillis),
        [table.claimExpiresAt]: mapping.clock.encodeInstant(claim.claimExpiresAtMillis),
      },
    );
    yield* guardChargeSet(mapping, read.ceremony, undefined);
    yield* guardAdmission(mapping, [read.policy, current], read.ceremony, undefined);
    owner.postconditions.push(...held, liveCondition(mapping, read.ceremony, claim));

    return { _tag: "Claimed", claim } as const;
  });

  const settleRegistration = Effect.fn("passkey.settleRegistration")(function* (
    mapping: any,
    claim: PasskeyClaim,
    outcome: "Rejected" | "Ambiguous",
  ) {
    yield* readModule(mapping);
    yield* lockAdmission(mapping);
    yield* readPolicyGuards(mapping);
    const read = yield* readFlow(mapping, claim.ceremony.flowId);

    if (
      read === undefined ||
      read.state !== "Claimed" ||
      read.claim === undefined ||
      read.claim.claimId !== claim.claimId ||
      read.claim.claimedAtMillis !== claim.claimedAtMillis ||
      read.claim.claimExpiresAtMillis !== claim.claimExpiresAtMillis ||
      ceremonyStorage.encode(read.ceremony) !== ceremonyStorage.encode(claim.ceremony)
    )
      return "Rejected" as const;

    if (outcome === "Rejected") yield* releaseRegistrationCustody(mapping, claim.ceremony);

    return yield* terminalFlow(mapping, read, outcome);
  });

  return { contextRegistration, claimRegistration, settleRegistration };
};
