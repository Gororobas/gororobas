import * as M from "@yielded/auth/OAuth";
import { snapshotOAuthSync } from "@yielded/auth/OAuth";
import { asc, eq, gt, lte } from "drizzle-orm";
import { Effect } from "effect";

import * as A from "./oauth-connected-access";
import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import * as S from "./oauth-connected-state";
import { both, col, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { digest, invariant } from "./oauth-state";

export const list = Effect.fn("oauthConnected.list")(function* (
  mapping: S.Mapping,
  input: F.Input<"list">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const found = yield* S.useAuthority(mapping, input.authorization, "metadata");

  if (found === undefined) return { items: [] };
  invariant(Number.isSafeInteger(input.limit) && input.limit >= 1 && input.limit <= 100);

  const g = mapping.grant,
    h = mapping.cohort,
    j = S.jobTable(mapping);

  const cursor = input.cursor === undefined ? undefined : M.OAuthGrantId.make(input.cursor);

  const where = both(
    equal(g.table, { [g.moduleId]: input.authorization.moduleId, [g.subjectId]: found.nativeId }),
    cursor === undefined ? undefined : gt(col(g.table, g.grantId), cursor),
    input.authorization.grantId === undefined
      ? undefined
      : eq(col(g.table, g.grantId), input.authorization.grantId),
    input.authorization.profileKey === undefined
      ? undefined
      : eq(col(g.table, g.profileKey), input.authorization.profileKey),
  );

  const columns = [
    g.moduleId,
    g.grantId,
    g.subjectId,
    g.identityKey,
    g.clientKey,
    g.cohortKey,
    g.cohortGeneration,
    g.profileKey,
    g.state,
    g.summary,
    g.revocationJobId,
    g.version,
  ];

  const read = yield* owner.read(g.table, where, {
    columns,
    limit: input.limit + 1,
    takeOnly: true,
    observe: false,
    lock: false,
    orderBy: asc(col(g.table, g.grantId)),
  });

  const more = read.rows.length > input.limit,
    rows = read.rows.slice(0, input.limit),
    last = rows.at(-1)?.[g.grantId];

  owner.observations.push({
    table: g.table,
    where: more ? both(where, lte(col(g.table, g.grantId), last)) : where,
    rows,
  });
  const items: Array<typeof M.OAuthConnectedSummary.Type> = [];

  for (const row of rows) {
    const summary = S.summaryStorage.decode(row[g.summary]);

    invariant(
      summary.grantId === row[g.grantId] &&
        summary.profileKey === row[g.profileKey] &&
        mapping.subjectId.equals(found.nativeId, row[g.subjectId]),
    );

    const co = yield* owner.read(h.table, equal(h.table, { [h.cohortKey]: row[g.cohortKey] }), {
      limit: 1,
      lock: false,
    });

    const cr = co.rows[0];

    invariant(
      cr !== undefined &&
        cr[h.clientKey] === row[g.clientKey] &&
        cr[h.identityKey] === row[g.identityKey],
    );
    let status = row[g.state] as (typeof M.OAuthConnectedSummary.Type)["status"];

    if (
      status !== "Disconnected" &&
      (cr[h.state] !== "Open" || cr[h.generation] !== row[g.cohortGeneration])
    )
      status = "ReauthorizationRequired";
    let remote = summary.remoteRevocation;

    if (row[g.revocationJobId] !== null) {
      if (j === undefined) remote = "Unknown";
      else {
        const job = yield* owner.read(
          j.table,
          equal(j.table, { [j.jobId]: row[g.revocationJobId] }),
          {
            limit: 1,
            lock: false,
            columns: [j.jobId, j.moduleId, j.grantId, j.cohortKey, j.state],
          },
        );

        const jr = job.rows[0];

        invariant(
          jr !== undefined &&
            jr[j.moduleId] === row[g.moduleId] &&
            jr[j.grantId] === row[g.grantId] &&
            jr[j.cohortKey] === row[g.cohortKey],
        );
        remote =
          jr[j.state] === "Confirmed"
            ? "Confirmed"
            : jr[j.state] === "Unknown"
              ? "Unknown"
              : "Pending";
      }
    }
    items.push(
      snapshotOAuthSync(M.OAuthConnectedSummary, { ...summary, status, remoteRevocation: remote }),
    );
  }

  return { items, ...(more ? { cursor: last as string } : {}) };
});

const command = Effect.fn("oauthConnected.disconnectCommand")(function* (
  mapping: S.Mapping,
  moduleId: string,
  commandId: string,
  lock = true,
) {
  const owner = yield* CurrentOAuthTransaction;

  const d = mapping.command,
    read = yield* owner.read(
      d.table,
      equal(d.table, { [d.moduleId]: moduleId, [d.commandId]: commandId }),
      { limit: 1, lock, observe: lock },
    );

  const row = read.rows[0];

  if (row === undefined) return { read };

  const grant = S.commandStorage.decode(row[d.intent]),
    result = S.disconnectedStorage.decode(row[d.decision]);

  const native = yield* mapping.subjectId.toNative(grant.context.subjectId);

  invariant(
    grant.context.moduleId === moduleId &&
      grant.context.grantId === row[d.grantId] &&
      result.grantId === grant.context.grantId &&
      mapping.subjectId.equals(native, row[d.subjectId]) &&
      !result.replayed,
  );

  return { read, row, grant, result };
});

export const inspectDisconnect = Effect.fn("oauthConnected.inspectDisconnect")(function* (
  mapping: S.Mapping,
  input: F.Input<"inspectDisconnect">,
) {
  const found = yield* S.useAuthority(mapping, input.authorization, "metadata");

  if (
    found === undefined ||
    input.subjectId !== found.revision.subjectId ||
    input.moduleId !== input.authorization.moduleId
  )
    return { _tag: "Rejected" } as const;
  const discovered = yield* command(mapping, input.moduleId, input.commandId, false);

  if (discovered.row !== undefined) {
    if (
      discovered.grant.context.subjectId !== input.subjectId ||
      discovered.grant.context.grantId !== input.grantId
    )
      return { _tag: "Conflict" } as const;
    if (
      (yield* S.useAuthority(
        mapping,
        input.authorization,
        "metadata",
        discovered.grant.context,
      )) === undefined
    )
      return { _tag: "Rejected" } as const;
    const prior = yield* command(mapping, input.moduleId, input.commandId);
    const d = mapping.command;

    if (
      prior.row === undefined ||
      prior.row[d.intent] !== discovered.row[d.intent] ||
      prior.row[d.decision] !== discovered.row[d.decision] ||
      prior.row[d.version] !== discovered.row[d.version]
    )
      return { _tag: "Rejected" } as const;

    return { _tag: "Replay", result: { ...prior.result, replayed: true } } as const;
  }
  const read = yield* A.locked(mapping, input.authorization, input.grantId, "metadata");

  if (read === undefined) return { _tag: "Rejected" } as const;
  const finalCommand = yield* command(mapping, input.moduleId, input.commandId);

  if (finalCommand.row !== undefined) return { _tag: "Rejected" } as const;

  return {
    _tag: "Target",
    grant: {
      context: read.grant.context,
      ...(read.grant.sealed === undefined ? {} : { sealed: read.grant.sealed }),
    },
    revision: read.found.revision,
  } as const;
});

export const disconnect = Effect.fn("oauthConnected.disconnect")(function* (
  mapping: S.Mapping,
  input: F.Input<"disconnect">,
) {
  const owner = yield* CurrentOAuthTransaction;

  const token = input.grant.context,
    found = yield* S.current(mapping, token.subjectId);

  if (
    found === undefined ||
    input.moduleId !== token.moduleId ||
    !(yield* S.action(mapping, found, input.authorization, "disconnect", {
      moduleId: input.moduleId,
      flowId: input.commandId,
      commandId: input.commandId,
      revision: input.authorization.challenge.revision,
      intent: S.disconnectStorage.encode(input.grant),
      maximumAgeMillis: 300000,
      configuration: token.configuration,
      grant: token,
    }))
  )
    return { _tag: "Rejected" } as const;
  const client = yield* S.client(mapping, token.configuration, false);

  if (client === undefined) return { _tag: "Rejected" } as const;

  const tuple = yield* F.inspectTuple(mapping, token.identity),
    t = mapping.ownership.tuple;

  if (
    tuple.row?.[t.state] !== "Owned" ||
    !mapping.subjectId.equals(tuple.row[t.subjectId], found.nativeId)
  )
    return { _tag: "Conflict" } as const;
  const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

  invariant(cohort.row !== undefined);

  const read = yield* S.readGrant(mapping, input.moduleId, token.grantId),
    g = mapping.grant;

  if (
    read === undefined ||
    !C.sameContext(read.context, token) ||
    S.disconnectStorage.encode({
      context: read.context,
      ...(read.sealed === undefined ? {} : { sealed: read.sealed }),
    }) !== S.disconnectStorage.encode(input.grant)
  )
    return { _tag: "Conflict" } as const;
  const prior = yield* command(mapping, input.moduleId, input.commandId);

  // Only inspectDisconnect exposes replay. Mutation replay cannot repeat effects.
  if (prior.row !== undefined) return { _tag: "Conflict" } as const;

  const now = yield* owner.now(mapping.clock),
    wasOpen = !cohort.blocked;

  invariant(input.retentionUntilMillis >= now && input.retentionUntilMillis <= now + 2592000000);
  const affected = yield* C.fence(mapping, client, cohort);
  let remote: (typeof M.OAuthConnectedSummary.Type)["remoteRevocation"] = "Unsupported";

  if (input.revocation !== undefined) {
    yield* C.storeJob(mapping, input.revocation, token, found.nativeId, now);
    remote = "Pending";
  } else if (token.configuration.profile.revocation === "cohort") {
    invariant(read.sealed === undefined);
    remote = "Unknown";
  }

  const result = snapshotOAuthSync(M.OAuthConnectedDisconnected, {
    _tag: "Disconnected",
    grantId: token.grantId,
    remoteRevocation: remote,
    affectedGrantCount: affected,
    replayed: false,
  });

  yield* owner.update(
    g.table,
    { [g.moduleId]: input.moduleId, [g.grantId]: token.grantId },
    {
      [g.state]: "Disconnected",
      [g.activeIdentityKey]: null,
      [g.sealed]: null,
      [g.revocationJobId]: input.revocation?.context.jobId ?? read.row[g.revocationJobId],
      [g.version]: owner.marker,
    },
  );

  const d = mapping.command,
    key = { [d.moduleId]: input.moduleId, [d.commandId]: input.commandId };

  const inserted = yield* owner.insert(
    d.table,
    {
      ...d.encodeInsert({
        commandId: input.commandId,
        grant: snapshotOAuthSync(M.OAuthConnectedDisconnectGrant, input.grant),
        subjectId: S.nativeCopy(found.nativeId),
      }),
      ...key,
      [d.subjectId]: found.nativeId,
      [d.grantId]: token.grantId,
      [d.intent]: S.commandStorage.encode({
        context: token,
        originalDigest: digest(S.disconnectStorage.encode(input.grant)),
        ...(input.revocation === undefined
          ? {}
          : { revocationJobId: input.revocation.context.jobId }),
      }),
      [d.decision]: S.disconnectedStorage.encode(result),
      [d.retentionUntil]: mapping.clock.encodeInstant(input.retentionUntilMillis),
      [d.version]: owner.marker,
    },
    key,
  );

  prior.read.rows = inserted.rows;
  if (
    wasOpen &&
    input.revocation === undefined &&
    token.configuration.profile.revocation === "unsupported"
  )
    yield* C.clear(mapping, client, cohort, undefined, true);

  return result;
});
