import type * as M from "@yielded/auth/OAuth";
import {
  OAuthConnectedRevocationClaim,
  type OAuthConnectedRevocations,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { asc, eq, lte, sql } from "drizzle-orm";
import { Effect } from "effect";

import { collect, discover } from "./oauth-connected-collection";
import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import * as S from "./oauth-connected-state";
import { both, col, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { invariant, storage } from "./oauth-state";

type WorkerInput<K extends keyof OAuthConnectedRevocations["Service"]> = Parameters<
  OAuthConnectedRevocations["Service"][K]
>[0];
const revocationClaimStorage = storage(OAuthConnectedRevocationClaim);

const jobLocks = Effect.fn("oauthConnected.jobLocks")(function* (
  mapping: S.Revocations,
  job: M.OAuthConnectedRevocationJob,
) {
  const owner = yield* CurrentOAuthTransaction;

  const token = job.context.token,
    client = yield* S.client(mapping, token.configuration, false);

  if (client === undefined) return undefined;

  const tuple = yield* F.inspectTuple(mapping, token.identity),
    t = mapping.ownership.tuple;

  const native = yield* mapping.subjectId.toNative(token.subjectId);

  if (tuple.row?.[t.state] !== "Owned" || !mapping.subjectId.equals(tuple.row[t.subjectId], native))
    return undefined;
  const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

  invariant(cohort.row !== undefined);

  const j = mapping.job,
    read = yield* owner.read(j.table, equal(j.table, { [j.jobId]: job.context.jobId }), {
      limit: 1,
    }),
    row = read.rows[0];

  if (row === undefined) return undefined;
  invariant(row[j.state] === "Confirmed" || cohort.blocked);
  invariant(
    row[j.snapshot] === S.jobStorage.encode(job) &&
      row[j.moduleId] === token.moduleId &&
      mapping.subjectId.equals(native, row[j.subjectId]) &&
      row[j.identityKey] === tuple.key &&
      row[j.clientKey] === client.id &&
      row[j.cohortKey] === cohort.id &&
      row[j.grantId] === token.grantId &&
      ["Pending", "Claimed", "Unknown", "Confirmed"].includes(row[j.state]),
  );

  return { client, cohort, row };
});

export const claimRevocation = Effect.fn("oauthConnected.claimRevocation")(function* (
  mapping: S.Revocations,
  input: WorkerInput<"claim">,
) {
  const owner = yield* CurrentOAuthTransaction;

  invariant(
    Number.isSafeInteger(input.lifetimeMillis) &&
      input.lifetimeMillis >= 1000 &&
      input.lifetimeMillis <= 120000,
  );
  const j = mapping.job;

  const candidate = yield* owner.read(
    j.table,
    equal(j.table, { [j.moduleId]: input.moduleId, [j.state]: "Pending" }),
    { limit: 1, takeOnly: true, lock: false, observe: false, orderBy: asc(col(j.table, j.jobId)) },
  );

  const row = candidate.rows[0];

  if (row === undefined) return { _tag: "Empty" } as const;
  const job = S.jobStorage.decode(row[j.snapshot]);
  const locks = yield* jobLocks(mapping, job);

  if (locks === undefined || locks.row[j.state] !== "Pending") return { _tag: "Empty" } as const;
  invariant(
    locks.row[j.claimId] === null &&
      locks.row[j.claimedAt] === null &&
      locks.row[j.claimExpiresAt] === null,
  );

  const now = yield* owner.now(mapping.clock),
    expires = now + input.lifetimeMillis;

  invariant(Number.isSafeInteger(expires));

  const claim = snapshotOAuthSync(OAuthConnectedRevocationClaim, {
    job,
    claimId: input.claimId,
    claimedAtMillis: now,
    claimExpiresAtMillis: expires,
  });

  yield* owner.update(
    j.table,
    { [j.jobId]: job.context.jobId, [j.state]: "Pending" },
    {
      [j.state]: "Claimed",
      [j.claimId]: input.claimId,
      [j.claimedAt]: mapping.clock.encodeInstant(now),
      [j.claimExpiresAt]: mapping.clock.encodeInstant(expires),
      [j.retentionUntil]: mapping.clock.encodeInstant(S.retainedUntil(mapping, expires)),
      [j.version]: owner.marker,
    },
  );
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${now} and ${mapping.clock.engineNowMillis} < ${expires}`,
  );

  return { _tag: "Claimed", claim } as const;
});

export const settleRevocation = Effect.fn("oauthConnected.settleRevocation")(function* (
  mapping: S.Revocations,
  input: WorkerInput<"settle">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const locks = yield* jobLocks(mapping, input.claim.job);

  if (locks === undefined) return { settled: false };

  const j = mapping.job,
    row = locks.row;

  if (row[j.state] !== "Claimed" || row[j.claimId] !== input.claim.claimId)
    return { settled: false };
  invariant(
    revocationClaimStorage.encode({
      job: input.claim.job,
      claimId: row[j.claimId],
      claimedAtMillis: mapping.clock.decodeInstant(row[j.claimedAt]),
      claimExpiresAtMillis: mapping.clock.decodeInstant(row[j.claimExpiresAt]),
    }) === revocationClaimStorage.encode(input.claim),
  );
  const now = yield* owner.now(mapping.clock);

  invariant(now >= input.claim.claimedAtMillis);
  const confirmed = input.outcome === "Confirmed" && now < input.claim.claimExpiresAtMillis;

  yield* owner.update(
    j.table,
    {
      [j.jobId]: input.claim.job.context.jobId,
      [j.state]: "Claimed",
      [j.claimId]: input.claim.claimId,
    },
    { [j.state]: confirmed ? "Confirmed" : "Unknown", [j.version]: owner.marker },
  );
  if (confirmed) {
    owner.postconditions.push(
      sql`${mapping.clock.engineNowMillis} >= ${now} and ${mapping.clock.engineNowMillis} < ${input.claim.claimExpiresAtMillis}`,
    );
    yield* C.clear(mapping, locks.client, locks.cohort, input.claim.job.context.jobId);
  }

  return { settled: true };
});

/** Candidate discovery is not authority. Each conditional write re-reads its row
 * and engine time under the client/tuple/cohort order and retains a final guard. */
export const cleanup = Effect.fn("oauthConnected.cleanup")(function* (
  mapping: S.Mapping,
  input: F.Input<"cleanup">,
) {
  const owner = yield* CurrentOAuthTransaction;

  invariant(Number.isSafeInteger(input.limit) && input.limit >= 1 && input.limit <= 1000);

  const f = mapping.flow,
    a = mapping.admission,
    d = mapping.command;

  let terminalized = 0,
    removed = 0,
    visited = 0,
    hasMore = false;

  const at = yield* owner.now(mapping.clock);

  const candidates = yield* owner.read(
    f.table,
    both(
      eq(col(f.table, f.moduleId), input.moduleId),
      sql`((${col(f.table, f.state)} in ('Prepared','Pending') and ${col(f.table, f.expiresAt)} <= ${mapping.clock.encodeInstant(at)}) or (${col(f.table, f.state)} = 'Claimed' and ${col(f.table, f.claimExpiresAt)} <= ${mapping.clock.encodeInstant(at)}) or (${col(f.table, f.state)} not in ('Prepared','Pending','Claimed') and ${col(f.table, f.work)} <> 'Unresolved' and ${col(f.table, f.retentionUntil)} <= ${mapping.clock.encodeInstant(at)}))`,
    ),
    {
      limit: input.limit + 1,
      takeOnly: true,
      observe: false,
      lock: false,
      orderBy: asc(col(f.table, f.flowId)),
    },
  );

  const collectionCandidates = yield* discover(mapping, input.moduleId, input.limit);

  const g = mapping.grant,
    j = S.jobTable(mapping),
    h = mapping.cohort;

  yield* S.prelockClients(
    mapping,
    [
      ...candidates.rows.slice(0, input.limit).map((row) => row[f.clientKey]),
      ...collectionCandidates.jobs.slice(0, input.limit).map((row) => row[j!.clientKey]),
      ...collectionCandidates.grants.slice(0, input.limit).map((row) => row[g.clientKey]),
      ...collectionCandidates.cohorts.slice(0, input.limit).map((row) => row[h.clientKey]),
    ],
    collectionCandidates.tuples.slice(0, input.limit).map((row) => ({
      provider: row[mapping.ownership.tuple.provider],
      issuer: row[mapping.ownership.tuple.issuer],
    })),
  );
  hasMore = candidates.rows.length > input.limit;
  for (const candidate of candidates.rows.slice(0, input.limit)) {
    visited++;
    // A terminal ledger retains client key but may erase the decryptable browser snapshot.
    const heldClient = yield* S.lockClientById(mapping, candidate[f.clientKey]);

    const read = yield* owner.read(
        f.table,
        equal(f.table, { [f.moduleId]: input.moduleId, [f.flowId]: candidate[f.flowId] }),
        { limit: 1 },
      ),
      row = read.rows[0];

    if (row === undefined) continue;
    invariant(row[f.clientKey] === heldClient.id);

    const now = yield* owner.now(mapping.clock),
      state = row[f.state];

    const expires = mapping.clock.decodeInstant(
      state === "Claimed" ? row[f.claimExpiresAt] : row[f.expiresAt],
    );

    if ((state === "Prepared" || state === "Pending" || state === "Claimed") && now >= expires) {
      yield* owner.update(
        f.table,
        { [f.moduleId]: input.moduleId, [f.flowId]: row[f.flowId], [f.version]: row[f.version] },
        {
          [f.state]: state === "Claimed" ? "Ambiguous" : "Expired",
          [f.snapshot]: null,
          [f.version]: owner.marker,
        },
      );
      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${expires}`);
      terminalized++;
    } else if (
      state !== "Prepared" &&
      state !== "Pending" &&
      state !== "Claimed" &&
      row[f.work] !== "Unresolved" &&
      now >= mapping.clock.decodeInstant(row[f.retentionUntil])
    ) {
      yield* owner.remove(f.table, {
        [f.moduleId]: input.moduleId,
        [f.flowId]: row[f.flowId],
        [f.version]: row[f.version],
      });
      owner.postconditions.push(
        sql`${mapping.clock.engineNowMillis} >= ${mapping.clock.decodeInstant(row[f.retentionUntil])}`,
      );
      removed++;
    }
  }
  // Expired admission and command metadata have no external-operation obligation.
  for (const table of [a, d]) {
    if (visited >= input.limit) {
      hasMore = true;
      break;
    }

    const deadline = "expiresAt" in table ? table.expiresAt : table.retentionUntil,
      key = "admissionId" in table ? table.admissionId : table.commandId;

    const rows = yield* owner.read(
      table.table,
      both(
        eq(col(table.table, table.moduleId), input.moduleId),
        lte(col(table.table, deadline), mapping.clock.encodeInstant(at)),
      ),
      {
        limit: input.limit - visited + 1,
        takeOnly: true,
        observe: false,
        lock: false,
        orderBy: asc(col(table.table, key)),
      },
    );

    if (rows.rows.length > input.limit - visited) hasMore = true;
    for (const candidate of rows.rows.slice(0, input.limit - visited)) {
      visited++;

      const read = yield* owner.read(
          table.table,
          equal(table.table, { [table.moduleId]: input.moduleId, [key]: candidate[key] }),
          { limit: 1 },
        ),
        row = read.rows[0];

      const now = yield* owner.now(mapping.clock);

      if (row !== undefined && now >= mapping.clock.decodeInstant(row[deadline])) {
        yield* owner.remove(table.table, {
          [table.moduleId]: input.moduleId,
          [key]: row[key],
          [table.version]: row[table.version],
        });
        owner.postconditions.push(
          sql`${mapping.clock.engineNowMillis} >= ${mapping.clock.decodeInstant(row[deadline])}`,
        );
        removed++;
      }
    }
  }

  const collection = yield* collect(
    mapping,
    input.moduleId,
    input.limit - visited,
    collectionCandidates,
  );

  removed += collection.removed;
  hasMore ||= collection.hasMore;

  return { terminalized, removed, hasMore };
});
