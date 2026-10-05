import * as M from "@yielded/auth/OAuth";
import { snapshotOAuthSync } from "@yielded/auth/OAuth";
import { eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import * as S from "./oauth-connected-state";
import { both, col, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { invariant, oauthIdentityKey } from "./oauth-state";

type Client = NonNullable<Effect.Success<ReturnType<typeof S.client>>>;
type Cohort = Effect.Success<ReturnType<typeof S.cohort>>;

export const sameContext = (a: M.OAuthConnectedTokenContext, b: M.OAuthConnectedTokenContext) =>
  S.tokenContextStorage.encode(a) === S.tokenContextStorage.encode(b);

export const sameGrant = (a: M.OAuthConnectedStoredGrant, b: M.OAuthConnectedStoredGrant) =>
  S.grantStorage.encode(a) === S.grantStorage.encode(b);

export const summary = (context: M.OAuthConnectedTokenContext) =>
  snapshotOAuthSync(M.OAuthConnectedSummary, {
    grantId: context.grantId,
    provider: context.identity.provider,
    issuer: context.identity.issuer,
    profileKey: context.configuration.profile.key,
    status: "Active",
    scopes: context.metadata.scopes,
    ...(context.metadata.accessExpiresAtMillis === undefined
      ? {}
      : { accessExpiresAtMillis: context.metadata.accessExpiresAtMillis }),
    useUntilMillis: context.metadata.useUntilMillis,
    ...(context.metadata.profile === undefined ? {} : { profile: context.metadata.profile }),
    remoteRevocation:
      context.configuration.profile.revocation === "cohort" ? "Pending" : "Unsupported",
  });

/** A generation fences every sibling, including those beyond a bounded metadata page. */
export const fence = Effect.fn("oauthConnected.fence")(function* (
  mapping: S.Authority,
  client: Client,
  cohort: Cohort,
) {
  const owner = yield* CurrentOAuthTransaction;

  invariant(cohort.row !== undefined);

  const g = mapping.grant,
    h = mapping.cohort;

  const active = both(
    eq(col(g.table, g.cohortKey), cohort.id),
    isNotNull(col(g.table, g.activeIdentityKey)),
  );

  const affected = yield* S.rowCount(g.table, active);

  invariant(yield* owner.check(S.countCondition(g.table, active, affected)));
  const cutoff = yield* S.nextOrder(mapping, client);
  const generation = M.OAuthConnectedTarget.fields.cohortGeneration.make(owner.marker);

  yield* owner.update(
    h.table,
    { [h.cohortKey]: cohort.id },
    {
      [h.generation]: generation,
      [h.cutoff]: mapping.order.encode(cutoff),
      [h.state]: "Blocked",
      [h.version]: owner.marker,
    },
  );
  yield* owner.write(
    owner.database
      .update(g.table)
      .set({
        [g.activeIdentityKey]: null,
        [g.state]: "ReauthorizationRequired",
        [g.version]: owner.marker,
      })
      .where(active),
  );
  for (const observation of owner.observations)
    if (observation.table === g.table)
      observation.rows = observation.rows.map((row) =>
        row[g.cohortKey] === cohort.id && row[g.activeIdentityKey] !== null
          ? {
              ...row,
              [g.activeIdentityKey]: null,
              [g.state]: "ReauthorizationRequired",
              [g.version]: owner.marker,
            }
          : row,
      );
  owner.postconditions.push(sql`not exists(select 1 from ${g.table} where ${active})`);
  cohort.generation = generation;
  cohort.cutoff = cutoff;
  cohort.blocked = true;

  return affected;
});

export const storeJob = Effect.fn("oauthConnected.storeJob")(function* (
  mapping: S.Mapping,
  job: M.OAuthConnectedRevocationJob,
  token: M.OAuthConnectedTokenContext,
  native: unknown,
  now: number,
) {
  const owner = yield* CurrentOAuthTransaction;

  invariant(
    mapping.revocation.mode === "cohort" &&
      token.configuration.profile.revocation === "cohort" &&
      sameContext(job.context.token, token),
  );

  const j = mapping.revocation.job,
    identity = oauthIdentityKey(token.identity),
    client = S.clientKey(token.configuration),
    cohort = S.cohortKey(client, identity);

  const h = mapping.cohort;

  owner.postconditions.push(
    sql`exists(select 1 from ${h.table} where ${both(equal(h.table, { [h.cohortKey]: cohort, [h.clientKey]: client, [h.identityKey]: identity, [h.state]: "Blocked" }))})`,
  );
  const key = { [j.jobId]: job.context.jobId };
  const prior = yield* owner.read(j.table, equal(j.table, key), { limit: 1 });

  if (prior.rows.length) {
    const row = prior.rows[0]!;

    invariant(
      row[j.snapshot] === S.jobStorage.encode(job) &&
        row[j.moduleId] === token.moduleId &&
        mapping.subjectId.equals(row[j.subjectId], native) &&
        row[j.identityKey] === identity &&
        row[j.clientKey] === client &&
        row[j.cohortKey] === cohort &&
        row[j.grantId] === token.grantId &&
        ["Pending", "Claimed", "Confirmed", "Unknown"].includes(row[j.state]),
    );
    invariant(
      row[j.state] === "Pending"
        ? row[j.claimId] === null && row[j.claimedAt] === null && row[j.claimExpiresAt] === null
        : typeof row[j.claimId] === "string" &&
            mapping.clock.decodeInstant(row[j.claimExpiresAt]) >
              mapping.clock.decodeInstant(row[j.claimedAt]),
    );

    return;
  }

  const inserted = yield* owner.insert(
    j.table,
    {
      ...j.encodeInsert({
        job: snapshotOAuthSync(M.OAuthConnectedRevocationJob, job),
        subjectId: S.nativeCopy(native),
      }),
      ...key,
      [j.moduleId]: token.moduleId,
      [j.subjectId]: native,
      [j.identityKey]: identity,
      [j.clientKey]: client,
      [j.cohortKey]: cohort,
      [j.grantId]: token.grantId,
      [j.snapshot]: S.jobStorage.encode(job),
      [j.state]: "Pending",
      [j.claimId]: null,
      [j.claimedAt]: null,
      [j.claimExpiresAt]: null,
      [j.retentionUntil]: mapping.clock.encodeInstant(S.retainedUntil(mapping, now)),
      [j.version]: owner.marker,
    },
    key,
  );

  prior.rows = inserted.rows;
});

const noJobs = (mapping: S.Authority, id: string | SQL, except?: string) => {
  const j = S.jobTable(mapping);

  return j === undefined
    ? sql`1 = 1`
    : sql`not exists(select 1 from ${j.table} where ${both(eq(col(j.table, j.cohortKey), id), ne(col(j.table, j.state), "Confirmed"), except === undefined ? undefined : ne(col(j.table, j.jobId), except))})`;
};

export const clearableCondition = (
  mapping: S.Authority,
  cohortId: string | SQL,
  clientId: string | SQL,
) => {
  const f = mapping.flow;

  return both(
    sql`not exists(select 1 from ${f.table} where ${S.unknownWork(mapping, clientId)})`,
    S.cohortWork(mapping, cohortId),
    noJobs(mapping, cohortId),
  );
};

/** Clearing owns a NEW cutoff. Claims made while the remote revoke was pending
 * cannot enter the next generation even if they finish after that revoke. */
export const clear = Effect.fn("oauthConnected.clear")(function* (
  mapping: S.Authority,
  client: Client,
  cohort: Cohort,
  confirmedJob?: string,
  provenOpenWithoutNewJob = false,
) {
  const owner = yield* CurrentOAuthTransaction;

  if (
    !cohort.blocked ||
    cohort.row === undefined ||
    (S.jobTable(mapping) === undefined && !provenOpenWithoutNewJob)
  )
    return false;
  const f = mapping.flow;
  const noUnknown = sql`not exists(select 1 from ${f.table} where ${S.unknownWork(mapping, client.id)})`;
  const work = S.cohortWork(mapping, cohort.id);

  if (!(yield* owner.check(both(noUnknown, work, noJobs(mapping, cohort.id, confirmedJob)))))
    return false;

  const cutoff = yield* S.nextOrder(mapping, client),
    h = mapping.cohort;

  const generation = M.OAuthConnectedTarget.fields.cohortGeneration.make(owner.marker + ":open");

  yield* owner.update(
    h.table,
    { [h.cohortKey]: cohort.id },
    {
      [h.generation]: generation,
      [h.cutoff]: mapping.order.encode(cutoff),
      [h.state]: "Open",
      [h.version]: owner.marker,
    },
  );
  owner.postconditions.push(noUnknown, work, noJobs(mapping, cohort.id));
  cohort.generation = generation;
  cohort.cutoff = cutoff;
  cohort.blocked = false;

  return true;
});

/** Former local owners remain visible. A foreign historical dependency cannot be
 * ignored simply because the global tuple was changed outside this authority. */
export const noFormerOwner = (
  mapping: S.Authority,
  identity: string,
  client: string,
  native: unknown,
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) => {
    const g = mapping.grant,
      f = mapping.flow,
      j = S.jobTable(mapping);

    const condition = both(
      sql`not exists(select 1 from ${g.table} where ${both(eq(col(g.table, g.identityKey), identity), sql`not (${owner.exact(g.table, { [g.subjectId]: native })})`)})`,
      sql`not exists(select 1 from ${f.table} where ${both(eq(col(f.table, f.cohortKey), S.cohortKey(client, identity)), eq(col(f.table, f.work), "Unresolved"), sql`not (${owner.exact(f.table, { [f.subjectId]: native })})`)})`,
      ...(j === undefined
        ? []
        : [
            sql`not exists(select 1 from ${j.table} where ${both(eq(col(j.table, j.identityKey), identity), sql`not (${owner.exact(j.table, { [j.subjectId]: native })})`)})`,
          ]),
    );

    return Effect.map(owner.check(condition), (accepted) => {
      if (accepted) owner.postconditions.push(condition);

      return accepted;
    });
  });
