import {
  OAuthAccountRevision,
  OAuthActionAuthorization,
  OAuthLinkAccess,
  OAuthLinkClaim,
  OAuthLinkPendingFlow,
  OAuthLinkTransactionContext,
  OAuthUnlinked,
  OAuthCredentialSnapshot,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import {
  SessionInvalidationWindow,
  AuthenticationRequirement,
  SecurityRevision,
} from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- private owner implementation; public mappings retain native IDs. */
import { eq, sql } from "drizzle-orm";
import { DateTime, Effect } from "effect";

import type { SubjectIdCodec } from "./model";
import {
  claimFlow,
  credentialStorage,
  currentSubject,
  exactClaim,
  issueFlow,
  linkStorage,
  matchesAccess,
  readFlow,
  terminalFlow,
} from "./oauth-flow";
import type { OAuthEligibilityFact } from "./oauth-model";
import { both, col, copiedRow, equal, CurrentOAuthTransaction } from "./oauth-owner";
import { acquireTuple, readTuple } from "./oauth-registration";
import {
  invariant,
  oauthIdentityKey,
  sameRevision,
  satisfies,
  storage,
  validAction,
} from "./oauth-state";

const contextStorage = storage(OAuthLinkTransactionContext);
const unlinkedStorage = storage(OAuthUnlinked);

export const accountCurrent = (mapping: any, subjectId: OAuthAccountRevision["subjectId"]) =>
  Effect.gen(function* () {
    const native = yield* (mapping.subjectId as SubjectIdCodec<unknown>).toNative(subjectId);

    return yield* currentSubject(mapping, native);
  });

const authorization = (
  mapping: any,
  current: any,
  auth: OAuthActionAuthorization,
  action: OAuthActionAuthorization["challenge"]["action"],
  flowId: string,
  commandId: string,
  intent: string,
  maximumAge: number,
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const now = yield* owner.now(mapping.clock);

      const currentRequirement = snapshotOAuthSync(
        AuthenticationRequirement,
        mapping.subject.decodeActionRequirement(copiedRow(current.row), action),
      );

      const accepted = validAction(
        auth,
        {
          moduleId: auth.challenge.moduleId,
          action,
          flowId,
          commandId,
          revision: current.revision,
          intent,
        },
        currentRequirement,
        now,
        maximumAge,
      );

      if (!accepted) return false;

      const age = Math.min(
        maximumAge,
        auth.requirement.maximumAgeMillis,
        currentRequirement.maximumAgeMillis,
      );

      const fresh = auth.evidence.proofs.filter(
        (proof) => now - DateTime.toEpochMillis(proof.verifiedAt) < age,
      );

      invariant(fresh.length > 0);

      const deadline = Math.min(
        ...fresh.map((proof) => DateTime.toEpochMillis(proof.verifiedAt) + age),
      );

      owner.postconditions.push(
        sql`${mapping.clock.engineNowMillis} >= ${now} and ${mapping.clock.engineNowMillis} < ${deadline}`,
      );

      return true;
    }),
  );

const currentLink = (mapping: any, flow: typeof OAuthLinkPendingFlow.Type) =>
  Effect.gen(function* () {
    const current = yield* accountCurrent(mapping, flow.context.revision.subjectId);

    return current !== undefined && sameRevision(current.revision, flow.context.revision)
      ? current
      : undefined;
  });

export const issueLink = (mapping: any, input: any) =>
  Effect.gen(function* () {
    const flow = snapshotOAuthSync(OAuthLinkPendingFlow, input.flow),
      c = flow.context;

    const current = yield* currentLink(mapping, flow);
    const auth = snapshotOAuthSync(OAuthActionAuthorization, input.authorization);

    if (
      current === undefined ||
      auth.challenge.moduleId !== c.moduleId ||
      !(yield* authorization(
        mapping,
        current,
        auth,
        "link-begin",
        c.flowId,
        c.commandId,
        contextStorage.encode(c),
        c.maximumEvidenceAgeMillis,
      ))
    )
      return { _tag: "Rejected" } as const;

    return yield* issueFlow(mapping, flow, "link");
  });

export const preflightLink = (mapping: any, original: typeof OAuthLinkAccess.Type) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const input = snapshotOAuthSync(OAuthLinkAccess, original);
      // The authenticated subject is known before discovering/locking any flow.
      const current = yield* accountCurrent(mapping, input.subjectId);
      const found = yield* readFlow(mapping, input, "link");
      const now = yield* owner.now(mapping.clock);

      if (
        current === undefined ||
        found.flow === undefined ||
        found.row?.[mapping.flow.state] !== "Pending" ||
        !matchesAccess(found.flow, input)
      )
        return undefined;

      const flow = snapshotOAuthSync(OAuthLinkPendingFlow, found.flow as never),
        c = flow.context;

      if (
        c.revision.subjectId !== input.subjectId ||
        !sameRevision(current.revision, c.revision) ||
        now < c.issuedAtMillis ||
        now >= c.expiresAtMillis
      )
        return undefined;
      owner.postconditions.push(
        sql`${mapping.clock.engineNowMillis} >= ${c.issuedAtMillis} and ${mapping.clock.engineNowMillis} < ${c.expiresAtMillis}`,
      );

      return { current, flow, row: found.row };
    }),
  );

export const claimLink = (mapping: any, input: any) =>
  Effect.gen(function* () {
    const found = yield* preflightLink(mapping, input.access);
    const flow = snapshotOAuthSync(OAuthLinkPendingFlow, input.flow);

    const auth = snapshotOAuthSync(OAuthActionAuthorization, input.authorization),
      c = flow.context;

    if (
      found === undefined ||
      linkStorage.encode(found.flow) !== linkStorage.encode(flow) ||
      auth.challenge.moduleId !== c.moduleId ||
      !(yield* authorization(
        mapping,
        found.current,
        auth,
        "link-complete",
        c.flowId,
        c.commandId,
        contextStorage.encode(c),
        c.maximumEvidenceAgeMillis,
      ))
    )
      return { _tag: "Rejected" } as const;
    const claim = yield* claimFlow(mapping, { row: found.row!, flow }, input.claimId);

    return claim === undefined
      ? ({ _tag: "Rejected" } as const)
      : ({ _tag: "Claimed", claim } as const);
  });

const checkInvalidation = (mapping: any, original: SessionInvalidationWindow) => {
  const value = snapshotOAuthSync(SessionInvalidationWindow, original);

  invariant(
    value.trigger === "credential-change" &&
      value.oldAuthenticationEvidence === "rejected" &&
      (mapping.sessionInvalidation === "same-authority-immediate"
        ? value.existingSessions === "immediate" && value.maximumExposureMillis === 0
        : value.existingSessions === "original-absolute-expiry"),
  );

  return value;
};

const advance = (mapping: any, current: any, removed?: string) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const revision = mapping.subject.nextSecurityRevision(current.revision.securityRevision);

      invariant(
        typeof revision === "string" &&
          revision.length > 0 &&
          revision.length <= 256 &&
          revision !== current.revision.securityRevision,
      );
      const subject = mapping.subject;

      yield* owner.update(
        subject.table,
        { [subject.id]: current.nativeId },
        { [subject.securityRevision]: revision },
      );
      for (const cleanup of mapping.cleanup) {
        const condition = both(
          eq(col(cleanup.table, cleanup.subjectId), current.nativeId),
          cleanup.condition({
            subjectId: current.nativeId,
            revision: snapshotOAuthSync(OAuthAccountRevision, current.revision),
            ...(removed === undefined ? {} : { removedCredentialId: removed }),
          }),
        );

        yield* owner.write(owner.database.delete(cleanup.table).where(condition));
        owner.postconditions.push(
          sql`not exists(select 1 from ${cleanup.table} where ${condition})`,
        );
      }

      return SecurityRevision.make(revision);
    }),
  );

export const settleLink = (
  mapping: any,
  input: any,
  allocated: { readonly credentialId: string; readonly revision: SecurityRevision },
) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const claim = snapshotOAuthSync(OAuthLinkClaim, input.claim),
        flow = claim.flow,
        c = flow.context;

      const current = yield* currentLink(mapping, flow);

      // Known subject is always locked before tuple/flow; even a rejected outcome
      // settles its exact original claim without adopting a newer revision.
      const identity =
        input.outcome._tag === "Verified" ? input.outcome.identity.identity : undefined;

      if (identity !== undefined)
        invariant(identity.provider === c.provider && identity.issuer === c.issuer);

      const tuple =
        identity !== undefined && current !== undefined
          ? yield* readTuple(mapping.ownership, identity)
          : undefined;

      const exact = yield* exactClaim(mapping, claim, "link");

      if (exact === undefined) return { _tag: "Rejected" } as const;
      let decision: any = { _tag: input.outcome._tag };

      if (input.outcome._tag === "Verified") {
        decision = { _tag: "Rejected" };
        const auth = snapshotOAuthSync(OAuthActionAuthorization, input.authorization);

        if (
          current !== undefined &&
          tuple !== undefined &&
          auth.challenge.moduleId === c.moduleId &&
          (yield* authorization(
            mapping,
            current,
            auth,
            "link-complete",
            c.flowId,
            c.commandId,
            contextStorage.encode(c),
            c.maximumEvidenceAgeMillis,
          ))
        ) {
          const t = mapping.ownership.tuple,
            cr = mapping.credential,
            a = mapping.authority;

          const login = yield* owner.read(cr.table, eq(col(cr.table, cr.identityKey), tuple.key), {
            limit: 1,
          });

          const previous = login.rows[0];

          if (
            tuple.row[t.state] === "Reserved" ||
            (tuple.row[t.state] === "Owned" &&
              !mapping.subjectId.equals(tuple.row[t.subjectId], current.nativeId)) ||
            (previous !== undefined &&
              (previous[cr.moduleId] !== c.moduleId ||
                !mapping.subjectId.equals(previous[cr.subjectId], current.nativeId) ||
                !cr.isActiveStatus(previous[cr.status])))
          )
            decision = { _tag: "Conflict" };
          else if (previous !== undefined) {
            const shared = current.revision.credentials.find(
              (item: any) => item.credentialId === previous[cr.credentialId],
            );

            if (
              tuple.row[t.state] !== "Owned" ||
              shared?.revision !== previous[cr.credentialRevision] ||
              !(yield* owner.check(
                sql`exists(select 1 from ${cr.table} where ${both(eq(col(cr.table, cr.identityKey), tuple.key), cr.activeCondition)})`,
              ))
            )
              decision = { _tag: "Conflict" };
            else
              decision = {
                _tag: "Linked",
                changed: false,
                credential: snapshotOAuthSync(OAuthCredentialSnapshot, {
                  moduleId: c.moduleId,
                  identity,
                  credentialId: previous[cr.credentialId],
                  credentialRevision: previous[cr.credentialRevision],
                  revision: current.revision,
                }),
              };
          } else {
            checkInvalidation(mapping, input.invalidation);

            const values = {
              ...cr.encodeInsert({
                moduleId: c.moduleId,
                subjectId: current.nativeId,
                identityKey: tuple.key,
                credentialId: allocated.credentialId,
                credentialRevision: allocated.revision,
              }),
              [cr.moduleId]: c.moduleId,
              [cr.subjectId]: current.nativeId,
              [cr.identityKey]: tuple.key,
              [cr.credentialId]: allocated.credentialId,
              [cr.credentialRevision]: allocated.revision,
            };

            invariant(cr.isActiveStatus(values[cr.status]));

            const inserted = yield* owner.insert(cr.table, values, {
              [cr.credentialId]: allocated.credentialId,
            });

            login.rows = inserted.rows;

            const sharedValues = {
              ...a.encodeInsert({
                subjectId: current.nativeId,
                credentialId: allocated.credentialId,
                revision: allocated.revision,
              }),
              [a.subjectId]: current.nativeId,
              [a.credentialId]: allocated.credentialId,
              [a.revision]: allocated.revision,
            };

            invariant(a.isActiveStatus(sharedValues[a.status]));

            const shared = yield* owner.insert(a.table, sharedValues, {
              [a.subjectId]: current.nativeId,
              [a.credentialId]: allocated.credentialId,
            });

            current.authorities.rows = [...current.authorities.rows, ...shared.rows];
            owner.postconditions.push(
              sql`exists(select 1 from ${cr.table} where ${both(
                eq(col(cr.table, cr.credentialId), allocated.credentialId),
                cr.activeCondition,
              )})`,
              sql`exists(select 1 from ${a.table} where ${both(
                eq(col(a.table, a.subjectId), current.nativeId),
                eq(col(a.table, a.credentialId), allocated.credentialId),
                a.activeCondition,
              )})`,
            );
            if (tuple.row[t.state] === "Unowned")
              yield* acquireTuple(mapping.ownership, identity, tuple.key, current.nativeId);
            const next = yield* advance(mapping, current);

            const revision = snapshotOAuthSync(OAuthAccountRevision, {
              ...current.revision,
              securityRevision: next,
              credentials: [
                ...current.revision.credentials,
                { credentialId: allocated.credentialId, revision: allocated.revision },
              ],
            });

            decision = {
              _tag: "Linked",
              changed: true,
              credential: snapshotOAuthSync(OAuthCredentialSnapshot, {
                moduleId: c.moduleId,
                identity,
                credentialId: allocated.credentialId,
                credentialRevision: allocated.revision as never,
                revision,
              }),
            };
          }
        }
      }
      yield* terminalFlow(mapping, flow, decision._tag);

      return decision;
    }),
  );

const targetCredential = (mapping: any, moduleId: string, credentialId: string, current: any) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const cr = mapping.credential;

      const found = yield* owner.read(cr.table, eq(col(cr.table, cr.credentialId), credentialId), {
        limit: 1,
      });

      const row = found.rows[0];

      if (
        row === undefined ||
        row[cr.moduleId] !== moduleId ||
        !mapping.subjectId.equals(row[cr.subjectId], current.nativeId) ||
        !cr.isActiveStatus(row[cr.status])
      )
        return undefined;
      const t = mapping.ownership.tuple;

      const tuple = yield* owner.read(
        t.table,
        eq(col(t.table, t.identityKey), row[cr.identityKey]),
        {
          limit: 1,
        },
      );

      const ownership = tuple.rows[0];

      if (
        ownership === undefined ||
        ownership[t.state] !== "Owned" ||
        !mapping.subjectId.equals(ownership[t.subjectId], current.nativeId)
      )
        return undefined;

      const identity = {
        provider: ownership[t.provider],
        issuer: ownership[t.issuer],
        subject: ownership[t.externalSubject],
      };

      invariant(oauthIdentityKey(identity) === row[cr.identityKey]);

      const shared = current.revision.credentials.find(
        (item: any) => item.credentialId === credentialId,
      );

      if (
        shared?.revision !== row[cr.credentialRevision] ||
        !(yield* owner.check(
          sql`exists(select 1 from ${cr.table} where ${both(eq(col(cr.table, cr.credentialId), credentialId), cr.activeCondition)})`,
        ))
      )
        return undefined;

      return snapshotOAuthSync(OAuthCredentialSnapshot, {
        moduleId: moduleId as never,
        identity,
        credentialId,
        credentialRevision: row[cr.credentialRevision],
        revision: current.revision,
      });
    }),
  );

const unlinkCommand = (mapping: any, moduleId: string, commandId: string) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    owner.read(
      mapping.command.table,
      equal(mapping.command.table, {
        [mapping.command.moduleId]: moduleId,
        [mapping.command.commandId]: commandId,
      }),
      { limit: 1 },
    ),
  );

export const inspectUnlink = (mapping: any, input: any) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const current = yield* accountCurrent(mapping, input.subjectId);

      if (current === undefined) return { _tag: "Rejected" } as const;

      const command = yield* unlinkCommand(mapping, input.moduleId, input.commandId),
        r = mapping.command;

      const old = command.rows[0];

      if (old !== undefined) {
        const intent = credentialStorage.decode(old[r.intentSnapshot]);

        if (
          intent.moduleId !== input.moduleId ||
          intent.revision.subjectId !== input.subjectId ||
          intent.credentialId !== input.credentialId ||
          !mapping.subjectId.equals(old[r.subjectId], current.nativeId) ||
          old[r.credentialId] !== input.credentialId
        )
          return { _tag: "Conflict" } as const;
        const metadata = mapping.metadata.condition(current.nativeId);

        if (!(yield* owner.check(metadata))) return { _tag: "Rejected" } as const;
        owner.postconditions.push(metadata);

        return { _tag: "Replay", result: unlinkedStorage.decode(old[r.decision]) } as const;
      }

      const credential = yield* targetCredential(
        mapping,
        input.moduleId,
        input.credentialId,
        current,
      );

      return credential === undefined
        ? ({ _tag: "Rejected" } as const)
        : ({ _tag: "Target", credential } as const);
    }),
  );

const remainingEligibility = (mapping: any, current: any, removed: string) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      invariant(mapping.eligibility.length > 0 && mapping.eligibility.length <= 32);
      const facts = new Map<string, OAuthEligibilityFact>();

      const revisions = new Map(
        current.revision.credentials.map((item: any) => [item.credentialId, item.revision]),
      );

      for (const descriptor of mapping.eligibility) {
        const observed = yield* owner.read(
          descriptor.table,
          both(
            eq(col(descriptor.table, descriptor.subjectId), current.nativeId),
            descriptor.condition(current.nativeId),
          ),
          { orderBy: col(descriptor.table, descriptor.credentialId) },
        );

        for (const row of observed.rows) {
          const fact = descriptor.decode(copiedRow(row)) as OAuthEligibilityFact | undefined;

          if (fact === undefined || fact.credentialId === removed) continue;
          invariant(
            fact.credentialId === row[descriptor.credentialId] &&
              fact.revision === row[descriptor.revision] &&
              revisions.get(fact.credentialId) === fact.revision &&
              fact.factors.length <= 8 &&
              fact.factors.every((factor) =>
                ["knowledge", "possession", "inherence"].includes(factor),
              ),
          );
          invariant(
            typeof fact.usablePrimary === "boolean" &&
              typeof fact.userVerified === "boolean" &&
              typeof fact.phishingResistant === "boolean",
          );

          const normalized = {
            credentialId: fact.credentialId,
            revision: fact.revision,
            usablePrimary: fact.usablePrimary,
            factors: [...new Set(fact.factors)].sort(),
            userVerified: fact.userVerified,
            phishingResistant: fact.phishingResistant,
          };

          const prior = facts.get(fact.credentialId);

          // oxlint-disable-next-line no-restricted-properties -- Canonical bounded eligibility fact fingerprint rejects contradictory duplicate IDs.
          invariant(prior === undefined || JSON.stringify(prior) === JSON.stringify(normalized));
          facts.set(fact.credentialId, normalized);
        }
      }
      const available = [...facts.values()];

      const requirement = snapshotOAuthSync(
        AuthenticationRequirement,
        mapping.subject.decodeAuthenticationRequirement(copiedRow(current.row)),
      );

      return available.some((fact) => fact.usablePrimary) && satisfies(available, requirement);
    }),
  );

export const unlink = (mapping: any, input: any) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.gen(function* () {
      const expected = snapshotOAuthSync(OAuthCredentialSnapshot, input.credential);

      invariant(expected.moduleId === input.moduleId);
      const current = yield* accountCurrent(mapping, expected.revision.subjectId);

      if (current === undefined) return { _tag: "Rejected" } as const;
      const guards = mapping.connectedReferenceGuards ?? [];

      invariant(guards.length <= 32);
      let referencesGuarded = mapping.connectedReference !== undefined && guards.length > 0;

      if (mapping.connectedReference !== undefined)
        for (const guard of guards) {
          const read = yield* owner.read(
            guard.table,
            guard.condition({
              identity: snapshotOAuthSync(
                OAuthCredentialSnapshot.fields.identity,
                expected.identity,
              ),
              identityKey: oauthIdentityKey(expected.identity),
              subjectId: copiedRow({ value: current.nativeId }).value,
            }),
            { orderBy: col(guard.table, guard.orderBy) },
          );

          if (read.rows.length === 0) referencesGuarded = false;
        }

      const command = yield* unlinkCommand(mapping, input.moduleId, input.commandId),
        r = mapping.command;

      const previous = command.rows[0];

      if (previous !== undefined) {
        if (
          previous[r.intentSnapshot] !== credentialStorage.encode(expected) ||
          previous[r.credentialId] !== expected.credentialId ||
          !mapping.subjectId.equals(previous[r.subjectId], current.nativeId)
        )
          return { _tag: "Conflict" } as const;
        const metadata = mapping.metadata.condition(current.nativeId);

        if (!(yield* owner.check(metadata))) return { _tag: "Rejected" } as const;
        owner.postconditions.push(metadata);

        return {
          _tag: "Unlinked",
          replayed: true,
          result: unlinkedStorage.decode(previous[r.decision]),
        } as const;
      }

      const actual = yield* targetCredential(
        mapping,
        input.moduleId,
        expected.credentialId,
        current,
      );

      if (
        actual === undefined ||
        credentialStorage.encode(actual) !== credentialStorage.encode(expected)
      )
        return { _tag: "Rejected" } as const;
      const auth = snapshotOAuthSync(OAuthActionAuthorization, input.authorization);

      if (
        auth.challenge.moduleId !== input.moduleId ||
        !(yield* authorization(
          mapping,
          current,
          auth,
          "unlink",
          input.commandId,
          input.commandId,
          credentialStorage.encode(expected),
          auth.requirement.maximumAgeMillis,
        ))
      )
        return { _tag: "Rejected" } as const;
      if (!(yield* remainingEligibility(mapping, current, expected.credentialId)))
        return { _tag: "LastSignInMethod" } as const;

      const invalidation = checkInvalidation(mapping, input.invalidation),
        cr = mapping.credential,
        a = mapping.authority;

      const key = oauthIdentityKey(expected.identity),
        t = mapping.ownership.tuple;

      const connected = mapping.connectedReference?.({
        identityKey: key,
        subjectId: copiedRow({ value: current.nativeId }).value,
      });

      const retain =
        connected !== undefined && (!referencesGuarded || (yield* owner.check(connected)));

      if (connected !== undefined && referencesGuarded)
        owner.postconditions.push(retain ? connected : sql`not (${connected})`);
      yield* owner.remove(cr.table, { [cr.credentialId]: expected.credentialId });
      yield* owner.remove(a.table, {
        [a.subjectId]: current.nativeId,
        [a.credentialId]: expected.credentialId,
      });
      if (!retain) {
        yield* owner.update(
          t.table,
          { [t.identityKey]: key },
          {
            [t.state]: "Unowned",
            [t.subjectId]: null,
            [t.reservation]: null,
            [t.version]: owner.marker,
          },
        );
        if (mapping.ownership.mode === "separate")
          yield* owner.remove(mapping.ownership.external.table, {
            [mapping.ownership.external.identityKey]: key,
          });
      }
      yield* advance(mapping, current, expected.credentialId);

      const result = snapshotOAuthSync(OAuthUnlinked, {
        _tag: "Unlinked",
        credentialId: expected.credentialId,
        invalidation,
      });

      const now = yield* owner.now(mapping.clock);

      invariant(
        Number.isSafeInteger(input.retentionUntilMillis) &&
          input.retentionUntilMillis > now &&
          input.retentionUntilMillis >= input.nowMillis + 120000,
      );
      const commandKey = { [r.moduleId]: input.moduleId, [r.commandId]: input.commandId };

      const values = {
        ...r.encodeInsert({
          moduleId: input.moduleId,
          commandId: input.commandId,
          credential: snapshotOAuthSync(OAuthCredentialSnapshot, expected),
        }),
        ...commandKey,
        [r.subjectId]: current.nativeId,
        [r.credentialId]: expected.credentialId,
        [r.intentSnapshot]: credentialStorage.encode(expected),
        [r.decision]: unlinkedStorage.encode(result),
        [r.retentionUntil]: mapping.clock.encodeInstant(input.retentionUntilMillis),
      };

      const inserted = yield* owner.insert(r.table, values, commandKey);

      command.rows = inserted.rows;

      return { _tag: "Unlinked", result, replayed: false } as const;
    }),
  );
