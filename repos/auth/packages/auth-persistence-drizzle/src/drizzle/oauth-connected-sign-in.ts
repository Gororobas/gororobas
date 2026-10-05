import * as M from "@yielded/auth/OAuth";
import { snapshotOAuthSync } from "@yielded/auth/OAuth";
import { sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import * as C from "./oauth-connected-custody";
import * as F from "./oauth-connected-flow";
import { activateGrant, validMetadata } from "./oauth-connected-settlement";
import * as S from "./oauth-connected-state";
import { exactClaim } from "./oauth-flow";
import { both, equal, CurrentOAuthTransaction } from "./oauth-owner";
import {
  digest,
  invariant,
  oauthIdentityKey,
  sameIdentity,
  sameRevision,
  storage,
  unavailable,
} from "./oauth-state";

const reservationStorage = storage(M.OAuthSignInAccessClaim);
const configurationStorage = storage(M.OAuthConnectedConfiguration);

/** Reservation rows share the connected-work ledger, but have no browser
 * snapshot or subject. They can never enter the authenticated connect flow. */
export const claimSignIn = Effect.fn("oauthConnected.claimSignIn")(function* (
  mapping: S.Mapping,
  input: F.Input<"claimSignIn">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const signIn = mapping.signIn;
  const encode = mapping.flow.encodeSignIn;

  if (signIn === undefined || encode === undefined) return yield* unavailable();
  const { claim, configuration } = input;
  const c = claim.flow.context;

  invariant(
    c.access !== undefined &&
      configurationStorage.encode(configuration) ===
        configurationStorage.encode({ ...c, profile: c.access }),
  );
  if (configuration.profile.revocation === "cohort")
    invariant(mapping.revocation.mode === "cohort");
  const client = yield* S.client(mapping, configuration, true);

  invariant(client !== undefined);
  const exact = yield* exactClaim({ ...mapping, flow: signIn.flow }, claim, "sign-in");

  if (exact === undefined) return yield* unavailable();
  const f = mapping.flow;
  const key = { [f.moduleId]: c.moduleId, [f.flowId]: c.flowId };
  const prior = yield* owner.read(f.table, equal(f.table, key), { limit: 1 });

  const command = yield* owner.read(
    f.table,
    equal(f.table, { [f.moduleId]: c.moduleId, [f.commandId]: c.commandId }),
    { limit: 1 },
  );

  if (prior.rows.length || command.rows.length) return yield* unavailable();
  yield* S.touchScope(mapping, client.scope);
  const order = yield* S.nextOrder(mapping, client);

  const reservation = snapshotOAuthSync(M.OAuthSignInAccessClaim, {
    claim,
    configuration,
    order: String(order),
  });

  const inserted = yield* owner.insert(
    f.table,
    {
      ...encode(reservation),
      ...key,
      [f.commandId]: c.commandId,
      [f.subjectId]: null,
      [f.clientKey]: client.id,
      [f.cohortKey]: null,
      [f.state]: "Claimed",
      [f.version]: owner.marker,
      [f.stateDigest]: c.stateDigest,
      [f.snapshot]: null,
      [f.claimId]: claim.claimId,
      [f.claimDigest]: digest(reservationStorage.encode(reservation)),
      [f.claimOrder]: mapping.order.encode(order),
      [f.claimedAt]: mapping.clock.encodeInstant(claim.claimedAtMillis),
      [f.claimExpiresAt]: mapping.clock.encodeInstant(claim.claimExpiresAtMillis),
      [f.expiresAt]: mapping.clock.encodeInstant(c.expiresAtMillis),
      [f.retentionUntil]: mapping.clock.encodeInstant(claim.flow.retentionUntilMillis),
      [f.work]: "Unresolved",
      [f.custody]: null,
    },
    key,
  );

  prior.rows = inserted.rows;
  command.rows = inserted.rows;

  return reservation;
});

const exact = Effect.fn("oauthConnected.exactSignIn")(function* (
  mapping: S.Mapping,
  reservation: M.OAuthSignInAccessClaim,
) {
  const owner = yield* CurrentOAuthTransaction;
  const f = mapping.flow;
  const c = reservation.claim.flow.context;
  const key = { [f.moduleId]: c.moduleId, [f.flowId]: c.flowId };
  const read = yield* owner.read(f.table, equal(f.table, key), { limit: 1 });
  const row = read.rows[0];

  if (
    row === undefined ||
    row[f.work] !== "Unresolved" ||
    row[f.claimId] !== reservation.claim.claimId ||
    row[f.claimDigest] !== digest(reservationStorage.encode(reservation))
  )
    return undefined;
  invariant(
    row[f.subjectId] === null &&
      row[f.commandId] === c.commandId &&
      row[f.clientKey] === S.clientKey(reservation.configuration) &&
      S.nativeOrder(mapping, row[f.claimOrder]) === S.orderNumber(reservation.order),
  );
  const now = yield* owner.now(mapping.clock);

  invariant(now >= reservation.claim.claimedAtMillis);

  return {
    key,
    row,
    now,
    active: row[f.state] === "Claimed" && now < reservation.claim.claimExpiresAtMillis,
  };
});

const credential = Effect.fn("oauthConnected.signInCredential")(function* (
  mapping: S.Mapping,
  reservation: M.OAuthSignInAccessClaim,
  input: M.OAuthCredentialSnapshot,
) {
  const owner = yield* CurrentOAuthTransaction;
  const signIn = mapping.signIn;

  if (signIn === undefined) return undefined;
  const context = reservation.claim.flow.context;

  if (
    input.moduleId !== context.moduleId ||
    input.identity.provider !== context.provider ||
    input.identity.issuer !== context.issuer
  )
    return undefined;
  const found = yield* S.current(mapping, input.revision.subjectId);

  if (found === undefined || !sameRevision(found.revision, input.revision)) return undefined;
  const c = signIn.credential;

  const loginWhere = both(
    equal(c.table, {
      [c.moduleId]: context.moduleId,
      [c.credentialId]: input.credentialId,
      [c.subjectId]: found.nativeId,
      [c.identityKey]: oauthIdentityKey(input.identity),
      [c.credentialRevision]: input.credentialRevision,
    }),
    c.activeCondition,
  );

  const login = yield* owner.read(c.table, loginWhere, { limit: 1 });

  if (login.rows.length !== 1 || !c.isActiveStatus(login.rows[0]![c.status])) return undefined;
  const f = signIn.flow;

  const verifiedWhere = equal(f.table, {
    [f.moduleId]: context.moduleId,
    [f.flowId]: context.flowId,
    [f.state]: "Verified",
    [f.claimId]: reservation.claim.claimId,
    [f.stateDigest]: context.stateDigest,
    [f.claimedAt]: mapping.clock.encodeInstant(reservation.claim.claimedAtMillis),
    [f.claimExpiresAt]: mapping.clock.encodeInstant(reservation.claim.claimExpiresAtMillis),
  });

  const verified = yield* owner.read(f.table, verifiedWhere, { limit: 1 });

  if (verified.rows.length !== 1) return undefined;
  owner.postconditions.push(
    sql`exists(select 1 from ${c.table} where ${loginWhere})`,
    sql`exists(select 1 from ${f.table} where ${verifiedWhere})`,
  );
  if (
    !(yield* S.policy(mapping, {
      kind: "sign-in",
      subjectId: found.nativeId,
      revision: found.revision,
      credential: snapshotOAuthSync(M.OAuthCredentialSnapshot, input),
      configuration: reservation.configuration,
    }))
  )
    return undefined;

  return found;
});

const slot = Effect.fn("oauthConnected.signInSlot")(function* (
  mapping: S.Mapping,
  moduleId: string,
  native: unknown,
  identityKey: string,
  profileKey: string,
) {
  const owner = yield* CurrentOAuthTransaction;
  const g = mapping.grant;

  const rows = yield* owner.read(
    g.table,
    equal(g.table, {
      [g.moduleId]: moduleId,
      [g.subjectId]: native,
      [g.profileKey]: profileKey,
      [g.activeIdentityKey]: identityKey,
    }),
    { limit: 1, admissionOnly: true },
  );

  const row = rows.rows[0];

  if (row === undefined) return undefined;

  return yield* S.readGrant(
    mapping,
    moduleId,
    yield* Schema.decodeUnknownEffect(M.OAuthGrantId)(row[g.grantId]).pipe(
      Effect.mapError(unavailable),
    ),
  );
});

/** Orders belong to one client registration. Moving a profile to another client
 * requires a newer profile generation; retired clients cannot replace it later. */
const canReplace = (
  reservation: M.OAuthSignInAccessClaim,
  previous: M.OAuthConnectedTokenContext,
) => {
  const generation = reservation.configuration.profile.generation;
  const oldGeneration = previous.configuration.profile.generation;

  return S.clientKey(reservation.configuration) === S.clientKey(previous.configuration)
    ? generation >= oldGeneration &&
        S.orderNumber(reservation.order) > S.orderNumber(previous.exchangeOrder)
    : generation > oldGeneration;
};

export const inspectSignIn = Effect.fn("oauthConnected.inspectSignIn")(function* (
  mapping: S.Mapping,
  input: F.Input<"inspectSignIn">,
) {
  const found = yield* credential(mapping, input.reservation, input.credential);

  if (found === undefined) return { _tag: "Rejected" } as const;
  const r = input.reservation;
  const cl = yield* S.client(mapping, r.configuration, false);

  if (cl === undefined) return { _tag: "Rejected" } as const;
  const tuple = yield* F.inspectTuple(mapping, input.credential.identity);
  const t = mapping.ownership.tuple;

  if (
    tuple.row?.[t.state] !== "Owned" ||
    !mapping.subjectId.equals(tuple.row[t.subjectId], found.nativeId)
  )
    return { _tag: "Rejected" } as const;
  const co = yield* S.cohort(mapping, cl.id, tuple.key, false);

  const previous = yield* slot(
    mapping,
    r.claim.flow.context.moduleId,
    found.nativeId,
    tuple.key,
    r.configuration.profile.key,
  );

  const held = yield* exact(mapping, r);

  if (held === undefined) return { _tag: "Rejected" } as const;

  const quarantine =
    !held.active ||
    co.blocked ||
    S.orderNumber(r.order) <= co.cutoff ||
    previous?.row[mapping.grant.refreshWork] === "Unresolved" ||
    (previous !== undefined && !canReplace(r, previous.context));

  return snapshotOAuthSync(M.OAuthSignInAccessInspection, {
    _tag: quarantine ? "Quarantine" : "Target",
    grantId: previous?.context.grantId ?? input.grantId,
    cohortGeneration: co.generation,
    ...(previous === undefined
      ? {}
      : { previous: snapshotOAuthSync(M.OAuthConnectedTarget, previous.context) }),
  });
});

export const settleSignIn = Effect.fn("oauthConnected.settleSignIn")(function* (
  mapping: S.Mapping,
  input: F.Input<"settleSignIn">,
) {
  const owner = yield* CurrentOAuthTransaction;
  const r = input.reservation;
  const out = input.outcome;
  const found = out._tag === "Verified" ? yield* credential(mapping, r, out.credential) : undefined;
  const cl = yield* S.client(mapping, r.configuration, false);

  if (cl === undefined) return { _tag: "Rejected" } as const;
  const f = mapping.flow;

  if (out._tag !== "Verified") {
    const held = yield* exact(mapping, r);

    if (held === undefined) return { _tag: "Rejected" } as const;
    // Unissued means the provider definitely returned no token. Resolve that
    // reservation. A Rejected outcome can follow a real exchange, so it stays open.
    const state = out._tag === "Unissued" ? "Rejected" : out._tag;

    yield* owner.update(f.table, held.key, {
      [f.state]: state,
      [f.work]: out._tag === "Cancelled" || out._tag === "Unissued" ? "Resolved" : "Unresolved",
      [f.version]: owner.marker,
    });

    return { _tag: state };
  }
  const token = out.grant.context;

  invariant(
    token.moduleId === r.claim.flow.context.moduleId &&
      token.subjectId === out.credential.revision.subjectId &&
      sameIdentity(token.identity, out.credential.identity) &&
      configurationStorage.encode(token.configuration) ===
        configurationStorage.encode(r.configuration),
  );
  const native = yield* mapping.subjectId.toNative(token.subjectId);
  const tuple = yield* F.readTuple(mapping.ownership, token.identity);
  const t = mapping.ownership.tuple;

  const owned =
    tuple.row[t.state] === "Owned" && mapping.subjectId.equals(tuple.row[t.subjectId], native);

  const co = yield* S.cohort(mapping, cl.id, tuple.key, true);
  const previous = yield* S.readGrant(mapping, token.moduleId, token.grantId);

  const activeSlot = yield* slot(
    mapping,
    token.moduleId,
    native,
    tuple.key,
    token.configuration.profile.key,
  );

  const held = yield* exact(mapping, r);

  if (held === undefined) return { _tag: "Rejected" } as const;
  invariant(
    token.exchangeOrder === r.order &&
      validMetadata(token, held.now) &&
      token.metadata.obtainedAtMillis >= r.claim.claimedAtMillis,
  );

  const target =
    out.previous === undefined
      ? previous === undefined
      : previous !== undefined &&
        F.sameTarget(out.previous, previous.context) &&
        sameIdentity(previous.context.identity, token.identity) &&
        previous.row[mapping.grant.refreshWork] !== "Unresolved" &&
        canReplace(r, previous.context);

  const previousSafe = yield* C.noFormerOwner(mapping, tuple.key, cl.id, native);

  if (!owned || !previousSafe) {
    yield* owner.update(f.table, held.key, { [f.state]: "Conflict", [f.version]: owner.marker });

    return { _tag: "Conflict" } as const;
  }
  if (
    out.quarantine ||
    found === undefined ||
    !held.active ||
    !target ||
    (activeSlot !== undefined && activeSlot.context.grantId !== token.grantId) ||
    co.blocked ||
    S.orderNumber(r.order) <= co.cutoff ||
    co.generation !== token.cohortGeneration ||
    token.metadata.useUntilMillis <= held.now ||
    token.configuration.profile.issuance !== "active"
  ) {
    if (token.configuration.profile.revocation === "unsupported") {
      // No remote cleanup can run for this profile. Discard the losing material;
      // it must neither replace nor revoke the currently installed grant.
      yield* owner.update(f.table, held.key, {
        [f.state]: "Rejected",
        [f.work]: "Resolved",
        [f.subjectId]: native,
        [f.cohortKey]: co.id,
        [f.custody]: null,
        [f.version]: owner.marker,
      });
    } else {
      yield* C.fence(mapping, cl, co);
      if (out.cleanup === undefined) return yield* unavailable();
      yield* C.storeJob(mapping, out.cleanup, token, native, held.now);
      yield* owner.update(f.table, held.key, {
        [f.state]: "Quarantined",
        [f.work]: "Resolved",
        [f.subjectId]: native,
        [f.cohortKey]: co.id,
        [f.custody]: null,
        [f.version]: owner.marker,
      });
    }

    return { _tag: "Rejected" } as const;
  }
  yield* activateGrant(mapping, out.grant, native, held.now, previous !== undefined);
  yield* owner.update(f.table, held.key, {
    [f.state]: "Connected",
    [f.work]: "Resolved",
    [f.subjectId]: native,
    [f.cohortKey]: co.id,
    [f.custody]: null,
    [f.version]: owner.marker,
  });
  owner.postconditions.push(
    sql`${mapping.clock.engineNowMillis} >= ${held.now} and ${mapping.clock.engineNowMillis} < ${Math.min(r.claim.claimExpiresAtMillis, token.metadata.useUntilMillis)}`,
  );

  return { _tag: "Connected", grant: out.grant } as const;
});
