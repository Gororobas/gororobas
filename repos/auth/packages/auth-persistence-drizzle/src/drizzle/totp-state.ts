import { randomId, digest } from "@yielded/auth-crypto";
import { AuthenticationRequirement, SecurityRevision } from "@yielded/auth/Sessions";
import {
  TotpUnavailable,
  type TotpMutation,
  TotpPolicy,
  TotpRecord,
  type TotpDecision,
} from "@yielded/auth/Totp";
/* oxlint-disable no-explicit-any -- private native driver bridge; public makers preserve table and ID types. */
import { sql, type SQL } from "drizzle-orm";
import { Context, Effect, Schema } from "effect";

import { both, makeTransactionRows, type TransactionOwner } from "./transaction-owner";
export const unavailable = () => TotpUnavailable.make({});

export const invariant: (condition: unknown) => asserts condition = (condition) => {
  if (!condition) throw unavailable();
};

export class CurrentTotpTransaction extends Context.Service<
  CurrentTotpTransaction,
  TransactionOwner<TotpUnavailable>
>()("effect-auth/drizzle/CurrentTotpTransaction") {}

export const { equal, col, copiedRow } = makeTransactionRows(unavailable);
const codec = Schema.fromJsonString(TotpRecord);

export const encodeTotpRecord = (record: TotpRecord) => Schema.encodeSync(codec)(record);
export const decodeTotpRecord = (state: string) => Schema.decodeSync(codec)(state);

const scopeFor = (moduleId: string, subjectId: string) =>
  digest(`effect-auth/totp/scope/v1/${moduleId.length}:${moduleId}/${subjectId}`);

export const captureTotp = Effect.fn("TotpNative.capture")(function* (
  mapping: any,
  subjectId: typeof TotpRecord.Type.subjectId,
) {
  const owner = yield* CurrentTotpTransaction,
    subject = mapping.subject,
    factor = mapping.factor,
    nativeId = mapping.subjectIds.toNative(subjectId);

  invariant(mapping.subjectIds.toSubject(nativeId) === subjectId);

  const selected = yield* owner.read(
    subject.table,
    equal(subject.table, { [subject.id]: nativeId }),
    { limit: 1 },
  );

  const subjectRow = selected.rows[0];

  if (
    subjectRow === undefined ||
    !(yield* owner.check(
      sql`exists(select 1 from ${subject.table} where ${both(owner.exact(subject.table, subjectRow), subject.activeCondition)})`,
    ))
  )
    return undefined;

  const scope = scopeFor(mapping.moduleId, subjectId),
    found = yield* owner.read(factor.table, equal(factor.table, { [factor.scope]: scope }), {
      limit: 1,
    }),
    row = found.rows[0];

  const record = row === undefined ? null : decodeTotpRecord(row[factor.state] as string);

  invariant(
    record === null ||
      ((record.secret === null || record.secret.revision === record.revision) &&
        (record.pending === null || record.pending.secret.revision === record.pending.revision)),
  );
  invariant(
    record === null ||
      (record.moduleId === mapping.moduleId &&
        record.subjectId === subjectId &&
        record.version === row![factor.version]),
  );

  return {
    nativeId,
    subjectRow,
    factorRow: row,
    factorObservation: found,
    scope,
    snapshot: {
      revision: {
        subjectId,
        securityRevision: SecurityRevision.make(subjectRow[subject.securityRevision] as string),
        credentials:
          record === null || record.secret === null
            ? []
            : [
                {
                  credentialId: record.credentialId,
                  revision: SecurityRevision.make(record.revision),
                },
              ],
      },
      record,
    },
  };
});

const reject: TotpDecision = { _tag: "Rejected" };

export const mutateTotp = Effect.fn("TotpNative.mutate")(function* (
  mapping: any,
  input: TotpMutation,
) {
  const owner = yield* CurrentTotpTransaction;

  invariant(
    input.moduleId === mapping.moduleId &&
      Schema.encodeSync(Schema.fromJsonString(TotpPolicy))(input.policy) ===
        Schema.encodeSync(Schema.fromJsonString(TotpPolicy))(mapping.policy),
  );
  const captured = yield* captureTotp(mapping, input.subjectId);

  if (captured === undefined) return reject;

  const { snapshot, subjectRow, factorRow, factorObservation, scope, nativeId } = captured,
    current = snapshot.record,
    policy = input.policy,
    action = input.action;

  if (
    snapshot.revision.securityRevision !== input.snapshot.revision.securityRevision ||
    (current?.version ?? null) !== (input.snapshot.record?.version ?? null)
  )
    return reject;
  if (
    (current === null) !== (input.snapshot.record === null) ||
    (current !== null && encodeTotpRecord(current) !== encodeTotpRecord(input.snapshot.record!))
  )
    return reject;
  const now = yield* owner.now({ engineNowMillis: mapping.engineNowMillis });
  const guards: SQL[] = [];
  const credentialGuards: { credentialId: string; condition: SQL }[] = [];

  const commandScope = digest(
    `effect-auth/totp/command/v1/${mapping.moduleId.length}:${mapping.moduleId}/${input.subjectId.length}:${input.subjectId}/${input.commandId}`,
  );

  const management = ["Enroll", "Confirm", "Disable", "Regenerate"].includes(action._tag);

  const commandObservation = management
    ? yield* owner.read(
        mapping.factor.table,
        equal(mapping.factor.table, { [mapping.factor.scope]: commandScope }),
        { limit: 1 },
      )
    : undefined;

  if (commandObservation !== undefined && commandObservation.rows.length !== 0) return reject;
  const timeGuards: SQL[] = [];

  const timeBound = (start: number, end: number) => {
    timeGuards.push(
      sql`${mapping.engineNowMillis} >= ${start} and ${mapping.engineNowMillis} < ${end}`,
    );
  };

  if (
    action._tag === "Enroll" ||
    action._tag === "Confirm" ||
    action._tag === "Disable" ||
    action._tag === "Regenerate"
  ) {
    const authorization = input.authorization;

    if (authorization === undefined) return reject;
    const { challenge, evidence } = authorization;

    const expectedAction = {
      Enroll: "enroll",
      Confirm: "confirm",
      Disable: "disable",
      Regenerate: "regenerate",
    }[action._tag];

    if (
      challenge.action !== expectedAction ||
      challenge.moduleId !== mapping.moduleId ||
      challenge.commandId !== input.commandId ||
      challenge.revision.subjectId !== input.subjectId ||
      challenge.revision.securityRevision !== snapshot.revision.securityRevision ||
      evidence.flowId !== challenge.flowId ||
      evidence.bindingDigest !== challenge.bindingDigest ||
      evidence.revision.subjectId !== input.subjectId ||
      evidence.revision.securityRevision !== snapshot.revision.securityRevision
    )
      return reject;
    const auth = mapping.credential;

    for (const revision of [...evidence.revision.credentials].sort((a, b) =>
      a.credentialId.localeCompare(b.credentialId),
    )) {
      const found = yield* owner.read(
        auth.table,
        equal(auth.table, { [auth.id]: revision.credentialId, [auth.subjectId]: nativeId }),
        { limit: 1 },
      );

      const row = found.rows[0];

      if (row === undefined || row[auth.revision] !== revision.revision) return reject;
      const condition = sql`exists(select 1 from ${auth.table} where ${both(owner.exact(auth.table, row), auth.activeCondition)})`;

      if (!(yield* owner.check(condition))) return reject;
      credentialGuards.push({ credentialId: revision.credentialId, condition });
    }

    const eligible = evidence.proofs.filter((proof) =>
      evidence.revision.credentials.some(
        (revision) => revision.credentialId === proof.credentialId,
      ),
    );

    if (eligible.length !== evidence.proofs.length || eligible.length === 0) return reject;

    const requirements = [
      authorization.requirement,
      Schema.decodeSync(AuthenticationRequirement)(
        mapping.subject.decodeRequirement(copiedRow(subjectRow)),
      ),
    ];

    const maximumAge = Math.min(
      policy.maximumEvidenceAgeMillis,
      ...requirements.map((requirement) => requirement.maximumAgeMillis),
    );

    const evidenceFactors = new Set(eligible.flatMap((proof) => proof.factors));
    const evidenceCredentials = new Set(eligible.map((proof) => proof.credentialId));

    for (const requirement of requirements) {
      if (
        !requirement.alternatives.some(
          (alternative) =>
            alternative.factors.every((factor) => evidenceFactors.has(factor)) &&
            evidenceCredentials.size >= alternative.minimumCredentials &&
            eligible.some(
              (proof) =>
                (!alternative.userVerified || proof.userVerified) &&
                (!alternative.phishingResistant || proof.phishingResistant),
            ),
        )
      )
        return reject;
    }
    for (const proof of eligible) {
      const verifiedAt = proof.verifiedAt.epochMilliseconds;

      if (verifiedAt > now || now - verifiedAt >= maximumAge) return reject;
      timeBound(verifiedAt, verifiedAt + maximumAge);
    }
    if (
      (current !== null && current.secret !== null) ||
      action._tag === "Disable" ||
      action._tag === "Regenerate"
    ) {
      const factors = new Set(eligible.flatMap((proof) => proof.factors));

      if (
        !(
          eligible.some(
            (proof) =>
              proof.userVerified && proof.phishingResistant && proof.factors.includes("possession"),
          ) ||
          (factors.has("knowledge") &&
            factors.has("possession") &&
            new Set(eligible.map((proof) => proof.credentialId)).size >= 2)
        )
      )
        return reject;
    }
  }
  if (action._tag === "Recovery" && action.reset) {
    const target = action.pending;

    if (
      target === undefined ||
      mapping.pendingCondition === undefined ||
      target.revision.subjectId !== input.subjectId ||
      target.revision.securityRevision !== snapshot.revision.securityRevision ||
      target.expiresAtMillis <= now
    )
      return reject;
    const condition = mapping.pendingCondition(target, nativeId);

    if (!(yield* owner.check(condition))) return reject;
    guards.push(condition);
    timeBound(0, target.expiresAtMillis);
  }

  let next: TotpRecord,
    semantic = false,
    accepted = true;

  if (action._tag === "Enroll") {
    const candidate = action.record;

    if (
      candidate.subjectId !== input.subjectId ||
      candidate.moduleId !== input.moduleId ||
      candidate.pending === null ||
      candidate.pending.expiresAtMillis <= now ||
      candidate.pending.expiresAtMillis > now + policy.enrollmentLifetimeMillis ||
      candidate.pending.failedAttempts !== 0 ||
      candidate.pending.secret.revision !== candidate.pending.revision
    )
      return reject;
    // Reissuing cannot erase the confirmation budget during its current enrollment lifetime.
    if (current !== null && current.pending !== null && current.pending.expiresAtMillis > now)
      return reject;
    if (
      current !== null &&
      (candidate.credentialId !== current.credentialId ||
        encodeTotpRecord({ ...candidate, pending: current.pending }) !== encodeTotpRecord(current))
    )
      return reject;
    if (
      current === null &&
      (candidate.secret !== null ||
        candidate.recoveryDigests.length !== 0 ||
        candidate.acceptedStep !== -1 ||
        candidate.failedAttempts !== 0)
    )
      return reject;
    next = candidate;
    timeBound(0, candidate.pending.expiresAtMillis);
  } else {
    if (current === null) return reject;
    next = { ...current };
    if (action._tag === "Confirm") {
      const pending = current.pending;

      if (
        pending === null ||
        pending.enrollmentId !== action.enrollmentId ||
        pending.expiresAtMillis <= now ||
        pending.failedAttempts >= policy.attemptLimit
      )
        return reject;
      timeBound(0, pending.expiresAtMillis);
      if (
        action.matchedStep === null ||
        Math.abs(Math.floor(now / 30000) - action.matchedStep) > policy.clockSkewSteps
      ) {
        next = { ...current, pending: { ...pending, failedAttempts: pending.failedAttempts + 1 } };
        accepted = false;
      } else {
        if (new Set(action.recoveryDigests).size !== 10) return reject;
        next = {
          ...current,
          secret: pending.secret,
          revision: pending.secret.revision,
          pending: null,
          recoveryDigests: action.recoveryDigests,
          acceptedStep: action.matchedStep,
          attemptWindow: now,
          failedAttempts: 0,
        };
        semantic = true;
        timeBound(
          Math.max(0, (action.matchedStep - policy.clockSkewSteps) * 30000),
          (action.matchedStep + policy.clockSkewSteps + 1) * 30000,
        );
      }
    } else if (action._tag === "Verify" || action._tag === "Recovery") {
      if (current.secret === null) return reject;

      const expired = now >= current.attemptWindow + policy.attemptWindowMillis,
        attempts = expired ? 0 : current.failedAttempts,
        start = expired ? now : current.attemptWindow;

      if (attempts >= policy.attemptLimit) return reject;
      next = { ...current, attemptWindow: start, failedAttempts: attempts + 1 };
      if (action._tag === "Verify") {
        if (
          action.matchedStep === null ||
          action.matchedStep <= current.acceptedStep ||
          Math.abs(Math.floor(now / 30000) - action.matchedStep) > policy.clockSkewSteps
        )
          accepted = false;
        else {
          next = { ...next, acceptedStep: action.matchedStep, failedAttempts: 0 };
          timeBound(
            Math.max(0, (action.matchedStep - policy.clockSkewSteps) * 30000),
            (action.matchedStep + policy.clockSkewSteps + 1) * 30000,
          );
        }
      } else {
        if (
          (action.reset
            ? policy.lostFactorRecovery !== "reset-with-recovery-code"
            : !policy.allowRecoveryCodeForPending) ||
          !current.recoveryDigests.includes(action.digest)
        )
          accepted = false;
        else {
          next = {
            ...next,
            recoveryDigests: current.recoveryDigests.filter((value) => value !== action.digest),
            failedAttempts: 0,
          };
          if (action.reset) {
            next = {
              ...next,
              secret: null,
              pending: null,
              recoveryDigests: [],
              revision: randomId(),
            };
            semantic = true;
          }
        }
      }
    } else {
      if (current.secret === null) return reject;
      semantic = true;
      if (action._tag === "Disable")
        next = {
          ...current,
          secret: null,
          pending: null,
          recoveryDigests: [],
          revision: randomId(),
        };
      else {
        if (new Set(action.recoveryDigests).size !== 10) return reject;
        next = { ...current, recoveryDigests: action.recoveryDigests };
      }
    }
  }
  next = { ...next, version: randomId() };

  const subject = mapping.subject,
    factor = mapping.factor,
    auth = mapping.credential;

  const subjectKey = { [subject.id]: nativeId };

  if (semantic) {
    const revision = randomId(),
      updates = {
        [subject.securityRevision]: revision,
        [subject.factorEnabled]: subject.encodeEnabled(next.secret !== null),
      };

    yield* owner.update(subject.table, subjectKey, updates);
    const idKey = { [auth.id]: next.credentialId, [auth.subjectId]: nativeId };
    const existing = yield* owner.read(auth.table, equal(auth.table, idKey), { limit: 1 });

    if (existing.rows.length === 0) {
      const values = {
        ...auth.encodeInsert({
          credentialId: next.credentialId,
          subjectId: nativeId,
          revision: next.revision,
          active: next.secret !== null,
        }),
        [auth.id]: next.credentialId,
        [auth.subjectId]: nativeId,
        [auth.revision]: next.revision,
        [auth.status]: auth.encodeStatus(next.secret !== null),
      };

      existing.rows = (yield* owner.insert(auth.table, values, {
        [auth.id]: next.credentialId,
      })).rows;
    } else
      yield* owner.update(auth.table, idKey, {
        [auth.revision]: next.revision,
        [auth.status]: auth.encodeStatus(next.secret !== null),
      });
    // Management proof observations precede its own credential/revision mutation.
    // Retain all unrelated credential authority checks at final commit.
  }

  const state = encodeTotpRecord(next),
    values = { [factor.state]: state, [factor.version]: next.version };

  if (factorRow === undefined) {
    const insert = factor.encodeInsert({ scope, state, version: next.version });

    invariant(
      insert[factor.scope] === scope &&
        insert[factor.state] === state &&
        insert[factor.version] === next.version,
    );
    factorObservation.rows = (yield* owner.insert(factor.table, insert, {
      [factor.scope]: scope,
    })).rows;
  } else yield* owner.update(factor.table, { [factor.scope]: scope }, values);
  if (commandObservation !== undefined) {
    const values = factor.encodeInsert({
      scope: commandScope,
      state: "totp-command/v1",
      version: randomId(),
    });

    invariant(values[factor.scope] === commandScope && values[factor.state] === "totp-command/v1");
    commandObservation.rows = (yield* owner.insert(factor.table, values, {
      [factor.scope]: commandScope,
    })).rows;
  }
  // Exact pre-write observations plus final readback are asserted by the common owner.
  // Include active subject and native time at finalization, including on rejection commits.
  guards.push(
    sql`exists(select 1 from ${subject.table} where ${both(equal(subject.table, subjectKey), subject.activeCondition)})`,
  );
  owner.postconditions.push(
    ...guards,
    ...timeGuards,
    ...credentialGuards
      .filter((guard) => !semantic || guard.credentialId !== next.credentialId)
      .map((guard) => guard.condition),
  );

  return accepted ? { _tag: "Accepted" as const, record: next } : reject;
});
