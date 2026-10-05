import {
  OAuthRegistrationAccess,
  OAuthRegistrationDecision,
  OAuthRegistrationFingerprint,
  OAuthRegistrationInspection,
  OAuthRegistrationIntent,
  OAuthCredentialSnapshot,
  OAuthDisplayProfile,
  OAuthSignInTransactionContext,
  type OAuthExternalIdentity,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import type { SecurityRevision } from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- private owner kernel preserves Registration at the exported constructor. */
import { eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { PersistenceMappingError, SubjectIdCodec } from "./model";
import { discoverOwned, exactClaim, resolveOwned, terminalFlow } from "./oauth-flow";
import type { OAuthRegistrationBase } from "./oauth-model";
import { both, col, equal, matchesNativeRow, CurrentOAuthTransaction } from "./oauth-owner";
import { invariant, oauthIdentityKey, sameIdentity, storage } from "./oauth-state";

export const intentStorage = storage(OAuthRegistrationIntent);
const decisionStorage = storage(OAuthRegistrationDecision);
const contextStorage = storage(OAuthSignInTransactionContext);
const profileStorage = storage(Schema.NullOr(OAuthDisplayProfile));

const reservationStorage = storage(
  Schema.Struct({
    moduleId: Schema.String,
    reference: Schema.String,
    commandId: Schema.String,
    fingerprint: Schema.String,
    provisioningIdentity: Schema.String,
  }),
);

export const readTuple = (ownership: any, identity: typeof OAuthExternalIdentity.Type) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const t = ownership.tuple,
        key = oauthIdentityKey(identity);

      const where = { [t.identityKey]: key };
      const observed = yield* owner.read(t.table, equal(t.table, where), { limit: 1 });

      if (observed.rows.length === 0) {
        const values = {
          ...t.encodeInsert({ identityKey: key, identity }),
          ...where,
          [t.provider]: identity.provider,
          [t.issuer]: identity.issuer,
          [t.externalSubject]: identity.subject,
          [t.state]: "Unowned",
          [t.version]: owner.marker,
          [t.subjectId]: null,
          [t.reservation]: null,
        };

        const inserted = yield* owner.insert(t.table, values, where, true);

        observed.rows = inserted.rows;
      }
      const row = observed.rows[0]!;

      invariant(
        row[t.provider] === identity.provider &&
          row[t.issuer] === identity.issuer &&
          row[t.externalSubject] === identity.subject &&
          ["Unowned", "Reserved", "Owned"].includes(row[t.state]),
      );
      invariant(
        row[t.state] === "Owned"
          ? row[t.subjectId] !== null
          : row[t.subjectId] === null &&
              (row[t.state] === "Reserved"
                ? typeof row[t.reservation] === "string"
                : row[t.reservation] === null),
      );
      if (ownership.mode === "separate") {
        const o = ownership.external;

        const external = yield* owner.read(o.table, equal(o.table, { [o.identityKey]: key }), {
          limit: 1,
        });

        if (row[t.state] === "Owned") {
          const linked = external.rows[0];

          invariant(
            linked !== undefined &&
              linked[o.provider] === identity.provider &&
              linked[o.issuer] === identity.issuer &&
              linked[o.externalSubject] === identity.subject &&
              matchesNativeRow(o.table, linked, { [o.subjectId]: row[t.subjectId] }),
          );
          const owned = sql`exists(select 1 from ${o.table} where ${both(equal(o.table, { [o.identityKey]: key }), o.ownedCondition)})`;

          invariant(yield* owner.check(owned));
          owner.postconditions.push(owned);
        } else invariant(external.rows.length === 0);
      }

      return { observed, row, key };
    }),
  );

export const acquireTuple = (
  ownership: any,
  identity: typeof OAuthExternalIdentity.Type,
  key: string,
  subjectId: unknown,
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const t = ownership.tuple;

      yield* owner.update(
        t.table,
        { [t.identityKey]: key },
        {
          [t.state]: "Owned",
          [t.subjectId]: subjectId,
          [t.reservation]: null,
          [t.version]: owner.marker,
        },
      );
      if (ownership.mode === "separate") {
        const o = ownership.external;

        const values = {
          ...o.encodeInsert({ identity, identityKey: key, subjectId }),
          [o.identityKey]: key,
          [o.provider]: identity.provider,
          [o.issuer]: identity.issuer,
          [o.externalSubject]: identity.subject,
          [o.subjectId]: subjectId,
        };

        yield* owner.insert(o.table, values, { [o.identityKey]: key });
      }
    }),
  );

export const settleRegistrationIntent = (mapping: any, input: any) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const identity = input.identity.identity,
        context = input.claim.flow.context;

      invariant(identity.provider === context.provider && identity.issuer === context.issuer);
      const found = yield* discoverOwned(mapping.signIn, identity);
      const tuple = found.owned ? undefined : yield* readTuple(mapping.ownership, identity);
      const exact = yield* exactClaim(mapping.signIn, input.claim, "sign-in");

      if (exact === undefined) return { _tag: "Rejected" } as const;
      const credential = resolveOwned(mapping.signIn, context.moduleId, identity, found);

      if (credential !== undefined) {
        yield* terminalFlow(mapping.signIn, input.claim.flow, "Verified");

        return { _tag: "Verified", credential } as const;
      }
      let decision: any = { _tag: "Rejected" };

      if (
        !found.owned &&
        tuple?.row[mapping.ownership.tuple.state] === "Unowned" &&
        input.intent !== undefined
      ) {
        const intent = snapshotOAuthSync(OAuthRegistrationIntent, input.intent);
        const c = intent.context;

        invariant(
          sameIdentity(intent.identity, identity) &&
            profileStorage.encode(intent.profile ?? null) ===
              profileStorage.encode(input.identity.profile ?? null) &&
            intent.claimId === input.claim.claimId &&
            intent.claimedAtMillis === input.claim.claimedAtMillis &&
            contextStorage.encode(c) === contextStorage.encode(context),
        );

        const allowed =
          intent.issuedAtMillis >= intent.claimedAtMillis &&
          intent.verifiedAtMillis <= intent.issuedAtMillis &&
          intent.issuedAtMillis <= exact.now &&
          exact.now < intent.expiresAtMillis &&
          intent.expiresAtMillis <= c.requestBindingExpiresAtMillis &&
          intent.retentionUntilMillis >= intent.expiresAtMillis &&
          (yield* owner.check(mapping.eligibility.condition({ intent })));

        if (allowed) {
          const i = mapping.intent,
            encode = mapping.signIn.clock.encodeInstant;

          const key = { [i.moduleId]: c.moduleId, [i.reference]: intent.reference };

          const values = {
            ...i.encodeInsert(snapshotOAuthSync(OAuthRegistrationIntent, intent)),
            ...key,
            [i.flowId]: c.flowId,
            [i.claimId]: intent.claimId,
            [i.identityKey]: tuple.key,
            [i.version]: owner.marker,
            [i.state]: "Unbound",
            [i.snapshot]: intentStorage.encode(intent),
            [i.commandId]: null,
            [i.fingerprint]: null,
            [i.pendingReference]: null,
            [i.expiresAt]: encode(intent.expiresAtMillis),
            [i.retentionUntil]: encode(intent.retentionUntilMillis),
          };

          yield* owner.insert(i.table, values, key);
          owner.postconditions.push(
            mapping.eligibility.condition({ intent }),
            sql`${mapping.signIn.clock.engineNowMillis} >= ${intent.issuedAtMillis} and
            ${mapping.signIn.clock.engineNowMillis} < ${intent.expiresAtMillis}`,
          );
          decision = { _tag: "RegistrationIssued", intent };
        }
      }
      yield* terminalFlow(mapping.signIn, input.claim.flow, decision._tag);

      return decision;
    }),
  );

export const inspectIntent = (
  mapping: any,
  original: typeof OAuthRegistrationAccess.Type,
  discovery = false,
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const access = snapshotOAuthSync(OAuthRegistrationAccess, original),
        i = mapping.intent;

      const observed = yield* owner.read(
        i.table,
        equal(i.table, {
          [i.moduleId]: access.moduleId,
          [i.reference]: access.reference,
        }),
        { limit: 1, ...(discovery ? { lock: false, observe: false } : {}) },
      );

      const row = observed.rows[0];

      if (row === undefined) return undefined;

      const intent = intentStorage.decode(row[i.snapshot]),
        c = intent.context,
        now = yield* owner.now(mapping.clock);

      invariant(
        row[i.moduleId] === c.moduleId &&
          row[i.reference] === intent.reference &&
          row[i.flowId] === c.flowId &&
          row[i.claimId] === intent.claimId &&
          row[i.identityKey] === oauthIdentityKey(intent.identity) &&
          mapping.clock.decodeInstant(row[i.expiresAt]) === intent.expiresAtMillis &&
          mapping.clock.decodeInstant(row[i.retentionUntil]) === intent.retentionUntilMillis,
      );
      if (
        access.moduleId !== c.moduleId ||
        access.reference !== intent.reference ||
        access.flowId !== c.flowId ||
        access.requestBindingVerifier !== c.requestBindingVerifier ||
        access.requestBindingExpiresAtMillis !== c.requestBindingExpiresAtMillis ||
        access.credentialDigest !== intent.credentialDigest ||
        now < intent.issuedAtMillis ||
        now >= intent.expiresAtMillis
      )
        return undefined;
      let application: any;

      if (row[i.state] === "Unbound") {
        invariant(
          row[i.commandId] === null &&
            row[i.fingerprint] === null &&
            row[i.pendingReference] === null,
        );
        application = { _tag: "Unbound" };
      } else {
        application = {
          _tag: row[i.state],
          commandId: row[i.commandId],
          fingerprint: row[i.fingerprint],
          ...(row[i.state] === "ProvisioningPending" ? { reference: row[i.pendingReference] } : {}),
        };
      }
      const inspection = snapshotOAuthSync(OAuthRegistrationInspection, { intent, application });

      owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${intent.issuedAtMillis} and
      ${mapping.clock.engineNowMillis} < ${intent.expiresAtMillis}`);

      return { observed, row, inspection };
    }),
  );

export interface RegistrationResources {
  readonly provisioningIdentity: string;
  readonly pendingReference?: string;
  readonly subjectId?: unknown;
  readonly credentialId?: string;
  readonly revision?: string;
}

/** Public mapping callbacks are closed Effects; erasing native row shapes must
 * not erase their error or requirements channels. */
export type RegistrationCallbacks<Registration> = Pick<
  OAuthRegistrationBase<Registration, any, any, any, any, unknown>,
  "snapshot" | "snapshotSync" | "inspect" | "inspectSync"
>;

export const registrationResources = (mapping: any) =>
  Effect.gen(function* () {
    const provisioningIdentity = yield* mapping.allocateProvisioningIdentity as Effect.Effect<
      string,
      PersistenceMappingError
    >;

    invariant(
      typeof provisioningIdentity === "string" &&
        provisioningIdentity.length > 0 &&
        provisioningIdentity.length <= 256,
    );
    if (mapping.mode === "pending") {
      const pendingReference = yield* mapping.allocatePendingReference as Effect.Effect<
        string,
        PersistenceMappingError
      >;

      invariant(
        typeof pendingReference === "string" &&
          pendingReference.length > 0 &&
          pendingReference.length <= 256,
      );

      return { provisioningIdentity, pendingReference } as RegistrationResources;
    }

    const subjectId = yield* mapping.allocateSubjectId as Effect.Effect<
      unknown,
      PersistenceMappingError
    >;

    const publicId = yield* (mapping.subjectId as SubjectIdCodec<unknown>).toSubject(subjectId);

    invariant(
      mapping.subjectId.equals(
        subjectId,
        yield* (mapping.subjectId as SubjectIdCodec<unknown>).toNative(publicId),
      ),
    );

    const credentialId = snapshotOAuthSync(
      OAuthCredentialSnapshot.fields.credentialId,
      yield* mapping.allocateCredentialId as Effect.Effect<string, PersistenceMappingError>,
    );

    const revision = snapshotOAuthSync(
      OAuthCredentialSnapshot.fields.credentialRevision,
      yield* mapping.allocateRevision as Effect.Effect<SecurityRevision, PersistenceMappingError>,
    );

    return { provisioningIdentity, subjectId, credentialId, revision } as RegistrationResources;
  });

export const registrationData = <Registration>(
  mapping: any,
  input: {
    readonly intent: OAuthRegistrationIntent;
    readonly registration: Registration;
    readonly fingerprint: string;
  },
  bound: boolean,
) =>
  Effect.gen(function* () {
    const snapshot = bound
      ? (invariant(mapping.snapshotSync !== undefined), mapping.snapshotSync(input.registration))
      : yield* (mapping as RegistrationCallbacks<Registration>).snapshot(input.registration);

    const encoded = mapping.application.encode(snapshot);

    invariant(typeof encoded === "string" && new TextEncoder().encode(encoded).length <= 1048576);
    const detached = mapping.application.decode(encoded);

    invariant(mapping.application.encode(detached) === encoded);

    const checked = bound
      ? (invariant(mapping.inspectSync !== undefined),
        mapping.inspectSync({
          intent: snapshotOAuthSync(OAuthRegistrationIntent, input.intent),
          registration: mapping.application.decode(encoded),
        }))
      : yield* (mapping as RegistrationCallbacks<Registration>).inspect({
          intent: snapshotOAuthSync(OAuthRegistrationIntent, input.intent),
          registration: mapping.application.decode(encoded),
        });

    const fingerprint = snapshotOAuthSync(OAuthRegistrationFingerprint, checked.fingerprint);

    invariant(typeof checked.eligible === "boolean");

    return {
      encoded,
      registration: detached as Registration,
      fingerprint,
      eligible: checked.eligible && fingerprint === input.fingerprint,
    };
  });

export const register = (
  mapping: any,
  input: any,
  data: { readonly encoded: string; readonly fingerprint: string; readonly eligible: boolean },
  resources: RegistrationResources,
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const intent = snapshotOAuthSync(OAuthRegistrationIntent, input.intent),
        c = intent.context;

      const discovered = yield* inspectIntent(mapping, input.access, true);

      if (
        discovered === undefined ||
        intentStorage.encode(discovered.inspection.intent) !== intentStorage.encode(intent)
      )
        return { _tag: "Rejected" } as const;
      const nativeSubjectId = resources.subjectId;

      const policyInput = () => ({
        intent: snapshotOAuthSync(OAuthRegistrationIntent, intent),
        registration: mapping.application.decode(data.encoded),
        ...(mapping.mode === "atomic" ? { nativeSubjectId } : {}),
      });

      invariant((mapping.eligibility.guards?.length ?? 0) <= 32);
      for (const guard of mapping.eligibility.guards ?? []) {
        const locked = yield* owner.read(guard.table, guard.condition(policyInput()), {
          orderBy: col(guard.table, guard.orderBy),
          admissionOnly: true,
        });

        invariant(locked.rows.length > 0);
      }
      const tuple = yield* readTuple(mapping.ownership, intent.identity);
      const inspected = yield* inspectIntent(mapping, input.access);

      if (
        inspected === undefined ||
        intentStorage.encode(inspected.inspection.intent) !== intentStorage.encode(intent)
      )
        return { _tag: "Rejected" } as const;

      const r = mapping.command,
        i = mapping.intent,
        t = mapping.ownership.tuple;

      const commandKey = { [r.moduleId]: c.moduleId, [r.commandId]: input.commandId };
      const command = yield* owner.read(r.table, equal(r.table, commandKey), { limit: 1 });
      const previous = command.rows[0];

      if (previous !== undefined) {
        if (
          previous[r.reference] !== intent.reference ||
          previous[r.identityKey] !== tuple.key ||
          previous[r.fingerprint] !== data.fingerprint ||
          previous[r.intentSnapshot] !== intentStorage.encode(intent) ||
          previous[r.applicationSnapshot] !== data.encoded
        )
          return { _tag: "Conflict" } as const;
        invariant(
          mapping.application.encode(
            mapping.application.decode(previous[r.applicationSnapshot]),
          ) === data.encoded,
        );
        const old = decisionStorage.decode(previous[r.decision]);

        invariant(inspected.inspection.application._tag === old._tag);

        return old._tag === "Registered" || old._tag === "ProvisioningPending"
          ? { ...old, replayed: true }
          : old;
      }
      if (inspected.inspection.application._tag !== "Unbound" || tuple.row[t.state] !== "Unowned")
        return { _tag: "Conflict" } as const;
      if (data.fingerprint !== input.fingerprint) return { _tag: "Rejected" } as const;

      const admitted =
        data.eligible && (yield* owner.check(mapping.eligibility.admission(policyInput())));

      let decision: typeof OAuthRegistrationDecision.Type;

      if (!admitted) decision = { _tag: "Rejected" };
      else if (mapping.mode === "pending") {
        invariant(resources.pendingReference !== undefined);

        const reservation = reservationStorage.encode({
          moduleId: c.moduleId,
          reference: intent.reference,
          commandId: input.commandId,
          fingerprint: data.fingerprint,
          provisioningIdentity: resources.provisioningIdentity,
        });

        yield* owner.update(
          t.table,
          { [t.identityKey]: tuple.key },
          {
            [t.state]: "Reserved",
            [t.version]: owner.marker,
            [t.reservation]: reservation,
          },
        );
        decision = {
          _tag: "ProvisioningPending",
          reference: resources.pendingReference,
          replayed: false,
        };
      } else {
        invariant(resources.credentialId !== undefined && resources.revision !== undefined);

        const s = mapping.subject,
          cr = mapping.credential,
          a = mapping.authority;

        const subjectValues = {
          ...mapping.encodeSubjectInsert(policyInput(), {
            subjectId: nativeSubjectId,
            securityRevision: resources.revision,
          }),
          [s.id]: nativeSubjectId,
          [s.securityRevision]: resources.revision,
        };

        yield* owner.insert(s.table, subjectValues, { [s.id]: nativeSubjectId });

        const credentialValues = {
          ...cr.encodeInsert({
            moduleId: c.moduleId,
            subjectId: nativeSubjectId,
            identityKey: tuple.key,
            credentialId: resources.credentialId,
            credentialRevision: resources.revision,
          }),
          [cr.moduleId]: c.moduleId,
          [cr.subjectId]: nativeSubjectId,
          [cr.identityKey]: tuple.key,
          [cr.credentialId]: resources.credentialId,
          [cr.credentialRevision]: resources.revision,
        };

        invariant(
          cr.isActiveStatus(credentialValues[cr.status]) &&
            s.isActiveStatus(subjectValues[s.status]),
        );
        yield* owner.insert(cr.table, credentialValues, {
          [cr.credentialId]: resources.credentialId,
        });

        const authorityValues = {
          ...a.encodeInsert({
            subjectId: nativeSubjectId,
            credentialId: resources.credentialId,
            revision: resources.revision,
          }),
          [a.subjectId]: nativeSubjectId,
          [a.credentialId]: resources.credentialId,
          [a.revision]: resources.revision,
        };

        invariant(a.isActiveStatus(authorityValues[a.status]));
        yield* owner.insert(a.table, authorityValues, {
          [a.subjectId]: nativeSubjectId,
          [a.credentialId]: resources.credentialId,
        });
        yield* acquireTuple(mapping.ownership, intent.identity, tuple.key, nativeSubjectId);
        owner.postconditions.push(
          sql`exists(select 1 from ${s.table} where ${both(
            eq(col(s.table, s.id), nativeSubjectId),
            s.activeCondition,
          )})`,
          sql`exists(select 1 from ${cr.table} where ${both(eq(col(cr.table, cr.credentialId), resources.credentialId), cr.activeCondition)})`,
          sql`exists(select 1 from ${a.table} where ${both(
            eq(col(a.table, a.credentialId), resources.credentialId),
            eq(col(a.table, a.subjectId), nativeSubjectId),
            a.activeCondition,
          )})`,
        );
        decision = { _tag: "Registered", replayed: false };
      }
      const now = yield* owner.now(mapping.clock);

      invariant(Number.isSafeInteger(mapping.retentionMillis) && mapping.retentionMillis >= 120000);

      const values = {
        ...r.encodeInsert({
          intent: snapshotOAuthSync(OAuthRegistrationIntent, intent),
          commandId: input.commandId,
          fingerprint: data.fingerprint,
          registration: mapping.application.decode(data.encoded),
          provisioningIdentity: resources.provisioningIdentity,
        }),
        ...commandKey,
        [r.reference]: intent.reference,
        [r.identityKey]: tuple.key,
        [r.fingerprint]: data.fingerprint,
        [r.intentSnapshot]: intentStorage.encode(intent),
        [r.applicationSnapshot]: data.encoded,
        [r.provisioningIdentity]: resources.provisioningIdentity,
        [r.decision]: decisionStorage.encode(decision),
        [r.retentionUntil]: mapping.clock.encodeInstant(
          Math.max(intent.retentionUntilMillis, now + mapping.retentionMillis),
        ),
      };

      const inserted = yield* owner.insert(r.table, values, commandKey);

      command.rows = inserted.rows;
      yield* owner.update(
        i.table,
        { [i.moduleId]: c.moduleId, [i.reference]: intent.reference },
        {
          [i.state]: decision._tag,
          [i.commandId]: input.commandId,
          [i.fingerprint]: data.fingerprint,
          [i.version]: owner.marker,
          [i.pendingReference]: decision._tag === "ProvisioningPending" ? decision.reference : null,
        },
      );
      if (admitted) owner.postconditions.push(mapping.eligibility.postcondition(policyInput()));

      return decision;
    }),
  );
