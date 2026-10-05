import * as M from "@yielded/auth/OAuth";
import { snapshotOAuthSync } from "@yielded/auth/OAuth";
import { sql } from "drizzle-orm";
import { Effect } from "effect";

import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import { validMetadata } from "./oauth-connected-settlement";
import * as S from "./oauth-connected-state";
import { equal, CurrentOAuthTransaction } from "./oauth-owner";
import { invariant } from "./oauth-state";

export const locked = Effect.fn("oauthConnected.lockedGrant")(function* (
  mapping: S.Mapping,
  authorization: M.OAuthConnectedUseAuthorization,
  grantId: M.OAuthConnectedTokenContext["grantId"],
  purpose: "use" | "metadata",
) {
  const owner = yield* CurrentOAuthTransaction;
  const initial = yield* S.readGrant(mapping, authorization.moduleId, grantId, false);

  if (initial === undefined) return undefined;
  const found = yield* S.useAuthority(mapping, authorization, purpose, initial.context);

  if (found === undefined) return undefined;
  const client = yield* S.client(mapping, initial.context.configuration, false);

  if (client === undefined) return undefined;

  const tuple = yield* F.inspectTuple(mapping, initial.context.identity),
    t = mapping.ownership.tuple;

  if (
    tuple.row?.[t.state] !== "Owned" ||
    !mapping.subjectId.equals(tuple.row[t.subjectId], found.nativeId)
  )
    return undefined;
  const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

  invariant(cohort.row !== undefined);
  const grant = yield* S.readGrant(mapping, authorization.moduleId, grantId);

  if (grant === undefined || !C.sameContext(grant.context, initial.context)) return undefined;

  return { found, client, tuple, cohort, grant, now: yield* owner.now(mapping.clock) };
});

export const state = (
  mapping: S.Authority,
  read: NonNullable<Effect.Success<ReturnType<typeof locked>>>,
) => {
  const g = mapping.grant;

  if (
    read.cohort.blocked ||
    read.cohort.generation !== read.grant.context.cohortGeneration ||
    read.grant.row[g.activeIdentityKey] !== read.tuple.key
  )
    return "ReauthorizationRequired" as const;

  return read.grant.row[g.state] === "Refreshing"
    ? ("Busy" as const)
    : read.grant.row[g.state] === "Active"
      ? ("Active" as const)
      : ("ReauthorizationRequired" as const);
};

export const inspectAccess = Effect.fn("oauthConnected.inspectAccess")(function* (
  mapping: S.Mapping,
  input: F.Input<"inspectAccess">,
) {
  const read = yield* locked(mapping, input.authorization, input.grantId, "use");

  if (read === undefined || read.grant.context.configuration.profile.key !== input.profileKey)
    return { _tag: "Rejected" } as const;
  const status = state(mapping, read);

  if (status !== "Active") return { _tag: status };
  if (read.grant.sealed === undefined) return { _tag: "ReauthorizationRequired" } as const;

  return {
    _tag: "Target",
    grant: { context: read.grant.context, sealed: read.grant.sealed },
  } as const;
});

export const claimRefresh = Effect.fn("oauthConnected.claimRefresh")(function* (
  mapping: S.Mapping,
  input: F.Input<"claimRefresh">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const read = yield* locked(mapping, input.authorization, input.grant.context.grantId, "use");

  if (read === undefined) return { _tag: "Rejected" } as const;

  const status = state(mapping, read),
    g = mapping.grant;

  if (status !== "Active") return { _tag: status };

  const token = read.grant.context,
    p = token.configuration.profile;

  if (
    read.grant.sealed === undefined ||
    !C.sameGrant(input.grant, { context: token, sealed: read.grant.sealed })
  )
    return { _tag: "Rejected" } as const;
  if (read.grant.row[g.refreshWork] === "Unresolved") return { _tag: "Busy" } as const;
  if (
    p.refresh === "unsupported" ||
    token.metadata.refreshUseUntilMillis === undefined ||
    read.now >= token.metadata.refreshUseUntilMillis
  )
    return { _tag: "ReauthorizationRequired" } as const;
  if (read.now < token.metadata.useUntilMillis - p.refreshAheadMillis)
    return { _tag: "Busy" } as const;
  invariant(
    Number.isSafeInteger(input.lifetimeMillis) &&
      input.lifetimeMillis >= 1000 &&
      input.lifetimeMillis <= 120000 &&
      input.nextTokenVersion !== token.tokenVersion,
  );

  const expires = Math.min(
    read.now + input.lifetimeMillis,
    token.metadata.refreshUseUntilMillis,
    input.authorization.expiresAtMillis,
  );

  if (expires <= read.now) return { _tag: "Rejected" } as const;

  const claim = snapshotOAuthSync(M.OAuthConnectedRefreshClaim, {
    grant: input.grant,
    order: String(yield* S.nextOrder(mapping, read.client)),
    claimId: input.claimId,
    claimedAtMillis: read.now,
    claimExpiresAtMillis: expires,
    nextTokenVersion: input.nextTokenVersion,
  });

  yield* owner.update(
    g.table,
    { [g.moduleId]: token.moduleId, [g.grantId]: token.grantId },
    {
      [g.state]: "Refreshing",
      [g.refreshWork]: "Unresolved",
      [g.refreshClaim]: S.refreshStorage.encode(claim),
      [g.refreshClaimExpiresAt]: mapping.clock.encodeInstant(expires),
      [g.version]: owner.marker,
    },
  );
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${read.now} and ${mapping.clock.engineNowMillis} < ${expires}`,
  );

  return { _tag: "Claimed", claim } as const;
});

export const settleRefresh = Effect.fn("oauthConnected.settleRefresh")(function* (
  mapping: S.Mapping,
  input: F.Input<"settleRefresh">,
) {
  const owner = yield* CurrentOAuthTransaction;

  const old = input.claim.grant.context,
    g = mapping.grant;

  // Capture policy before suffix locks. Loss of authorization still permits only
  // cleanup of exact original work under its unchanged global owner.
  const authorized =
    (yield* S.useAuthority(mapping, input.authorization, "use", old)) !== undefined;

  const native = yield* mapping.subjectId.toNative(old.subjectId);
  const client = yield* S.client(mapping, old.configuration, false);

  if (client === undefined) return { _tag: "Rejected" } as const;

  const tuple = yield* F.inspectTuple(mapping, old.identity),
    t = mapping.ownership.tuple;

  if (tuple.row?.[t.state] !== "Owned" || !mapping.subjectId.equals(tuple.row[t.subjectId], native))
    return { _tag: "Rejected" } as const;
  const cohort = yield* S.cohort(mapping, client.id, tuple.key, false);

  invariant(cohort.row !== undefined);
  const read = yield* S.readGrant(mapping, old.moduleId, old.grantId);

  if (
    read === undefined ||
    read.row[g.refreshWork] !== "Unresolved" ||
    read.row[g.refreshClaim] !== S.refreshStorage.encode(input.claim)
  )
    return { _tag: "Rejected" } as const;
  invariant(
    mapping.clock.decodeInstant(read.row[g.refreshClaimExpiresAt]) ===
      input.claim.claimExpiresAtMillis,
  );
  const now = yield* owner.now(mapping.clock);

  invariant(now >= input.claim.claimedAtMillis);
  const outcome = input.outcome;
  const incoming = outcome._tag === "Refreshed" ? outcome.grant : undefined;

  if (incoming !== undefined)
    invariant(
      C.sameContext(
        {
          ...incoming.context,
          tokenVersion: old.tokenVersion,
          metadata: old.metadata,
          exchangeOrder: old.exchangeOrder,
        },
        old,
      ) &&
        incoming.context.tokenVersion === input.claim.nextTokenVersion &&
        incoming.context.exchangeOrder === input.claim.order &&
        validMetadata(incoming.context, now) &&
        incoming.context.metadata.obtainedAtMillis >= input.claim.claimedAtMillis &&
        (incoming.context.metadata.refreshUseUntilMillis === undefined ||
          (old.metadata.refreshUseUntilMillis !== undefined &&
            incoming.context.metadata.refreshUseUntilMillis <= old.metadata.refreshUseUntilMillis)),
    );

  const active =
    incoming !== undefined &&
    authorized &&
    read.row[g.state] === "Refreshing" &&
    C.sameContext(read.context, old) &&
    !cohort.blocked &&
    cohort.generation === old.cohortGeneration &&
    now < input.claim.claimExpiresAtMillis &&
    now < incoming.context.metadata.useUntilMillis;

  if (active) {
    yield* owner.update(
      g.table,
      { [g.moduleId]: old.moduleId, [g.grantId]: old.grantId },
      {
        [g.state]: "Active",
        [g.context]: S.tokenContextStorage.encode(incoming.context),
        [g.sealed]: S.sealedStorage.encode(incoming.sealed),
        [g.summary]: S.summaryStorage.encode(C.summary(incoming.context)),
        [g.tokenVersion]: incoming.context.tokenVersion,
        [g.refreshWork]: "Resolved",
        [g.version]: owner.marker,
      },
    );
    owner.postconditions.push(
      sql`${mapping.clock.engineNowMillis} >= ${now} and ${mapping.clock.engineNowMillis} < ${Math.min(input.claim.claimExpiresAtMillis, incoming.context.metadata.useUntilMillis)}`,
    );

    return { _tag: "Refreshed", grant: incoming } as const;
  }
  yield* C.fence(mapping, client, cohort);
  if (incoming !== undefined && outcome._tag === "Refreshed" && outcome.cleanup !== undefined) {
    yield* C.storeJob(mapping, outcome.cleanup, incoming.context, native, now);
    yield* owner.update(
      g.table,
      { [g.moduleId]: old.moduleId, [g.grantId]: old.grantId },
      {
        [g.refreshWork]: "Resolved",
        [g.revocationJobId]: outcome.cleanup.context.jobId,
        [g.sealed]: null,
        [g.version]: owner.marker,
      },
    );
  } else if (incoming !== undefined)
    yield* owner.update(
      g.table,
      { [g.moduleId]: old.moduleId, [g.grantId]: old.grantId },
      {
        [g.context]: S.tokenContextStorage.encode(incoming.context),
        [g.sealed]: S.sealedStorage.encode(incoming.sealed),
        [g.tokenVersion]: incoming.context.tokenVersion,
        [g.summary]: S.summaryStorage.encode(C.summary(incoming.context)),
        [g.version]: owner.marker,
      },
    );

  return { _tag: "ReauthorizationRequired" } as const;
});

export const admitUse = Effect.fn("oauthConnected.admitUse")(function* (
  mapping: S.Mapping,
  input: F.Input<"admitUse">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const read = yield* locked(mapping, input.authorization, input.grant.context.grantId, "use");

  if (read === undefined) return { _tag: "Rejected" } as const;
  const status = state(mapping, read);

  if (status !== "Active") return { _tag: status };
  const token = read.grant.context;

  if (
    read.grant.sealed === undefined ||
    !C.sameGrant(input.grant, { context: token, sealed: read.grant.sealed }) ||
    read.now >= token.metadata.useUntilMillis
  )
    return { _tag: "ReauthorizationRequired" } as const;
  invariant(
    Number.isSafeInteger(input.lifetimeMillis) &&
      input.lifetimeMillis >= 1 &&
      input.lifetimeMillis <= 30000,
  );

  const expires = Math.min(
      read.now + input.lifetimeMillis,
      input.authorization.expiresAtMillis,
      token.metadata.useUntilMillis,
    ),
    a = mapping.admission;

  const key = { [a.admissionId]: input.admissionId },
    prior = yield* owner.read(a.table, equal(a.table, key), { limit: 1 });

  if (prior.rows.length) return { _tag: "Rejected" } as const;

  const inserted = yield* owner.insert(
    a.table,
    {
      ...a.encodeInsert({
        admissionId: input.admissionId,
        grant: snapshotOAuthSync(M.OAuthConnectedStoredGrant, input.grant),
        authorization: snapshotOAuthSync(M.OAuthConnectedUseAuthorization, input.authorization),
        subjectId: S.nativeCopy(read.found.nativeId),
      }),
      ...key,
      [a.moduleId]: token.moduleId,
      [a.grantId]: token.grantId,
      [a.subjectId]: read.found.nativeId,
      [a.identityKey]: read.tuple.key,
      [a.clientKey]: read.client.id,
      [a.cohortKey]: read.cohort.id,
      [a.snapshot]: S.admissionStorage.encode({
        grant: input.grant,
        authorization: input.authorization,
      }),
      [a.admittedAt]: mapping.clock.encodeInstant(read.now),
      [a.expiresAt]: mapping.clock.encodeInstant(expires),
      [a.version]: owner.marker,
    },
    key,
  );

  prior.rows = inserted.rows;
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${read.now} and ${mapping.clock.engineNowMillis} < ${expires}`,
  );

  return {
    _tag: "Admitted",
    admissionId: input.admissionId,
    grantId: token.grantId,
    tokenVersion: token.tokenVersion,
    admittedAtMillis: read.now,
    expiresAtMillis: expires,
  } as const;
});
