import * as M from "@yielded/auth/OAuth";
import { snapshotOAuthSync } from "@yielded/auth/OAuth";
import { ne, sql } from "drizzle-orm";
import { Effect } from "effect";

import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import * as S from "./oauth-connected-state";
import { both, col, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { invariant, sameIdentity, oauthIdentityKey } from "./oauth-state";

export const validMetadata = (context: M.OAuthConnectedTokenContext, now: number) => {
  const m = context.metadata,
    p = context.configuration.profile;

  return (
    p.provider === context.identity.provider &&
    context.configuration.provider === context.identity.provider &&
    context.configuration.issuer === context.identity.issuer &&
    m.obtainedAtMillis <= now &&
    m.useUntilMillis > m.obtainedAtMillis &&
    m.useUntilMillis <= m.obtainedAtMillis + p.maximumAccessLifetimeMillis &&
    (m.accessExpiresAtMillis === undefined || m.useUntilMillis <= m.accessExpiresAtMillis) &&
    m.scopes.every((v) => p.scopes.includes(v)) &&
    m.resources.every((v) => p.resources.includes(v)) &&
    new Set(m.scopes).size === m.scopes.length &&
    new Set(m.resources).size === m.resources.length &&
    (m.refreshUseUntilMillis === undefined ||
      (p.retention === "access-and-refresh" &&
        p.maximumRefreshLifetimeMillis !== undefined &&
        m.refreshUseUntilMillis > m.obtainedAtMillis &&
        m.refreshUseUntilMillis <= m.obtainedAtMillis + p.maximumRefreshLifetimeMillis &&
        (m.refreshExpiresAtMillis === undefined ||
          m.refreshUseUntilMillis <= m.refreshExpiresAtMillis)))
  );
};

/** The only writer that activates or replaces a confirmed connected grant. */
export const activateGrant = Effect.fn("oauthConnected.activateGrant")(function* (
  mapping: S.Mapping,
  grant: M.OAuthConnectedStoredGrant,
  native: unknown,
  now: number,
  replacing: boolean,
) {
  const owner = yield* CurrentOAuthTransaction;
  const token = grant.context;
  const g = mapping.grant;
  const identityKey = oauthIdentityKey(token.identity);
  const clientKey = S.clientKey(token.configuration);
  const cohortKey = S.cohortKey(clientKey, identityKey);

  const values = {
    ...g.encodeInsert({
      grant: snapshotOAuthSync(M.OAuthConnectedStoredGrant, grant),
      subjectId: S.nativeCopy(native),
    }),
    [g.moduleId]: token.moduleId,
    [g.grantId]: token.grantId,
    [g.subjectId]: native,
    [g.identityKey]: identityKey,
    [g.activeIdentityKey]: identityKey,
    [g.clientKey]: clientKey,
    [g.cohortKey]: cohortKey,
    [g.profileKey]: token.configuration.profile.key,
    [g.grantVersion]: token.grantVersion,
    [g.tokenVersion]: token.tokenVersion,
    [g.cohortGeneration]: token.cohortGeneration,
    [g.state]: "Active",
    [g.version]: owner.marker,
    [g.context]: S.tokenContextStorage.encode(token),
    [g.sealed]: S.sealedStorage.encode(grant.sealed),
    [g.summary]: S.summaryStorage.encode(C.summary(token)),
    [g.revocationJobId]: null,
    [g.refreshWork]: "None",
    [g.refreshClaim]: null,
    [g.refreshClaimExpiresAt]: null,
    [g.retentionUntil]: mapping.clock.encodeInstant(
      S.retainedUntil(
        mapping,
        Math.max(now, token.metadata.useUntilMillis, token.metadata.refreshUseUntilMillis ?? 0),
      ),
    ),
  };

  if (!replacing) {
    yield* owner.insert(g.table, values, {
      [g.moduleId]: token.moduleId,
      [g.grantId]: token.grantId,
    });
  } else
    yield* owner.update(
      g.table,
      { [g.moduleId]: token.moduleId, [g.grantId]: token.grantId },
      values,
    );
});

export const settle = Effect.fn("oauthConnected.settle")(function* (
  mapping: S.Mapping,
  input: F.Input<"settle">,
) {
  const owner = yield* CurrentOAuthTransaction;

  const c = input.claim.flow.context,
    out = input.outcome;

  const found = yield* S.current(mapping, c.revision.subjectId);

  const authorized =
    found !== undefined &&
    (yield* S.action(mapping, found, input.authorization, "settle", F.expected(input.claim.flow)));

  const cl = yield* S.client(mapping, S.configuration(input.claim.flow), false);

  if (cl === undefined) return { _tag: "Rejected" } as const;
  if (out._tag !== "Verified" && out._tag !== "Quarantined") {
    const claimed = yield* F.exact(mapping, input.claim);

    if (claimed === undefined) return { _tag: "Rejected" } as const;
    const state = out._tag === "Unissued" ? "Rejected" : out._tag;

    yield* F.terminal(
      mapping,
      input.claim,
      state,
      out._tag === "Cancelled" || out._tag === "Unissued" ? "Resolved" : "Unresolved",
    );

    return { _tag: state } as
      | { readonly _tag: "Cancelled" }
      | { readonly _tag: "Rejected" }
      | { readonly _tag: "Conflict" }
      | { readonly _tag: "Ambiguous" };
  }

  const grant = snapshotOAuthSync(M.OAuthConnectedStoredGrant, out.grant),
    token = grant.context;

  invariant(
    token.moduleId === c.moduleId &&
      token.subjectId === c.revision.subjectId &&
      token.grantId === c.grantId &&
      token.identity.provider === c.provider &&
      token.identity.issuer === c.issuer &&
      S.clientKey(token.configuration) === cl.id &&
      S.tokenContextStorage.encode({
        ...token,
        configuration: S.configuration(input.claim.flow),
      }) === S.tokenContextStorage.encode(token),
  );
  const native = yield* mapping.subjectId.toNative(c.revision.subjectId);

  const tuple = yield* F.readTuple(mapping.ownership, token.identity),
    t = mapping.ownership.tuple;

  if (
    tuple.row[t.state] === "Reserved" ||
    (tuple.row[t.state] === "Owned" && !mapping.subjectId.equals(tuple.row[t.subjectId], native))
  ) {
    const claimed = yield* F.exact(mapping, input.claim);

    if (claimed !== undefined) yield* F.terminal(mapping, input.claim, "Conflict", "Unresolved");

    return { _tag: "Conflict" } as const;
  }
  const co = yield* S.cohort(mapping, cl.id, tuple.key, true);
  const original = yield* S.readGrant(mapping, c.moduleId, c.grantId);
  const g = mapping.grant;

  const other = yield* owner.read(
    g.table,
    both(
      equal(g.table, {
        [g.moduleId]: c.moduleId,
        [g.subjectId]: native,
        [g.profileKey]: c.profile.key,
        [g.activeIdentityKey]: tuple.key,
      }),
      ne(col(g.table, g.grantId), c.grantId),
    ),
    { limit: 1 },
  );

  const claimed = yield* F.exact(mapping, input.claim);

  if (claimed === undefined) return { _tag: "Rejected" } as const;
  invariant(
    token.exchangeOrder === input.claim.order &&
      validMetadata(token, claimed.now) &&
      token.metadata.obtainedAtMillis >= input.claim.claimedAtMillis,
  );
  const reconnect = c.reconnect;

  const targetOkay =
    reconnect === undefined
      ? original === undefined
      : original !== undefined &&
        F.sameTarget(reconnect, original.context) &&
        sameIdentity(reconnect.identity, token.identity) &&
        original.row[g.refreshWork] !== "Unresolved";

  const previousSafe = yield* C.noFormerOwner(mapping, tuple.key, cl.id, native);

  const active =
    out._tag === "Verified" &&
    authorized &&
    claimed.active &&
    c.profile.issuance === "active" &&
    token.metadata.useUntilMillis > claimed.now &&
    !co.blocked &&
    co.generation === token.cohortGeneration &&
    S.orderNumber(input.claim.order) > co.cutoff &&
    targetOkay &&
    other.rows.length === 0 &&
    previousSafe;

  if (!active) {
    // Foreign historical custody never authorizes a new remote operation.
    if (!previousSafe) {
      yield* F.terminal(mapping, input.claim, "Conflict", "Unresolved");

      return { _tag: "Conflict" } as const;
    }
    if (tuple.row[t.state] === "Unowned")
      yield* F.acquireTuple(mapping.ownership, token.identity, tuple.key, S.nativeCopy(native));
    yield* C.fence(mapping, cl, co);
    if (out.cleanup !== undefined) {
      yield* C.storeJob(mapping, out.cleanup, token, native, claimed.now);
      yield* F.terminal(mapping, input.claim, "Quarantined", "Resolved", { cohort: co.id });
    } else
      yield* F.terminal(mapping, input.claim, "Quarantined", "Unresolved", {
        cohort: co.id,
        sealed: grant,
      });

    return { _tag: targetOkay && other.rows.length === 0 ? "Rejected" : "Conflict" } as
      | { readonly _tag: "Rejected" }
      | { readonly _tag: "Conflict" };
  }
  if (tuple.row[t.state] === "Unowned")
    yield* F.acquireTuple(mapping.ownership, token.identity, tuple.key, S.nativeCopy(native));

  yield* activateGrant(mapping, grant, native, claimed.now, original !== undefined);
  yield* F.terminal(mapping, input.claim, "Connected", "Resolved", { cohort: co.id });
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${claimed.now} and ${mapping.clock.engineNowMillis} < ${Math.min(input.claim.claimExpiresAtMillis, token.metadata.useUntilMillis)}`,
  );

  return { _tag: "Connected", grant } as const;
});
