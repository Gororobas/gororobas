import {
  type OAuthLinkClaim,
  type OAuthClaim,
  OAuthCleanupInput,
  OAuthCredentialSnapshot,
  OAuthPendingFlow,
  OAuthModuleId,
  type OAuthVerifiedExternalIdentity,
  OAuthAccountRevision,
  OAuthLinkPendingFlow,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
/* oxlint-disable no-explicit-any -- private kernel shared by concrete driver mappings. */
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { SubjectIdCodec } from "./model";
import { CurrentOAuthTransaction, type Row, both, col, copiedRow, equal } from "./oauth-owner";
import { invariant, oauthIdentityKey, storage } from "./oauth-state";

export const pendingStorage = storage(OAuthPendingFlow);
export const linkStorage = storage(OAuthLinkPendingFlow);
export const credentialStorage = storage(OAuthCredentialSnapshot);
export const revisionStorage = storage(OAuthAccountRevision);
export type Flow = typeof OAuthPendingFlow.Type | typeof OAuthLinkPendingFlow.Type;
export type Claim = typeof OAuthClaim.Type | typeof OAuthLinkClaim.Type;

export const flowKey = (mapping: any, context: Flow["context"]) => ({
  [mapping.moduleId]: context.moduleId,
  [mapping.flowId]: context.flowId,
});

export const flowStorage = (purpose: "sign-in" | "link") =>
  purpose === "link" ? linkStorage : pendingStorage;

const instant = (mapping: any, value: unknown): number => {
  const millis = mapping.clock.decodeInstant(value);

  invariant(Number.isSafeInteger(millis) && millis >= 0);

  return millis;
};

export const readFlow = (
  mapping: any,
  input: { readonly moduleId: string; readonly flowId: string },
  purpose: "sign-in" | "link",
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const f = mapping.flow;

      const observation = yield* owner.read(
        f.table,
        equal(f.table, {
          [f.moduleId]: input.moduleId,
          [f.flowId]: input.flowId,
        }),
        { limit: 1 },
      );

      const row = observation.rows[0];

      if (row === undefined || row[f.purpose] !== purpose || row[f.snapshot] === null)
        return { observation };
      const flow = flowStorage(purpose).decode(row[f.snapshot]) as Flow;
      const c = flow.context;

      invariant(
        row[f.moduleId] === c.moduleId &&
          row[f.flowId] === c.flowId &&
          row[f.commandId] === c.commandId &&
          row[f.generation] === c.generation &&
          row[f.stateDigest] === c.stateDigest &&
          row[f.binderVerifier] === c.requestBindingVerifier &&
          instant(mapping, row[f.binderExpiresAt]) === c.requestBindingExpiresAtMillis &&
          instant(mapping, row[f.issuedAt]) === c.issuedAtMillis &&
          instant(mapping, row[f.expiresAt]) === c.expiresAtMillis &&
          instant(mapping, row[f.retentionUntil]) === flow.retentionUntilMillis,
      );

      return { observation, row, flow };
    }),
  );

export const liveFlow = (flow: Flow, now: number) =>
  flow.context.issuedAtMillis <= now &&
  now < flow.context.expiresAtMillis &&
  flow.context.expiresAtMillis <= flow.context.requestBindingExpiresAtMillis &&
  flow.retentionUntilMillis >= flow.context.expiresAtMillis + flow.context.claimLifetimeMillis;

export const issueFlow = (mapping: any, original: Flow, purpose: "sign-in" | "link") =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const codec = flowStorage(purpose);
      const flow = codec.decode(codec.encode(original as never)) as Flow;

      const f = mapping.flow,
        c = flow.context,
        now = yield* owner.now(mapping.clock);

      if (!liveFlow(flow, now)) return { _tag: "Rejected" } as const;
      const byFlow = yield* owner.read(f.table, equal(f.table, flowKey(f, c)), { limit: 1 });

      const byCommand = yield* owner.read(
        f.table,
        equal(f.table, {
          [f.moduleId]: c.moduleId,
          [f.commandId]: c.commandId,
        }),
        { limit: 1 },
      );

      if (byFlow.rows.length || byCommand.rows.length) return { _tag: "Rejected" } as const;
      const encode = mapping.clock.encodeInstant;

      const values = {
        ...f.encodeInsert({ moduleId: c.moduleId, flowId: c.flowId, purpose }),
        ...flowKey(f, c),
        [f.commandId]: c.commandId,
        [f.purpose]: purpose,
        [f.generation]: c.generation,
        [f.state]: "Pending",
        [f.version]: owner.marker,
        [f.stateDigest]: c.stateDigest,
        [f.binderVerifier]: c.requestBindingVerifier,
        [f.binderExpiresAt]: encode(c.requestBindingExpiresAtMillis),
        [f.snapshot]: codec.encode(flow as never),
        [f.issuedAt]: encode(c.issuedAtMillis),
        [f.expiresAt]: encode(c.expiresAtMillis),
        [f.claimId]: null,
        [f.claimedAt]: null,
        [f.claimExpiresAt]: null,
        [f.retentionUntil]: encode(flow.retentionUntilMillis),
      };

      const inserted = yield* owner.insert(f.table, values, flowKey(f, c), true);

      byFlow.rows = inserted.rows;
      byCommand.rows = inserted.rows;
      if (inserted.rows[0]?.[f.version] !== owner.marker) return { _tag: "Rejected" } as const;
      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${c.issuedAtMillis}
      and ${mapping.clock.engineNowMillis} < ${c.expiresAtMillis}`);

      return { _tag: "Issued", flow } as const;
    }),
  );

export const matchesAccess = (flow: Flow, input: any) => {
  const c = flow.context;

  return (
    c.moduleId === input.moduleId &&
    c.generation === input.generation &&
    c.flowId === input.flowId &&
    c.provider === input.provider &&
    c.callbackId === input.callbackId &&
    c.stateDigest === input.stateDigest &&
    c.requestBindingVerifier === input.requestBindingVerifier &&
    c.requestBindingExpiresAtMillis === input.requestBindingExpiresAtMillis &&
    (c.responseIssuerMode === "required"
      ? input.responseIssuer === c.issuer
      : input.responseIssuer === undefined)
  );
};

export const claimFlow = (mapping: any, inspected: { row: Row; flow: Flow }, claimId: string) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const now = yield* owner.now(mapping.clock),
        flow = inspected.flow,
        c = flow.context;

      if (inspected.row[mapping.flow.state] !== "Pending" || !liveFlow(flow, now)) return undefined;

      const claim = {
        flow,
        claimId,
        claimedAtMillis: now,
        claimExpiresAtMillis: now + c.claimLifetimeMillis,
      };

      invariant(
        Number.isSafeInteger(claim.claimExpiresAtMillis) &&
          claim.claimExpiresAtMillis <= flow.retentionUntilMillis,
      );

      const f = mapping.flow,
        encode = mapping.clock.encodeInstant;

      yield* owner.update(f.table, flowKey(f, c), {
        [f.state]: "Claimed",
        [f.version]: owner.marker,
        [f.claimId]: claimId,
        [f.claimedAt]: encode(now),
        [f.claimExpiresAt]: encode(claim.claimExpiresAtMillis),
      });
      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${now} and
      ${mapping.clock.engineNowMillis} < ${Math.min(c.expiresAtMillis, claim.claimExpiresAtMillis)}`);

      return claim;
    }),
  );

export const exactClaim = (mapping: any, claim: Claim, purpose: "sign-in" | "link") =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const read = yield* readFlow(mapping, claim.flow.context, purpose);

      const now = yield* owner.now(mapping.clock),
        f = mapping.flow,
        row = read.row;

      if (
        row === undefined ||
        read.flow === undefined ||
        row[f.state] !== "Claimed" ||
        row[f.claimId] !== claim.claimId ||
        instant(mapping, row[f.claimedAt]) !== claim.claimedAtMillis ||
        instant(mapping, row[f.claimExpiresAt]) !== claim.claimExpiresAtMillis ||
        claim.claimExpiresAtMillis !==
          claim.claimedAtMillis + claim.flow.context.claimLifetimeMillis ||
        now < claim.claimedAtMillis ||
        now >= claim.claimExpiresAtMillis ||
        flowStorage(purpose).encode(read.flow as never) !==
          flowStorage(purpose).encode(claim.flow as never)
      )
        return undefined;
      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${claim.claimedAtMillis} and
      ${mapping.clock.engineNowMillis} < ${claim.claimExpiresAtMillis}`);

      return { ...read, now };
    }),
  );

export const terminalFlow = (mapping: any, flow: Flow, state: string) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    owner.update(mapping.flow.table, flowKey(mapping.flow, flow.context), {
      [mapping.flow.state]: state,
      [mapping.flow.version]: owner.marker,
      [mapping.flow.snapshot]: null,
    }),
  );

/** Subject precedes credentials; the complete active credential vector is retained. */
export const currentSubject = (mapping: any, nativeId: unknown) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const s = mapping.subject,
        a = mapping.authority;

      const subject = yield* owner.read(s.table, eq(col(s.table, s.id), nativeId), { limit: 1 });
      const row = subject.rows[0];
      const subjectActive = sql`exists(select 1 from ${s.table} where ${both(eq(col(s.table, s.id), nativeId), s.activeCondition)})`;

      if (
        row === undefined ||
        !s.isActiveStatus(row[s.status]) ||
        !(yield* owner.check(subjectActive))
      )
        return undefined;
      owner.postconditions.push(subjectActive);

      const authorities = yield* owner.read(a.table, eq(col(a.table, a.subjectId), nativeId), {
        orderBy: col(a.table, a.credentialId),
      });

      const active = authorities.rows.filter((item) => a.isActiveStatus(item[a.status]));

      const activeGuard = sql`(select count(*) from ${a.table} where ${both(
        eq(col(a.table, a.subjectId), nativeId),
        a.activeCondition,
      )}) = ${active.length}`;

      invariant(yield* owner.check(activeGuard));
      owner.postconditions.push(
        () => sql`(select count(*) from ${a.table} where ${both(
          eq(col(a.table, a.subjectId), nativeId),
          a.activeCondition,
        )}) =
      ${authorities.rows.filter((item) => a.isActiveStatus(item[a.status])).length}`,
      );

      const credentials = active
        .map((item) => ({ credentialId: item[a.credentialId], revision: item[a.revision] }))
        .sort((left, right) => left.credentialId.localeCompare(right.credentialId));

      invariant(new Set(credentials.map((item) => item.credentialId)).size === credentials.length);
      const subjectId = yield* (mapping.subjectId as SubjectIdCodec<unknown>).toSubject(nativeId);

      const revision = snapshotOAuthSync(OAuthAccountRevision, {
        subjectId,
        securityRevision: row[s.securityRevision],
        credentials,
      });

      return { subject, row, authorities, revision, nativeId };
    }),
  );

export const discoverOwned = (mapping: any, identity: OAuthVerifiedExternalIdentity["identity"]) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const key = oauthIdentityKey(identity),
        o = mapping.ownership;

      const where = both(eq(col(o.table, o.identityKey), key), o.ownedCondition);

      const discovered = yield* owner.read(o.table, where, {
        lock: false,
        observe: false,
        limit: 1,
      });

      const row = discovered.rows[0];

      if (row === undefined) return { key };
      invariant(
        row[o.provider] === identity.provider &&
          row[o.issuer] === identity.issuer &&
          row[o.externalSubject] === identity.subject,
      );
      const nativeId = o.decodeSubjectId(copiedRow(row));
      const current = yield* currentSubject(mapping, nativeId);
      const owned = yield* owner.read(o.table, where, { limit: 1 });
      const final = owned.rows[0];

      if (
        current === undefined ||
        final === undefined ||
        !mapping.subjectId.equals(nativeId, o.decodeSubjectId(copiedRow(final)))
      )
        return { key, owned: true as const };
      invariant(
        final[o.provider] === identity.provider &&
          final[o.issuer] === identity.issuer &&
          final[o.externalSubject] === identity.subject,
      );
      const c = mapping.credential;

      const credential = yield* owner.read(c.table, eq(col(c.table, c.identityKey), key), {
        limit: 1,
      });

      let login: Row | undefined = credential.rows[0];

      if (login !== undefined && c.isActiveStatus(login[c.status])) {
        const usable = sql`exists(select 1 from ${c.table} where ${both(
          eq(col(c.table, c.identityKey), key),
          c.activeCondition,
        )})`;

        if (yield* owner.check(usable)) owner.postconditions.push(usable);
        else login = undefined;
      }

      return { key, owned: true as const, current, credential, login };
    }),
  );

export const resolveOwned = (
  mapping: any,
  moduleId: string,
  identity: OAuthVerifiedExternalIdentity["identity"],
  found: any,
) => {
  const login = found.login,
    current = found.current,
    c = mapping.credential;

  if (
    login === undefined ||
    current === undefined ||
    login[c.moduleId] !== moduleId ||
    !mapping.subjectId.equals(login[c.subjectId], current.nativeId) ||
    !c.isActiveStatus(login[c.status])
  )
    return undefined;

  const shared = current.revision.credentials.find(
    (item: any) => item.credentialId === login[c.credentialId],
  );

  if (shared?.revision !== login[c.credentialRevision]) return undefined;

  return snapshotOAuthSync(OAuthCredentialSnapshot, {
    moduleId: OAuthModuleId.make(moduleId),
    identity,
    credentialId: login[c.credentialId],
    credentialRevision: login[c.credentialRevision],
    revision: current.revision,
  });
};

export const cleanupFlows = (
  mapping: any,
  original: typeof OAuthCleanupInput.Type,
  purpose: "sign-in" | "link",
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const input = snapshotOAuthSync(OAuthCleanupInput, original),
        f = mapping.flow;

      const now = yield* owner.now(mapping.clock);

      const candidates = yield* owner.read(
        f.table,
        both(
          eq(col(f.table, f.moduleId), input.moduleId),
          eq(col(f.table, f.purpose), purpose),
          sql`((${col(f.table, f.state)} = 'Pending' and ${col(f.table, f.expiresAt)} <= ${mapping.clock.encodeInstant(now)})
      or (${col(f.table, f.state)} = 'Claimed' and ${col(f.table, f.claimExpiresAt)} <= ${mapping.clock.encodeInstant(now)})
      or (${col(f.table, f.state)} not in ('Pending','Claimed') and ${col(f.table, f.retentionUntil)} < ${mapping.clock.encodeInstant(now)}))`,
        ),
        { limit: input.limit, observe: false, takeOnly: true },
      );

      let terminalized = 0,
        removed = 0;

      for (const candidate of candidates.rows) {
        const key = { [f.moduleId]: candidate[f.moduleId], [f.flowId]: candidate[f.flowId] };
        const current = yield* owner.read(f.table, equal(f.table, key), { limit: 1 });

        if (current.rows.length !== 1) continue;

        const row = current.rows[0]!,
          transitionNow = yield* owner.now(mapping.clock);

        const state = row[f.state];

        if (state === "Pending" || state === "Claimed") {
          const deadline = instant(
            mapping,
            row[state === "Pending" ? f.expiresAt : f.claimExpiresAt],
          );

          if (transitionNow < deadline) continue;
          yield* owner.update(f.table, key, {
            [f.state]: state === "Pending" ? "Rejected" : "Ambiguous",
            [f.snapshot]: null,
            [f.version]: owner.marker,
          });
          owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${deadline}`);
          terminalized++;
        } else {
          const retainUntil = Math.max(
            instant(mapping, row[f.retentionUntil]),
            row[f.claimExpiresAt] === null ? 0 : instant(mapping, row[f.claimExpiresAt]),
          );

          if (transitionNow <= retainUntil) continue;
          yield* owner.remove(f.table, key);
          owner.postconditions.push(sql`${mapping.clock.engineNowMillis} > ${retainUntil}`);
          removed++;
        }
      }

      return { terminalized, removed, hasMore: candidates.rows.length === input.limit };
    }),
  );
