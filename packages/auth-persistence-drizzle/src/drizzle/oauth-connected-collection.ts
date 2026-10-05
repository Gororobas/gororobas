import { asc, eq, lte, sql } from "drizzle-orm";
import { Effect } from "effect";

import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import { connectedReferenceCondition } from "./oauth-connected-reference";
import * as S from "./oauth-connected-state";
import { both, col, equal, CurrentOAuthTransaction, type Row } from "./oauth-owner";
import { invariant, oauthIdentityKey } from "./oauth-state";

export interface Candidates {
  readonly jobs: ReadonlyArray<Row>;
  readonly grants: ReadonlyArray<Row>;
  readonly cohorts: ReadonlyArray<Row>;
  readonly tuples: ReadonlyArray<Row>;
}

export const discover = Effect.fn("oauthConnected.collectionCandidates")(function* (
  mapping: S.Mapping,
  moduleId: string,
  limit: number,
) {
  const owner = yield* CurrentOAuthTransaction;

  const g = mapping.grant,
    j = S.jobTable(mapping),
    h = mapping.cohort,
    at = yield* owner.now(mapping.clock);

  const jobs =
    j === undefined
      ? { rows: [] }
      : yield* owner.read(
          j.table,
          both(
            eq(col(j.table, j.moduleId), moduleId),
            eq(col(j.table, j.state), "Confirmed"),
            lte(col(j.table, j.retentionUntil), mapping.clock.encodeInstant(at)),
          ),
          {
            limit: limit + 1,
            takeOnly: true,
            observe: false,
            lock: false,
            orderBy: asc(col(j.table, j.jobId)),
          },
        );

  const grants = yield* owner.read(
    g.table,
    both(
      eq(col(g.table, g.moduleId), moduleId),
      sql`${col(g.table, g.state)} in ('Disconnected','ReauthorizationRequired')`,
      sql`${col(g.table, g.sealed)} is null`,
      sql`${col(g.table, g.refreshWork)} <> 'Unresolved'`,
      lte(col(g.table, g.retentionUntil), mapping.clock.encodeInstant(at)),
      sql`${col(g.table, g.revocationJobId)} is null`,
      sql`not exists(select 1 from ${mapping.admission.table} where ${col(mapping.admission.table, mapping.admission.moduleId)} = ${col(g.table, g.moduleId)} and ${col(mapping.admission.table, mapping.admission.grantId)} = ${col(g.table, g.grantId)})`,
      sql`not exists(select 1 from ${mapping.command.table} where ${col(mapping.command.table, mapping.command.moduleId)} = ${col(g.table, g.moduleId)} and ${col(mapping.command.table, mapping.command.grantId)} = ${col(g.table, g.grantId)})`,
      j === undefined
        ? undefined
        : sql`not exists(select 1 from ${j.table} where ${col(j.table, j.moduleId)} = ${col(g.table, g.moduleId)} and ${col(j.table, j.grantId)} = ${col(g.table, g.grantId)})`,
    ),
    {
      limit: limit + 1,
      takeOnly: true,
      observe: false,
      lock: false,
      orderBy: asc(col(g.table, g.grantId)),
    },
  );

  const cohorts =
    j === undefined
      ? { rows: [] }
      : yield* owner.read(
          h.table,
          both(
            equal(h.table, { [h.state]: "Blocked" }),
            C.clearableCondition(
              mapping,
              sql`${col(h.table, h.cohortKey)}`,
              sql`${col(h.table, h.clientKey)}`,
            ),
          ),
          {
            limit: limit + 1,
            takeOnly: true,
            observe: false,
            lock: false,
            orderBy: asc(col(h.table, h.cohortKey)),
          },
        );

  const t = mapping.ownership.tuple;

  const tuples =
    mapping.externalReference === undefined
      ? { rows: [] }
      : yield* owner.read(
          t.table,
          both(
            eq(col(t.table, t.state), "Owned"),
            sql`not (${connectedReferenceCondition(mapping, sql`${col(t.table, t.identityKey)}`, { provider: sql`${col(t.table, t.provider)}`, issuer: sql`${col(t.table, t.issuer)}` })})`,
            sql`not (${mapping.externalReference({ identityKey: sql`${col(t.table, t.identityKey)}`, subjectId: sql`${col(t.table, t.subjectId)}` })})`,
          ),
          {
            limit: limit + 1,
            takeOnly: true,
            observe: false,
            lock: false,
            orderBy: asc(col(t.table, t.identityKey)),
          },
        );

  return { jobs: jobs.rows, grants: grants.rows, cohorts: cohorts.rows, tuples: tuples.rows };
});

export const collect = Effect.fn("oauthConnected.collect")(function* (
  mapping: S.Mapping,
  moduleId: string,
  limit: number,
  discovered: Candidates,
) {
  const owner = yield* CurrentOAuthTransaction;

  let visited = 0,
    removed = 0,
    hasMore = false;

  if (limit === 0) return { visited, removed, hasMore: true };

  const g = mapping.grant,
    j = S.jobTable(mapping),
    h = mapping.cohort;

  if (j !== undefined) {
    const candidates = { rows: discovered.jobs };

    hasMore = candidates.rows.length > limit;
    for (const candidate of candidates.rows.slice(0, limit)) {
      visited++;

      const job = S.jobStorage.decode(candidate[j.snapshot]),
        token = job.context.token;

      const client = yield* S.client(mapping, token.configuration, false);

      invariant(client !== undefined);
      const tuple = yield* F.inspectTuple(mapping, token.identity);
      const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

      invariant(cohort.row !== undefined);
      const grant = yield* S.readGrant(mapping, token.moduleId, token.grantId);

      const read = yield* owner.read(j.table, equal(j.table, { [j.jobId]: job.context.jobId }), {
          limit: 1,
        }),
        row = read.rows[0];

      if (row === undefined) continue;
      const native = yield* mapping.subjectId.toNative(token.subjectId);

      invariant(
        row[j.snapshot] === S.jobStorage.encode(job) &&
          row[j.moduleId] === moduleId &&
          row[j.identityKey] === tuple.key &&
          row[j.clientKey] === client.id &&
          row[j.cohortKey] === cohort.id &&
          row[j.grantId] === token.grantId &&
          mapping.subjectId.equals(row[j.subjectId], native),
      );

      const now = yield* owner.now(mapping.clock),
        until = mapping.clock.decodeInstant(row[j.retentionUntil]);

      if (row[j.state] !== "Confirmed" || now < until) continue;
      if (grant?.row[g.revocationJobId] === job.context.jobId) {
        const summary = S.summaryStorage.decode(grant.row[g.summary]);

        yield* owner.update(
          g.table,
          { [g.moduleId]: token.moduleId, [g.grantId]: token.grantId },
          {
            [g.revocationJobId]: null,
            [g.summary]: S.summaryStorage.encode({ ...summary, remoteRevocation: "Confirmed" }),
            [g.version]: owner.marker,
          },
        );
      }
      yield* owner.remove(j.table, {
        [j.jobId]: job.context.jobId,
        [j.state]: "Confirmed",
        [j.version]: row[j.version],
      });
      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${until}`);
      removed++;
    }
  }
  if (visited < limit) {
    const candidates = { rows: discovered.grants };
    const remaining = limit - visited;

    if (candidates.rows.length > remaining) hasMore = true;
    for (const candidate of candidates.rows.slice(0, remaining)) {
      visited++;
      const context = S.tokenContextStorage.decode(candidate[g.context]);
      const client = yield* S.client(mapping, context.configuration, false);

      invariant(client !== undefined);
      const tuple = yield* F.inspectTuple(mapping, context.identity);
      const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

      invariant(cohort.row !== undefined);
      const grant = yield* S.readGrant(mapping, moduleId, context.grantId);

      if (grant === undefined) continue;

      const now = yield* owner.now(mapping.clock),
        until = mapping.clock.decodeInstant(grant.row[g.retentionUntil]);

      if (
        !["Disconnected", "ReauthorizationRequired"].includes(grant.row[g.state]) ||
        grant.row[g.sealed] !== null ||
        grant.row[g.refreshWork] === "Unresolved" ||
        grant.row[g.revocationJobId] !== null ||
        now < until
      )
        continue;

      const a = mapping.admission,
        d = mapping.command;

      const references = both(
        sql`not exists(select 1 from ${a.table} where ${equal(a.table, { [a.moduleId]: moduleId, [a.grantId]: context.grantId })})`,
        sql`not exists(select 1 from ${d.table} where ${equal(d.table, { [d.moduleId]: moduleId, [d.grantId]: context.grantId })})`,
        ...(j === undefined
          ? []
          : [
              sql`not exists(select 1 from ${j.table} where ${equal(j.table, { [j.moduleId]: moduleId, [j.grantId]: context.grantId })})`,
            ]),
      );

      if (!(yield* owner.check(references))) continue;
      yield* owner.remove(g.table, {
        [g.moduleId]: moduleId,
        [g.grantId]: context.grantId,
        [g.version]: grant.row[g.version],
      });
      owner.postconditions.push(references, sql`${mapping.clock.engineNowMillis} >= ${until}`);
      removed++;
    }
  }
  // Clearing is global remote authority, independent of the module which happens
  // to run cleanup. No subject filter may hide a former owner's unresolved work.
  if (visited < limit && j !== undefined) {
    const candidates = { rows: discovered.cohorts };
    const remaining = limit - visited;

    if (candidates.rows.length > remaining) hasMore = true;
    for (const candidate of candidates.rows.slice(0, remaining)) {
      visited++;
      const id = candidate[h.clientKey];
      const client = yield* S.lockClientById(mapping, id);
      const cohort = yield* S.cohort(mapping, id, candidate[h.identityKey], false);

      invariant(cohort.id === candidate[h.cohortKey] && cohort.row !== undefined);
      yield* C.clear(mapping, client, cohort);
    }
  }
  if (visited < limit && mapping.externalReference !== undefined) {
    const t = mapping.ownership.tuple,
      remaining = limit - visited;

    if (discovered.tuples.length > remaining) hasMore = true;
    for (const candidate of discovered.tuples.slice(0, remaining)) {
      visited++;
      const scope = yield* S.heldScope(mapping, candidate[t.provider], candidate[t.issuer]);

      if (scope === undefined) continue;

      const identity = {
        provider: candidate[t.provider],
        issuer: candidate[t.issuer],
        subject: candidate[t.externalSubject],
      };

      invariant(oauthIdentityKey(identity) === candidate[t.identityKey]);

      const tuple = yield* F.inspectTuple(mapping, identity),
        row = tuple.row;

      if (row === undefined || row[t.state] !== "Owned") continue;
      const native = row[t.subjectId];

      invariant(native !== null);

      const noRefs = both(
        sql`not (${connectedReferenceCondition(mapping, tuple.key)})`,
        sql`not (${mapping.externalReference({ identityKey: tuple.key, subjectId: S.nativeCopy(native) })})`,
      );

      if (!(yield* owner.check(noRefs))) continue;
      yield* S.touchScope(mapping, scope);
      yield* owner.update(
        t.table,
        { [t.identityKey]: tuple.key, [t.state]: "Owned", [t.subjectId]: native },
        {
          [t.state]: "Unowned",
          [t.subjectId]: null,
          [t.reservation]: null,
          [t.version]: owner.marker,
        },
      );
      if (mapping.ownership.mode === "separate")
        yield* owner.remove(mapping.ownership.external.table, {
          [mapping.ownership.external.identityKey]: tuple.key,
        });
      owner.postconditions.push(noRefs);
    }
  }

  return { visited, removed, hasMore };
});
