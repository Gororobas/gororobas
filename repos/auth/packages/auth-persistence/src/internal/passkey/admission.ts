/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import type { PasskeyCeremony, PasskeyMethodPolicy } from "@yielded/auth/Passkey";
import { Effect } from "effect";

import type { PasskeyChargeKind } from "../models/passkey-model";
import type { SqlExpression as SQL, QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export const makePasskeyAdmissionKernel = (
  operations: QueryOperations,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    | "col"
    | "equal"
    | "existsExact"
    | "invariant"
    | "key"
    | "mappedColumns"
    | "subjectScope"
    | "targetScope"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;
  const { col, equal, existsExact, key, mappedColumns, subjectScope, targetScope } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;
  const { both } = transactions;

  const chargeRetentionMillis = 86_400_000;

  const chargeScopes = (ceremony: PasskeyCeremony, subjectId?: string) => {
    const scopes: { kind: PasskeyChargeKind; scope: string }[] = [
      { kind: "global", scope: key("global", [ceremony.moduleId]) },
    ];

    if (subjectId !== undefined) scopes.push({ kind: "subject", scope: subjectScope(subjectId) });
    const target = targetScope(ceremony);

    if (target !== null) scopes.push({ kind: "target", scope: target });

    return scopes;
  };

  const lockAdmission = Effect.fn("passkey.lockAdmission")(function* (mapping: any) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.admission;

    const identity = {
      [table.authorityScope]: mapping.authorityScope,
      [table.moduleId]: mapping.moduleId,
    };

    // The previous marker/time is telemetry, not an authentication CAS. Actual
    // engine predicates serialize admission, including separately planned D1 batches.
    const found = yield* owner.read(table.table, equal(table.table, identity), {
      limit: 1,
      observe: false,
      columns: [table.authorityScope, table.moduleId],
    });

    invariant(found.rows.length === 1);
    invariant(
      found.rows[0]![table.authorityScope] === mapping.authorityScope &&
        found.rows[0]![table.moduleId] === mapping.moduleId,
    );

    const marked = {
      ...identity,
      [table.version]: owner.marker,
      [table.ownerMarker]: owner.marker,
    };

    yield* owner.updateGuarded(
      table.table,
      owner.exact(table.table, identity),
      {
        [table.version]: owner.marker,
        [table.ownerMarker]: owner.marker,
        [table.admittedAt]: null,
      },
      { rows: 1, postcondition: yield* existsExact(table.table, marked) },
    );
  });

  const pendingCount = (mapping: any, scope?: string) => {
    const table = mapping.flow;

    return sql`(select count(*) from ${table.table} where ${both(
      equal(table.table, { [table.moduleId]: mapping.moduleId }),
      sql`${col(table.table, table.state)} in (${table.states.Pending}, ${table.states.Claimed})`,
      scope === undefined ? undefined : equal(table.table, { [table.subjectScope]: scope }),
    )})`;
  };

  const chargedCount = (mapping: any, kind: PasskeyChargeKind, scope: string, window: number) => {
    const table = mapping.charge;
    const clock = mapping.clock;

    return sql`(select count(*) from ${table.table} where ${both(
      equal(table.table, { [table.moduleId]: mapping.moduleId, [table.kind]: kind }),
      kind === "global" ? undefined : equal(table.table, { [table.scope]: scope }),
      sql`${col(table.table, table.admittedAt)} is not null`,
      sql`${clock.toMillis(sql`${col(table.table, table.admittedAt)}`)} > ${clock.engineNowMillis} - ${window}`,
    )})`;
  };

  const admissionCondition = (
    mapping: any,
    policies: ReadonlyArray<PasskeyMethodPolicy>,
    ceremony: PasskeyCeremony,
    subjectId: string | undefined,
    added: ReadonlyArray<PasskeyChargeKind>,
    newFlow: boolean,
    resolvedSubject: boolean,
  ) =>
    both(
      ...policies.flatMap((policy) => [
        sql`${pendingCount(mapping)} + ${newFlow ? 1 : 0} <= ${policy.maximumPending}`,
        subjectId === undefined
          ? undefined
          : sql`${pendingCount(mapping, subjectScope(subjectId))} + ${newFlow || resolvedSubject ? 1 : 0} <= ${policy.maximumPendingPerSubject}`,
        ...chargeScopes(ceremony, subjectId).map(
          ({ kind, scope }) =>
            sql`${chargedCount(mapping, kind, scope, policy.admission[kind].windowMillis)} + ${added.includes(kind) ? 1 : 0} <= ${policy.admission[kind].limit}`,
        ),
      ]),
    );

  const guardAdmission = (
    mapping: any,
    policies: ReadonlyArray<PasskeyMethodPolicy>,
    ceremony: PasskeyCeremony,
    subjectId?: string,
  ) =>
    Effect.map(CurrentPasskeyTransaction, (owner) => {
      owner.postconditions.push(
        admissionCondition(mapping, policies, ceremony, subjectId, [], false, false),
      );
    });

  const readCharges = Effect.fn("passkey.readCharges")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
    policy: PasskeyMethodPolicy,
    subjectId?: string,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.charge;

    const where = equal(table.table, {
      [table.moduleId]: ceremony.moduleId,
      [table.flowId]: ceremony.flowId,
    });

    const found = yield* owner.read(table.table, where, {
      limit: 3,
      observe: false,
      columns: mappedColumns(table),
    });

    const scopes = chargeScopes(ceremony, subjectId);

    invariant(found.rows.length === scopes.length);
    for (const { kind, scope } of scopes) {
      const rows = found.rows.filter((row) => row[table.kind] === kind);

      invariant(rows.length === 1);
      const row = rows[0]!;
      const admitted = mapping.clock.decodeInstant(row[table.admittedAt]);
      const retained = mapping.clock.decodeInstant(row[table.retainUntil]);

      invariant(
        Number.isSafeInteger(admitted) &&
          admitted >= 0 &&
          retained === admitted + chargeRetentionMillis,
      );
      invariant(
        row[table.moduleId] === ceremony.moduleId &&
          row[table.flowId] === ceremony.flowId &&
          row[table.purpose] === ceremony.purpose,
      );
      invariant(
        row[table.scope] === scope &&
          row[table.originalWindowMillis] === policy.admission[kind].windowMillis,
      );
      owner.observations.push({
        table: table.table,
        where: equal(table.table, {
          [table.moduleId]: ceremony.moduleId,
          [table.flowId]: ceremony.flowId,
          [table.kind]: kind,
        }),
        rows: [row],
      });
    }
  });

  const guardChargeSet = (mapping: any, ceremony: PasskeyCeremony, subjectId?: string) =>
    Effect.flatMap(CurrentPasskeyTransaction, (owner) =>
      Effect.gen(function* () {
        const table = mapping.charge;
        const scopes = chargeScopes(ceremony, subjectId);

        const where = equal(table.table, {
          [table.moduleId]: ceremony.moduleId,
          [table.flowId]: ceremony.flowId,
        });

        owner.postconditions.push(
          sql`(select count(*) from ${table.table} where ${where}) = ${scopes.length}`,
        );
        for (const { kind, scope } of scopes)
          owner.postconditions.push(
            yield* existsExact(table.table, {
              [table.moduleId]: ceremony.moduleId,
              [table.flowId]: ceremony.flowId,
              [table.purpose]: ceremony.purpose,
              [table.kind]: kind,
              [table.scope]: scope,
            }),
          );
      }),
    );

  const insertCharges = Effect.fn("passkey.insertCharges")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
    policy: PasskeyMethodPolicy,
    kinds: ReadonlyArray<PasskeyChargeKind>,
    subjectId?: string,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    if (kinds.length === 0) return;
    const table = mapping.charge;
    const anchor = mapping.admission;
    const clock = mapping.clock;
    const earliest = yield* owner.now(clock);
    const identities: Record<string, unknown>[] = [];

    for (const { kind, scope } of chargeScopes(ceremony, subjectId).filter((item) =>
      kinds.includes(item.kind),
    )) {
      const identity = {
        [table.moduleId]: ceremony.moduleId,
        [table.flowId]: ceremony.flowId,
        [table.kind]: kind,
      };

      const values = {
        ...table.encodeInsert({
          moduleId: ceremony.moduleId,
          flowId: ceremony.flowId,
          purpose: ceremony.purpose,
          kind,
          scope,
          originalWindowMillis: policy.admission[kind].windowMillis,
          marker: owner.marker,
        }),
        ...identity,
        [table.purpose]: ceremony.purpose,
        [table.scope]: scope,
        [table.originalWindowMillis]: policy.admission[kind].windowMillis,
        [table.admittedAt]: null,
        [table.retainUntil]: null,
        [table.version]: owner.marker,
        [table.ownerMarker]: owner.marker,
      };

      const observation = yield* owner.insert(table.table, values, identity);

      observation.rows = observation.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([name]) => name !== table.admittedAt && name !== table.retainUntil,
          ),
        ),
      );
      identities.push(identity);
    }
    invariant(identities.length === kinds.length);

    const anchorIdentity = {
      [anchor.authorityScope]: mapping.authorityScope,
      [anchor.moduleId]: mapping.moduleId,
      [anchor.version]: owner.marker,
      [anchor.ownerMarker]: owner.marker,
    };

    const stamp = sql`(select ${col(anchor.table, anchor.admittedAt)} from ${anchor.table} where ${owner.exact(anchor.table, anchorIdentity)})`;
    const stampMillis = clock.toMillis(stamp);

    const validStamp: SQL = both(
      yield* existsExact(anchor.table, anchorIdentity),
      sql`${stamp} is not null`,
      sql`${stampMillis} >= ${earliest}`,
      sql`${stampMillis} <= ${clock.engineNowMillis}`,
      sql`${stampMillis} <= ${8640000000000000 - chargeRetentionMillis}`,
    );

    yield* owner.finalUpdate(
      anchor.table,
      owner.exact(anchor.table, { ...anchorIdentity, [anchor.admittedAt]: null }),
      {
        [anchor.admittedAt]: clock.fromMillis(clock.engineNowMillis),
      },
      { rows: 1, postcondition: validStamp },
    );
    for (const identity of identities) {
      const expected = {
        ...identity,
        [table.version]: owner.marker,
        [table.ownerMarker]: owner.marker,
      };

      const postcondition = yield* existsExact(
        table.table,
        expected,
        both(
          sql`${clock.toMillis(sql`${col(table.table, table.admittedAt)}`)} = ${stampMillis}`,
          sql`${clock.toMillis(sql`${col(table.table, table.retainUntil)}`)} = ${stampMillis} + ${chargeRetentionMillis}`,
        ),
      );

      yield* owner.finalUpdate(
        table.table,
        owner.exact(table.table, {
          ...expected,
          [table.admittedAt]: null,
          [table.retainUntil]: null,
        }),
        {
          [table.admittedAt]: stamp,
          [table.retainUntil]: clock.fromMillis(sql`${stampMillis} + ${chargeRetentionMillis}`),
        },
        { rows: 1, postcondition },
      );
    }
    owner.postconditions.push(
      sql`(select count(*) from ${table.table} where ${owner.exact(table.table, {
        [table.moduleId]: ceremony.moduleId,
        [table.flowId]: ceremony.flowId,
        [table.ownerMarker]: owner.marker,
      })}) = ${identities.length}`,
    );
  });

  return {
    chargeRetentionMillis,
    chargeScopes,
    lockAdmission,
    admissionCondition,
    guardAdmission,
    readCharges,
    guardChargeSet,
    insertCharges,
  };
};
