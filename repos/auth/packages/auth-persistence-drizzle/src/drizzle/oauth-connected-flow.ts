import {
  OAuthAccountRevision,
  snapshotOAuthSync,
  type OAuthConnectedPersistence,
} from "@yielded/auth/OAuth";
import * as M from "@yielded/auth/OAuth";
/* oxlint-disable no-explicit-any -- private mapped rows; public adapters retain native IDs and closed Effects. */
import { sql } from "drizzle-orm";
import { Effect } from "effect";

import * as S from "./oauth-connected-state";
import { both, copiedRow, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { acquireTuple, readTuple } from "./oauth-registration";
import { digest, invariant, oauthIdentityKey, sameIdentity, sameRevision } from "./oauth-state";

export type Input<K extends keyof OAuthConnectedPersistence["Service"]> = Parameters<
  OAuthConnectedPersistence["Service"][K]
>[0];

export const pending = Effect.fn("oauthConnected.pending")(function* (
  mapping: S.Authority,
  access: M.OAuthConnectedAccess,
  lock = true,
) {
  const owner = yield* CurrentOAuthTransaction;
  const f = mapping.flow;

  const read = yield* owner.read(
    f.table,
    equal(f.table, { [f.moduleId]: access.moduleId, [f.flowId]: access.flowId }),
    { limit: 1, lock, observe: lock },
  );

  const row = read.rows[0];

  if (row === undefined || row[f.snapshot] === null) return undefined;

  const flow = S.flowStorage.decode(row[f.snapshot]),
    c = flow.context;

  const native = yield* mapping.subjectId.toNative(c.revision.subjectId);

  invariant(
    row[f.moduleId] === c.moduleId &&
      row[f.flowId] === c.flowId &&
      row[f.commandId] === c.commandId &&
      mapping.subjectId.equals(native, row[f.subjectId]) &&
      row[f.clientKey] === S.clientKey(S.configuration(flow)) &&
      row[f.stateDigest] === c.stateDigest &&
      mapping.clock.decodeInstant(row[f.expiresAt]) === c.expiresAtMillis &&
      mapping.clock.decodeInstant(row[f.retentionUntil]) === flow.retentionUntilMillis,
  );

  const matches =
    c.moduleId === access.moduleId &&
    c.generation === access.generation &&
    c.flowId === access.flowId &&
    c.revision.subjectId === access.subjectId &&
    c.provider === access.provider &&
    c.callbackId === access.callbackId &&
    c.stateDigest === access.stateDigest &&
    c.requestBindingVerifier === access.requestBindingVerifier &&
    c.requestBindingExpiresAtMillis === access.requestBindingExpiresAtMillis &&
    (c.responseIssuerMode === "required"
      ? access.responseIssuer === c.issuer
      : access.responseIssuer === undefined);

  return matches ? { row, flow, native } : undefined;
});

export const live = (flow: M.OAuthConnectedPendingFlow, now: number) =>
  flow.context.issuedAtMillis <= now &&
  now < flow.context.expiresAtMillis &&
  flow.context.expiresAtMillis <= flow.context.requestBindingExpiresAtMillis &&
  flow.retentionUntilMillis >= flow.context.expiresAtMillis + flow.context.claimLifetimeMillis;

export const expected = (flow: M.OAuthConnectedPendingFlow) => ({
  moduleId: flow.context.moduleId,
  flowId: flow.context.flowId,
  commandId: flow.context.commandId,
  revision: flow.context.revision,
  intent: S.contextStorage.encode(flow.context),
  maximumAgeMillis: flow.context.maximumEvidenceAgeMillis,
  configuration: S.configuration(flow),
});

const retain = Effect.fn("oauthConnected.retain")(function* (
  mapping: S.Mapping,
  input:
    | ({ readonly _tag: "Prepare" } & Input<"prepare">)
    | ({ readonly _tag: "Issue" } & Input<"issue">),
) {
  const owner = yield* CurrentOAuthTransaction;

  const flow = snapshotOAuthSync(M.OAuthConnectedPendingFlow, input.flow),
    c = flow.context;

  const found = yield* S.current(mapping, c.revision.subjectId);

  if (found === undefined) return { _tag: "Rejected" } as const;
  if (input._tag === "Prepare") {
    if (
      input.authorization.moduleId !== c.moduleId ||
      !sameRevision(input.authorization.revision, c.revision) ||
      !sameRevision(found.revision, c.revision) ||
      (yield* S.useAuthority(mapping, input.authorization, "metadata")) === undefined
    )
      return { _tag: "Rejected" } as const;
  } else if (!(yield* S.action(mapping, found, input.authorization, "issue", expected(flow))))
    return { _tag: "Rejected" } as const;
  if (c.profile.revocation === "cohort") invariant(mapping.revocation.mode === "cohort");
  const client = yield* S.client(mapping, S.configuration(flow), true);

  invariant(client !== undefined);

  const now = yield* owner.now(mapping.clock),
    f = mapping.flow;

  if (!live(flow, now)) return { _tag: "Rejected" } as const;
  if (c.reconnect !== undefined) {
    const original = yield* S.readGrant(mapping, c.moduleId, c.reconnect.grantId, false);

    if (
      original === undefined ||
      original.context.subjectId !== c.revision.subjectId ||
      !sameTarget(c.reconnect, original.context)
    )
      return { _tag: "Rejected" } as const;
    owner.postconditions.push(
      sql`exists(select 1 from ${mapping.grant.table} where ${owner.exact(mapping.grant.table, original.row)})`,
    );
  }
  const key = { [f.moduleId]: c.moduleId, [f.flowId]: c.flowId };
  const prior = yield* owner.read(f.table, equal(f.table, key), { limit: 1 });

  const command = yield* owner.read(
    f.table,
    equal(f.table, { [f.moduleId]: c.moduleId, [f.commandId]: c.commandId }),
    { limit: 1 },
  );

  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${c.issuedAtMillis} and ${mapping.clock.engineNowMillis} < ${c.expiresAtMillis}`,
  );
  if (input._tag === "Issue") {
    const row = prior.rows[0];

    if (
      row === undefined ||
      command.rows[0] === undefined ||
      row[f.state] !== "Prepared" ||
      row[f.snapshot] !== S.flowStorage.encode(flow) ||
      command.rows[0][f.flowId] !== c.flowId
    )
      return { _tag: "Rejected" } as const;
    yield* owner.update(
      f.table,
      { ...key, [f.state]: "Prepared", [f.version]: row[f.version] },
      { [f.state]: "Pending", [f.version]: owner.marker },
    );
    owner.postconditions.push(
      sql`exists(select 1 from ${f.table} where ${equal(f.table, { ...key, [f.state]: "Pending", [f.version]: owner.marker })})`,
    );

    return { _tag: "Issued", flow } as const;
  }
  if (prior.rows.length || command.rows.length) return { _tag: "Rejected" } as const;

  const values = {
    ...f.encodeInsert({
      flow: snapshotOAuthSync(M.OAuthConnectedPendingFlow, flow),
      subjectId: S.nativeCopy(found.nativeId),
    }),
    ...key,
    [f.commandId]: c.commandId,
    [f.subjectId]: found.nativeId,
    [f.clientKey]: client.id,
    [f.cohortKey]: null,
    [f.state]: "Prepared",
    [f.version]: owner.marker,
    [f.stateDigest]: c.stateDigest,
    [f.snapshot]: S.flowStorage.encode(flow),
    [f.claimId]: null,
    [f.claimDigest]: null,
    [f.claimOrder]: null,
    [f.claimedAt]: null,
    [f.claimExpiresAt]: null,
    [f.expiresAt]: mapping.clock.encodeInstant(c.expiresAtMillis),
    [f.retentionUntil]: mapping.clock.encodeInstant(flow.retentionUntilMillis),
    [f.work]: "None",
    [f.custody]: null,
  };

  const inserted = yield* owner.insert(f.table, values, key, true);

  prior.rows = inserted.rows;
  command.rows = inserted.rows;
  if (inserted.rows[0]?.[f.version] !== owner.marker) return { _tag: "Rejected" } as const;

  return { _tag: "Issued", flow } as const;
});

export const prepare = (mapping: S.Mapping, input: Input<"prepare">) =>
  retain(mapping, { _tag: "Prepare", ...input });

export const issue = (mapping: S.Mapping, input: Input<"issue">) =>
  retain(mapping, { _tag: "Issue", ...input });

export const inspectPrepared = Effect.fn("oauthConnected.inspectPrepared")(function* (
  mapping: S.Mapping,
  access: M.OAuthConnectedPreparedAccess,
) {
  const owner = yield* CurrentOAuthTransaction;
  const found = yield* S.current(mapping, access.subjectId);

  if (found === undefined) return undefined;
  const f = mapping.flow;

  const read = yield* owner.read(
    f.table,
    equal(f.table, {
      [f.moduleId]: access.moduleId,
      [f.flowId]: access.flowId,
      [f.subjectId]: found.nativeId,
    }),
    { limit: 1 },
  );

  const row = read.rows[0];

  if (row === undefined || row[f.state] !== "Prepared" || row[f.snapshot] === null)
    return undefined;
  const flow = S.flowStorage.decode(row[f.snapshot]);
  const c = flow.context;

  invariant(
    row[f.moduleId] === c.moduleId &&
      row[f.flowId] === c.flowId &&
      row[f.commandId] === c.commandId &&
      mapping.subjectId.equals(found.nativeId, row[f.subjectId]) &&
      row[f.clientKey] === S.clientKey(S.configuration(flow)) &&
      row[f.stateDigest] === c.stateDigest &&
      mapping.clock.decodeInstant(row[f.expiresAt]) === c.expiresAtMillis &&
      mapping.clock.decodeInstant(row[f.retentionUntil]) === flow.retentionUntilMillis,
  );
  const now = yield* owner.now(mapping.clock);

  return c.moduleId === access.moduleId &&
    c.generation === access.generation &&
    c.flowId === access.flowId &&
    c.commandId === access.commandId &&
    c.revision.subjectId === access.subjectId &&
    sameRevision(found.revision, c.revision) &&
    c.requestBindingVerifier === access.requestBindingVerifier &&
    c.requestBindingExpiresAtMillis === access.requestBindingExpiresAtMillis &&
    live(flow, now)
    ? flow
    : undefined;
});

export const sameTarget = (target: M.OAuthConnectedTarget, context: M.OAuthConnectedTokenContext) =>
  target.grantId === context.grantId &&
  target.grantVersion === context.grantVersion &&
  target.tokenVersion === context.tokenVersion &&
  target.cohortGeneration === context.cohortGeneration &&
  sameIdentity(target.identity, context.identity) &&
  S.tokenContextStorage.encode({ ...context, configuration: target.configuration }) ===
    S.tokenContextStorage.encode(context);

export const capture = Effect.fn("oauthConnected.capture")(function* (
  mapping: S.Mapping,
  input: Input<"capture">,
) {
  const found = yield* S.current(mapping, input.subjectId);

  if (found === undefined) return undefined;
  if (input.grantId === undefined)
    return { revision: snapshotOAuthSync(OAuthAccountRevision, found.revision) };
  const grant = yield* S.readGrant(mapping, input.moduleId, input.grantId, false);

  if (grant === undefined || grant.context.subjectId !== input.subjectId) return undefined;

  return {
    revision: snapshotOAuthSync(OAuthAccountRevision, found.revision),
    target: snapshotOAuthSync(M.OAuthConnectedTarget, grant.context),
  };
});

export const preflight = Effect.fn("oauthConnected.preflight")(function* (
  mapping: S.Mapping,
  input: Input<"preflight">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const read = yield* pending(mapping, input);
  const now = yield* owner.now(mapping.clock);

  if (read === undefined || read.row[mapping.flow.state] !== "Pending" || !live(read.flow, now))
    return undefined;

  return read.flow;
});

export const claim = Effect.fn("oauthConnected.claim")(function* (
  mapping: S.Mapping,
  input: Input<"claim">,
) {
  const owner = yield* CurrentOAuthTransaction;

  const flow = snapshotOAuthSync(M.OAuthConnectedPendingFlow, input.flow),
    c = flow.context;

  const found = yield* S.current(mapping, c.revision.subjectId);

  if (
    found === undefined ||
    !(yield* S.action(mapping, found, input.authorization, "claim", expected(flow)))
  )
    return { _tag: "Rejected" } as const;
  const client = yield* S.client(mapping, S.configuration(flow), false);

  if (client === undefined) return { _tag: "Rejected" } as const;

  const read = yield* pending(mapping, input.access),
    now = yield* owner.now(mapping.clock),
    f = mapping.flow;

  if (
    read === undefined ||
    read.row[f.state] !== "Pending" ||
    S.flowStorage.encode(read.flow) !== S.flowStorage.encode(flow) ||
    !live(flow, now)
  )
    return { _tag: "Rejected" } as const;
  const expires = now + c.claimLifetimeMillis;

  invariant(Number.isSafeInteger(expires) && expires <= flow.retentionUntilMillis);
  yield* S.touchScope(mapping, client.scope);
  const order = yield* S.nextOrder(mapping, client);

  const claimed = snapshotOAuthSync(M.OAuthConnectedClaim, {
    flow,
    claimId: input.claimId,
    claimedAtMillis: now,
    claimExpiresAtMillis: expires,
    order: String(order),
  });

  yield* owner.update(
    f.table,
    {
      [f.moduleId]: c.moduleId,
      [f.flowId]: c.flowId,
      [f.state]: "Pending",
      [f.version]: read.row[f.version],
    },
    {
      [f.state]: "Claimed",
      [f.claimId]: claimed.claimId,
      [f.claimDigest]: digest(S.claimStorage.encode(claimed)),
      [f.claimOrder]: mapping.order.encode(order),
      [f.claimedAt]: mapping.clock.encodeInstant(now),
      [f.claimExpiresAt]: mapping.clock.encodeInstant(expires),
      [f.work]: "Unresolved",
      [f.version]: owner.marker,
    },
  );
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${now} and ${mapping.clock.engineNowMillis} < ${Math.min(c.expiresAtMillis, expires)}`,
  );

  return { _tag: "Claimed", claim: claimed } as const;
});

export const exact = Effect.fn("oauthConnected.exactClaim")(function* (
  mapping: S.Authority,
  claim: M.OAuthConnectedClaim,
) {
  const owner = yield* CurrentOAuthTransaction;

  const f = mapping.flow,
    c = claim.flow.context;

  const read = yield* owner.read(
    f.table,
    equal(f.table, { [f.moduleId]: c.moduleId, [f.flowId]: c.flowId }),
    { limit: 1 },
  );

  const row = read.rows[0];

  if (
    row === undefined ||
    row[f.work] !== "Unresolved" ||
    row[f.claimId] !== claim.claimId ||
    row[f.claimDigest] !== digest(S.claimStorage.encode(claim))
  )
    return undefined;
  const native = yield* mapping.subjectId.toNative(c.revision.subjectId);

  invariant(
    row[f.commandId] === c.commandId &&
      mapping.subjectId.equals(native, row[f.subjectId]) &&
      row[f.stateDigest] === c.stateDigest &&
      mapping.clock.decodeInstant(row[f.expiresAt]) === c.expiresAtMillis &&
      mapping.clock.decodeInstant(row[f.retentionUntil]) === claim.flow.retentionUntilMillis &&
      row[f.clientKey] === S.clientKey(S.configuration(claim.flow)) &&
      S.nativeOrder(mapping, row[f.claimOrder]) === S.orderNumber(claim.order) &&
      mapping.clock.decodeInstant(row[f.claimedAt]) === claim.claimedAtMillis &&
      mapping.clock.decodeInstant(row[f.claimExpiresAt]) === claim.claimExpiresAtMillis,
  );
  const now = yield* owner.now(mapping.clock);

  invariant(now >= claim.claimedAtMillis);

  return { row, now, active: row[f.state] === "Claimed" && now < claim.claimExpiresAtMillis };
});

export const terminal = Effect.fn("oauthConnected.terminal")(function* (
  mapping: S.Authority,
  claim: M.OAuthConnectedClaim,
  state: string,
  work: "Resolved" | "Unresolved",
  custody?: { cohort: string; sealed?: M.OAuthConnectedStoredGrant },
) {
  const owner = yield* CurrentOAuthTransaction;

  const f = mapping.flow,
    c = claim.flow.context;

  yield* owner.update(
    f.table,
    { [f.moduleId]: c.moduleId, [f.flowId]: c.flowId, [f.claimId]: claim.claimId },
    {
      [f.state]: state,
      [f.snapshot]: null,
      [f.work]: work,
      [f.cohortKey]: custody?.cohort ?? null,
      [f.custody]: custody?.sealed === undefined ? null : S.grantStorage.encode(custody.sealed),
      [f.version]: owner.marker,
    },
  );
});

export const inspectTuple = Effect.fn("oauthConnected.inspectTuple")(function* (
  mapping: S.Authority,
  identity: M.OAuthConnectedTokenContext["identity"],
) {
  const owner = yield* CurrentOAuthTransaction;

  const t = mapping.ownership.tuple,
    key = oauthIdentityKey(identity);

  const read = yield* owner.read(t.table, equal(t.table, { [t.identityKey]: key }), { limit: 1 });
  const row = read.rows[0];

  if (row !== undefined) {
    invariant(
      row[t.provider] === identity.provider &&
        row[t.issuer] === identity.issuer &&
        row[t.externalSubject] === identity.subject &&
        ["Owned", "Unowned", "Reserved"].includes(row[t.state]),
    );
  }
  if (mapping.ownership.mode === "separate") {
    const o = mapping.ownership.external;

    const external = yield* owner.read(o.table, equal(o.table, { [o.identityKey]: key }), {
      limit: 1,
    });

    if (row?.[t.state] === "Owned") {
      const e = external.rows[0];

      invariant(
        e !== undefined &&
          e[o.provider] === identity.provider &&
          e[o.issuer] === identity.issuer &&
          e[o.externalSubject] === identity.subject &&
          mapping.subjectId.equals(o.decodeSubjectId(copiedRow(e)), row[t.subjectId]),
      );
      const condition = sql`exists(select 1 from ${o.table} where ${both(equal(o.table, { [o.identityKey]: key }), o.ownedCondition)})`;

      invariant(yield* owner.check(condition));
      owner.postconditions.push(condition);
    } else invariant(external.rows.length === 0);
  }

  return { key, row };
});

export const inspectGrant = Effect.fn("oauthConnected.inspectGrant")(function* (
  mapping: S.Mapping,
  input: Input<"inspectGrant">,
) {
  const c = input.claim.flow.context;

  if (input.identity.provider !== c.provider || input.identity.issuer !== c.issuer)
    return { _tag: "Rejected" } as const;
  const found = yield* S.current(mapping, c.revision.subjectId);

  if (found === undefined || !sameRevision(found.revision, c.revision))
    return { _tag: "Rejected" } as const;
  const cl = yield* S.client(mapping, S.configuration(input.claim.flow), false);

  if (cl === undefined) return { _tag: "Rejected" } as const;

  const tuple = yield* inspectTuple(mapping, input.identity),
    t = mapping.ownership.tuple;

  if (
    tuple.row?.[t.state] === "Reserved" ||
    (tuple.row?.[t.state] === "Owned" &&
      !mapping.subjectId.equals(tuple.row[t.subjectId], found.nativeId))
  )
    return { _tag: "Conflict" } as const;
  const co = yield* S.cohort(mapping, cl.id, tuple.key, false);
  const claimed = yield* exact(mapping, input.claim);

  if (claimed === undefined) return { _tag: "Rejected" } as const;
  if (c.reconnect !== undefined && !sameIdentity(c.reconnect.identity, input.identity))
    return { _tag: "Conflict" } as const;

  return co.blocked || S.orderNumber(input.claim.order) <= co.cutoff || !claimed.active
    ? ({ _tag: "Quarantine", cohortGeneration: co.generation } as const)
    : ({ _tag: "Target", cohortGeneration: co.generation } as const);
});

/** Global tuple acquisition is shared with registration/accounts. */
export { acquireTuple, readTuple };
