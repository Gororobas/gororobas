/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import {
  PasskeyClaim,
  type PasskeyAccess,
  type PasskeyAssertionVerified,
  type PasskeyCeremony,
  type PasskeyCredential,
  type PasskeyEvidence,
  type PasskeyMethodPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import type { SubjectId } from "@yielded/auth/Schema";
import { DateTime, Effect } from "effect";

import type { PasskeyFlowState } from "../models/passkey-model";
import type { QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import type { makePasskeyAdmissionKernel } from "./admission";
import type { CredentialRead, SubjectRead, makePasskeyCredentialsKernel } from "./credentials";
import type { makePasskeyRegistrationCustodyKernel } from "./registration-custody";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export interface FlowRead {
  readonly row: Record<string, any>;
  readonly ceremony: PasskeyCeremony;
  readonly policy: PasskeyMethodPolicy;
  readonly state: PasskeyFlowState;
  readonly claim?: PasskeyClaim;
  readonly credential?: PasskeyCredential;
}

export const makePasskeyFlowKernel = (
  operations: QueryOperations,
  admission: Pick<
    ReturnType<typeof makePasskeyAdmissionKernel>,
    | "admissionCondition"
    | "chargeScopes"
    | "guardAdmission"
    | "guardChargeSet"
    | "insertCharges"
    | "lockAdmission"
    | "readCharges"
  >,
  credentials: Pick<
    ReturnType<typeof makePasskeyCredentialsKernel>,
    "readCredential" | "readModule" | "readPolicyGuards" | "readRevision" | "readSubject"
  >,
  registrationCustody: Pick<
    ReturnType<typeof makePasskeyRegistrationCustodyKernel>,
    "releaseRegistrationCustody" | "scrubRegistrationIntent"
  >,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    | "ceremonyStorage"
    | "col"
    | "credentialStorage"
    | "equal"
    | "existsExact"
    | "invariant"
    | "mappedColumns"
    | "policyStorage"
    | "profileStorage"
    | "sameCredential"
    | "sameRevision"
    | "semanticCredentialColumns"
    | "subjectScope"
    | "targetScope"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;

  const {
    admissionCondition,
    chargeScopes,
    guardAdmission,
    guardChargeSet,
    insertCharges,
    lockAdmission,
    readCharges,
  } = admission;

  const { readCredential, readModule, readPolicyGuards, readRevision, readSubject } = credentials;
  const { releaseRegistrationCustody, scrubRegistrationIntent } = registrationCustody;

  const {
    ceremonyStorage,
    col,
    credentialStorage,
    equal,
    existsExact,
    mappedColumns,
    policyStorage,
    profileStorage,
    sameCredential,
    sameRevision,
    semanticCredentialColumns,
    subjectScope,
    targetScope,
  } = state;

  const invariant: (value: unknown) => asserts value = state.invariant;
  const { both } = transactions;

  const assertionPurposes = ["sign-in", "pending", "step-up", "action"] as const;

  const contextPurpose = {
    SignIn: "sign-in",
    Pending: "pending",
    StepUp: "step-up",
    Action: "action",
    Enrollment: "enrollment",
    Registration: "registration",
  } as const;

  const knownSubject = (ceremony: PasskeyCeremony): SubjectId | undefined =>
    "target" in ceremony.context
      ? ceremony.context.target.revision.subjectId
      : ceremony.context._tag === "Enrollment"
        ? ceremony.context.revision.subjectId
        : undefined;

  const compatiblePolicy = (
    ceremony: PasskeyCeremony,
    original: PasskeyMethodPolicy,
    current: PasskeyMethodPolicy,
  ) => {
    const selected = current.profiles.find(
      (profile) => profile.profileId === ceremony.profile.profileId,
    );

    const issued = original.profiles.find(
      (profile) => profile.profileId === ceremony.profile.profileId,
    );

    return (
      ceremony.generation === current.generation &&
      ceremony.generation === original.generation &&
      selected !== undefined &&
      issued !== undefined &&
      profileStorage.encode(selected) === profileStorage.encode(ceremony.profile) &&
      profileStorage.encode(issued) === profileStorage.encode(ceremony.profile) &&
      ceremony.claimLifetimeMillis === original.claimLifetimeMillis &&
      ceremony.expiresAtMillis > ceremony.issuedAtMillis &&
      ceremony.expiresAtMillis <= ceremony.requestBindingExpiresAtMillis &&
      ceremony.expiresAtMillis - ceremony.issuedAtMillis <= original.lifetimeMillis &&
      ceremony.expiresAtMillis - ceremony.issuedAtMillis <= current.lifetimeMillis &&
      ceremony.retentionUntilMillis === ceremony.issuedAtMillis + original.retentionMillis &&
      contextPurpose[ceremony.context._tag] === ceremony.purpose &&
      new Set(ceremony.allowedCredentials.map((item) => item.id)).size ===
        ceremony.allowedCredentials.length
    );
  };

  const liveCondition = (mapping: any, ceremony: PasskeyCeremony, claim?: PasskeyClaim) => {
    const now = mapping.clock.engineNowMillis;

    return both(
      sql`${now} >= ${ceremony.issuedAtMillis}`,
      sql`${now} < ${ceremony.expiresAtMillis}`,
      sql`${now} < ${ceremony.requestBindingExpiresAtMillis}`,
      "target" in ceremony.context
        ? sql`${now} < ${ceremony.context.target.expiresAtMillis}`
        : undefined,
      claim === undefined
        ? undefined
        : both(
            sql`${now} >= ${claim.claimedAtMillis}`,
            sql`${now} < ${claim.claimExpiresAtMillis}`,
          ),
    );
  };

  const matchesAccess = (ceremony: PasskeyCeremony, access: PasskeyAccess) =>
    ceremony.moduleId === access.moduleId &&
    ceremony.generation === access.generation &&
    ceremony.purpose === access.purpose &&
    ceremony.flowId === access.flowId &&
    ceremony.requestBindingVerifier === access.requestBindingVerifier &&
    ceremony.requestBindingExpiresAtMillis === access.requestBindingExpiresAtMillis;

  const readFlow = Effect.fn("passkey.readFlow")(function* (mapping: any, flowId: string) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.flow;

    const row = (yield* owner.read(
      table.table,
      equal(table.table, {
        [table.moduleId]: mapping.moduleId,
        [table.flowId]: flowId,
      }),
      { limit: 1, columns: mappedColumns(table) },
    )).rows[0];

    if (row === undefined) return undefined;
    const ceremony = ceremonyStorage.decode(row[table.snapshot]);
    const policy = policyStorage.decode(row[table.policySnapshot]);

    const state = Object.keys(table.states).find(
      (name) => table.states[name] === row[table.state],
    ) as PasskeyFlowState | undefined;

    invariant(
      state !== undefined && ceremony.moduleId === mapping.moduleId && ceremony.flowId === flowId,
    );
    invariant(
      row[table.moduleId] === ceremony.moduleId &&
        row[table.flowId] === ceremony.flowId &&
        row[table.commandId] === ceremony.commandId,
    );
    invariant(
      row[table.purpose] === ceremony.purpose && row[table.generation] === ceremony.generation,
    );
    invariant(
      row[table.requestBindingVerifier] === ceremony.requestBindingVerifier &&
        mapping.clock.decodeInstant(row[table.requestBindingExpiresAt]) ===
          ceremony.requestBindingExpiresAtMillis,
    );
    invariant(
      mapping.clock.decodeInstant(row[table.issuedAt]) === ceremony.issuedAtMillis &&
        mapping.clock.decodeInstant(row[table.expiresAt]) === ceremony.expiresAtMillis &&
        mapping.clock.decodeInstant(row[table.retentionUntil]) === ceremony.retentionUntilMillis,
    );
    invariant(compatiblePolicy(ceremony, policy, policy));

    const credential =
      row[table.credentialSnapshot] === null
        ? undefined
        : credentialStorage.decode(row[table.credentialSnapshot]);

    const subject = credential?.revision.subjectId ?? knownSubject(ceremony);

    invariant(
      row[table.subjectScope] === (subject === undefined ? null : subjectScope(subject)) &&
        row[table.targetScope] === targetScope(ceremony),
    );
    if (state === "Pending") {
      invariant(
        row[table.claimId] === null &&
          row[table.claimedAt] === null &&
          row[table.claimExpiresAt] === null &&
          credential === undefined,
      );

      return { row, ceremony, policy, state };
    }

    const claim =
      row[table.claimId] === null
        ? undefined
        : snapshotPasskeySync(PasskeyClaim, {
            ceremony,
            claimId: row[table.claimId],
            claimedAtMillis: mapping.clock.decodeInstant(row[table.claimedAt]),
            claimExpiresAtMillis: mapping.clock.decodeInstant(row[table.claimExpiresAt]),
          });

    invariant(state !== "Claimed" || claim !== undefined);
    if (claim !== undefined)
      invariant(
        claim.claimExpiresAtMillis ===
          Math.min(claim.claimedAtMillis + ceremony.claimLifetimeMillis, ceremony.expiresAtMillis),
      );

    return {
      row,
      ceremony,
      policy,
      state,
      ...(claim === undefined ? {} : { claim }),
      ...(credential === undefined ? {} : { credential }),
    };
  });

  const terminalFlow = Effect.fn("passkey.terminalFlow")(function* (
    mapping: any,
    read: FlowRead,
    state: "Verified" | "Rejected" | "Ambiguous",
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.flow;

    yield* owner.update(
      table.table,
      { [table.moduleId]: mapping.moduleId, [table.flowId]: read.ceremony.flowId },
      {
        [table.state]: table.states[state],
        [table.version]: owner.marker,
      },
    );
    owner.postconditions.push(
      yield* existsExact(table.table, {
        [table.moduleId]: mapping.moduleId,
        [table.flowId]: read.ceremony.flowId,
        [table.state]: table.states[state],
        [table.version]: owner.marker,
      }),
    );

    return state;
  });

  const targetRevision = (ceremony: PasskeyCeremony) =>
    "target" in ceremony.context
      ? ceremony.context.target.revision
      : ceremony.context._tag === "Enrollment"
        ? ceremony.context.revision
        : undefined;

  const currentTarget = Effect.fn("passkey.currentTarget")(function* (
    mapping: any,
    subject: SubjectRead | undefined,
    ceremony: PasskeyCeremony,
  ) {
    const target = targetRevision(ceremony);

    if (target === undefined) return true;
    if (
      subject === undefined ||
      subject.subjectId !== target.subjectId ||
      subject.securityRevision !== target.securityRevision
    )
      return false;

    const current = yield* readRevision(
      mapping.read,
      subject,
      target.credentials.map((item) => item.credentialId),
    );

    return current !== undefined && sameRevision(current, target);
  });

  const issueAssertion = Effect.fn("passkey.issueAssertion")(function* (
    mapping: any,
    ceremony: PasskeyCeremony,
    suppliedPolicy: PasskeyMethodPolicy,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const current = yield* readModule(mapping);

    if (
      current === undefined ||
      ceremony.moduleId !== mapping.moduleId ||
      !compatiblePolicy(ceremony, suppliedPolicy, current) ||
      policyStorage.encode(suppliedPolicy) !== policyStorage.encode(current)
    )
      return { _tag: "Rejected" } as const;
    yield* lockAdmission(mapping);
    const subjectId = knownSubject(ceremony);

    const subject =
      subjectId === undefined ? undefined : yield* readSubject(mapping.read, subjectId);

    yield* readPolicyGuards(mapping);
    if (!(yield* currentTarget(mapping, subject, ceremony))) return { _tag: "Rejected" } as const;
    if (
      ceremony.context._tag === "SignIn" &&
      (!ceremony.profile.primarySignIn ||
        ceremony.profile.userVerification !== "required" ||
        ceremony.profile.residentKey !== "required")
    )
      return { _tag: "Rejected" } as const;
    const table = mapping.flow;

    const sameCommand = yield* owner.read(
      table.table,
      equal(table.table, {
        [table.moduleId]: mapping.moduleId,
        [table.commandId]: ceremony.commandId,
      }),
      { limit: 1 },
    );

    const sameFlow = yield* readFlow(mapping, ceremony.flowId);

    if (sameCommand.rows.length !== 0 || sameFlow !== undefined)
      return { _tag: "Rejected" } as const;
    const kinds = chargeScopes(ceremony, subjectId).map((item) => item.kind);

    if (
      !(yield* owner.check(liveCondition(mapping, ceremony))) ||
      !(yield* owner.check(
        admissionCondition(mapping, [current], ceremony, subjectId, kinds, true, false),
      ))
    )
      return { _tag: "Rejected" } as const;

    const values = {
      ...table.encodeInsert({ ceremony, policy: suppliedPolicy, marker: owner.marker }),
      [table.moduleId]: ceremony.moduleId,
      [table.flowId]: ceremony.flowId,
      [table.commandId]: ceremony.commandId,
      [table.purpose]: ceremony.purpose,
      [table.state]: table.states.Pending,
      [table.version]: owner.marker,
      [table.generation]: ceremony.generation,
      [table.snapshot]: ceremonyStorage.encode(ceremony),
      [table.policySnapshot]: policyStorage.encode(suppliedPolicy),
      [table.requestBindingVerifier]: ceremony.requestBindingVerifier,
      [table.requestBindingExpiresAt]: mapping.clock.encodeInstant(
        ceremony.requestBindingExpiresAtMillis,
      ),
      [table.issuedAt]: mapping.clock.encodeInstant(ceremony.issuedAtMillis),
      [table.expiresAt]: mapping.clock.encodeInstant(ceremony.expiresAtMillis),
      [table.retentionUntil]: mapping.clock.encodeInstant(ceremony.retentionUntilMillis),
      [table.claimId]: null,
      [table.claimedAt]: null,
      [table.claimExpiresAt]: null,
      [table.credentialSnapshot]: null,
      [table.subjectScope]: subjectId === undefined ? null : subjectScope(subjectId),
      [table.targetScope]: targetScope(ceremony),
    };

    // Empty-key observations now expect this exact inserted row as well.
    const inserted = yield* owner.insert(table.table, values, {
      [table.moduleId]: mapping.moduleId,
      [table.flowId]: ceremony.flowId,
    });

    sameCommand.rows = inserted.rows;
    for (const observation of owner.observations)
      if (observation.table === table.table && observation.rows.length === 0)
        observation.rows = inserted.rows;
    yield* insertCharges(mapping, ceremony, suppliedPolicy, kinds, subjectId);
    yield* guardChargeSet(mapping, ceremony, subjectId);
    yield* guardAdmission(mapping, [current], ceremony, subjectId);
    owner.postconditions.push(liveCondition(mapping, ceremony));

    return { _tag: "Issued", ceremony } as const;
  });

  const contextAssertion = Effect.fn("passkey.contextAssertion")(function* (
    mapping: any,
    access: PasskeyAccess,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    if (access.moduleId !== mapping.moduleId) return undefined;
    const current = yield* readModule(mapping);

    if (current === undefined) return undefined;
    yield* readPolicyGuards(mapping);
    const read = yield* readFlow(mapping, access.flowId);

    if (
      read === undefined ||
      read.state !== "Pending" ||
      !matchesAccess(read.ceremony, access) ||
      !compatiblePolicy(read.ceremony, read.policy, current)
    )
      return undefined;
    if (!(yield* owner.check(liveCondition(mapping, read.ceremony)))) return undefined;
    owner.postconditions.push(liveCondition(mapping, read.ceremony));

    return read.ceremony;
  });

  const claimAssertion = Effect.fn("passkey.claimAssertion")(function* (
    mapping: any,
    input: {
      readonly access: PasskeyAccess;
      readonly policy: PasskeyMethodPolicy;
      readonly ceremony: PasskeyCeremony;
      readonly claimId: string;
      readonly credential?: PasskeyCredential;
    },
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const current = yield* readModule(mapping);

    if (current === undefined || input.access.moduleId !== mapping.moduleId)
      return { _tag: "Rejected" } as const;
    yield* lockAdmission(mapping);
    const expectedSubject = knownSubject(input.ceremony);
    const subjectId = expectedSubject ?? input.credential?.revision.subjectId;

    const subject =
      subjectId === undefined ? undefined : yield* readSubject(mapping.read, subjectId);

    yield* readPolicyGuards(mapping);

    const requested =
      targetRevision(input.ceremony)?.credentials.map((item) => item.credentialId) ??
      input.credential?.revision.credentials.map((item) => item.credentialId);

    const credential =
      input.credential === undefined || subject === undefined
        ? undefined
        : yield* readCredential(
            mapping.read,
            subject,
            input.ceremony.profile.rpId,
            input.credential.protocolCredentialId,
            requested,
          );

    const read = yield* readFlow(mapping, input.access.flowId);

    if (
      read === undefined ||
      read.state !== "Pending" ||
      !matchesAccess(read.ceremony, input.access)
    )
      return { _tag: "Rejected" } as const;
    invariant(ceremonyStorage.encode(read.ceremony) === ceremonyStorage.encode(input.ceremony));

    const reject = Effect.gen(function* () {
      yield* terminalFlow(mapping, read, "Rejected");

      return { _tag: "Rejected" } as const;
    });

    if (
      !compatiblePolicy(read.ceremony, read.policy, current) ||
      policyStorage.encode(input.policy) !== policyStorage.encode(current) ||
      !(yield* currentTarget(mapping, subject, read.ceremony))
    )
      return yield* reject;
    if (
      input.credential !== undefined &&
      (credential === undefined || !sameCredential(input.credential, credential.credential))
    )
      return yield* reject;
    if (input.credential !== undefined && credential !== undefined) {
      const original = input.credential.revision;
      const actual = credential.credential.revision;
      const ids = [...new Set([...(requested ?? []), input.credential.credentialId])];

      if (
        original.subjectId !== actual.subjectId ||
        original.securityRevision !== actual.securityRevision ||
        ids.some((id) => {
          const before = original.credentials.find((item) => item.credentialId === id);
          const after = actual.credentials.find((item) => item.credentialId === id);

          // A target can include non-passkey factors absent from the minimum
          // lookup snapshot; currentTarget independently checks those originals.
          return (
            after === undefined ||
            (before === undefined
              ? id === input.credential?.credentialId || targetRevision(read.ceremony) === undefined
              : before.revision !== after.revision)
          );
        })
      )
        return yield* reject;
    }
    if (!(yield* owner.check(liveCondition(mapping, read.ceremony)))) return yield* reject;
    yield* readCharges(mapping, read.ceremony, read.policy, expectedSubject);
    const resolved = expectedSubject === undefined && subjectId !== undefined;

    if (
      !(yield* owner.check(
        admissionCondition(
          mapping,
          [read.policy, current],
          read.ceremony,
          subjectId,
          resolved ? ["subject"] : [],
          false,
          resolved,
        ),
      ))
    )
      return yield* reject;
    const claimedAtMillis = yield* owner.now(mapping.clock);

    const claim = snapshotPasskeySync(PasskeyClaim, {
      ceremony: read.ceremony,
      claimId: input.claimId,
      claimedAtMillis,
      claimExpiresAtMillis: Math.min(
        claimedAtMillis + read.ceremony.claimLifetimeMillis,
        read.ceremony.expiresAtMillis,
      ),
    });

    const table = mapping.flow;

    yield* owner.update(
      table.table,
      { [table.moduleId]: mapping.moduleId, [table.flowId]: read.ceremony.flowId },
      {
        [table.state]: table.states.Claimed,
        [table.version]: owner.marker,
        [table.claimId]: claim.claimId,
        [table.claimedAt]: mapping.clock.encodeInstant(claim.claimedAtMillis),
        [table.claimExpiresAt]: mapping.clock.encodeInstant(claim.claimExpiresAtMillis),
        [table.credentialSnapshot]:
          input.credential === undefined ? null : credentialStorage.encode(input.credential),
        [table.subjectScope]: subjectId === undefined ? null : subjectScope(subjectId),
      },
    );
    if (resolved) yield* insertCharges(mapping, read.ceremony, read.policy, ["subject"], subjectId);
    yield* guardChargeSet(mapping, read.ceremony, subjectId);
    yield* guardAdmission(mapping, [read.policy, current], read.ceremony, subjectId);
    owner.postconditions.push(liveCondition(mapping, read.ceremony, claim));

    return { _tag: "Claimed", claim } as const;
  });

  const exactClaim = (read: FlowRead, claim: PasskeyClaim) =>
    read.state === "Claimed" &&
    read.claim !== undefined &&
    read.claim.claimId === claim.claimId &&
    read.claim.claimedAtMillis === claim.claimedAtMillis &&
    read.claim.claimExpiresAtMillis === claim.claimExpiresAtMillis &&
    ceremonyStorage.encode(read.ceremony) === ceremonyStorage.encode(claim.ceremony);

  const evidenceMatches = (
    ceremony: PasskeyCeremony,
    captured: PasskeyCredential,
    credential: PasskeyCredential,
    assertion: PasskeyAssertionVerified,
    evidence: typeof PasskeyEvidence.Type,
  ) => {
    const proof = evidence.proofs[0];
    const target = targetRevision(ceremony);
    const original = target ?? captured.revision;

    const ids = [
      ...new Set([
        ...original.credentials.map((item) => item.credentialId),
        credential.credentialId,
      ]),
    ];

    const expected = {
      ...credential.revision,
      credentials: credential.revision.credentials.filter((item) =>
        ids.includes(item.credentialId),
      ),
    };

    const selected = captured.revision.credentials.find(
      (item) => item.credentialId === credential.credentialId,
    );

    return (
      evidence.proofs.length === 1 &&
      proof !== undefined &&
      proof.method === "passkey" &&
      proof.credentialId === credential.credentialId &&
      proof.factors.length === 1 &&
      proof.factors[0] === "possession" &&
      proof.userVerified === assertion.userVerified &&
      proof.phishingResistant &&
      DateTime.toEpochMillis(proof.verifiedAt) === ceremony.issuedAtMillis &&
      evidence.flowId ===
        ("target" in ceremony.context ? ceremony.context.target.flowId : ceremony.flowId) &&
      evidence.bindingDigest ===
        ("target" in ceremony.context
          ? ceremony.context.target.bindingDigest
          : ceremony.requestBindingVerifier) &&
      expected.credentials.length === ids.length &&
      sameRevision(evidence.revision, expected) &&
      original.subjectId === expected.subjectId &&
      original.securityRevision === expected.securityRevision &&
      original.credentials.every((item) =>
        expected.credentials.some(
          (current) =>
            current.credentialId === item.credentialId && current.revision === item.revision,
        ),
      ) &&
      selected !== undefined &&
      expected.credentials.some(
        (item) =>
          item.credentialId === selected.credentialId && item.revision === selected.revision,
      )
    );
  };

  const updateTelemetry = Effect.fn("passkey.updateTelemetry")(function* (
    mapping: any,
    found: CredentialRead,
    assertion: PasskeyAssertionVerified,
    dialect: "pg" | "mysql" | "sqlite",
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.read.credential;
    const counter = sql`${col(table.table, table.counter)}`;
    const maximum = sql`${col(table.table, table.maximumCounter)}`;

    const max = (...values: ReadonlyArray<ReturnType<QueryOperations["sql"]>>) =>
      dialect === "sqlite"
        ? sql`max(${sql.join([...values], sql`, `)})`
        : sql`greatest(${sql.join([...values], sql`, `)})`;

    const semantic = Object.fromEntries(
      semanticCredentialColumns(table).map((column) => [column, found.row[column]]),
    );

    const bs = mapping.telemetry.encodeBackupState(assertion.backupState);
    const synced = found.credential.backupEligible;
    const merged = max(counter, maximum, sql`${assertion.counter}`);

    const currentCounter = synced
      ? sql`1 = 1`
      : sql`((${counter} = 0 and ${assertion.counter} = 0) or ${counter} < ${assertion.counter})`;

    yield* owner.updateGuarded(
      table.table,
      both(owner.exact(table.table, semantic), table.activeCondition, currentCounter),
      {
        [table.counter]: synced ? merged : assertion.counter,
        [table.maximumCounter]: merged,
        [table.backupState]: bs,
      },
      {
        rows: 1,
        postcondition: yield* existsExact(
          table.table,
          { ...semantic, [table.backupState]: bs },
          both(
            synced ? sql`${counter} = ${maximum}` : sql`${counter} = ${assertion.counter}`,
            sql`${maximum} >= ${assertion.counter}`,
          ),
        ),
      },
    );
    const earliest = yield* owner.now(mapping.clock);
    const lastUsed = sql`${col(table.table, mapping.telemetry.lastUsedAt)}`;
    const millis = mapping.clock.toMillis(lastUsed);

    yield* owner.finalUpdate(
      table.table,
      owner.exact(table.table, semantic),
      {
        [mapping.telemetry.lastUsedAt]: mapping.clock.fromMillis(
          max(sql`coalesce(${millis}, 0)`, mapping.clock.engineNowMillis),
        ),
      },
      {
        rows: 1,
        postcondition: yield* existsExact(
          table.table,
          semantic,
          both(sql`${millis} >= ${earliest}`, sql`${millis} <= ${mapping.clock.engineNowMillis}`),
        ),
      },
    );
  });

  const settleAssertion = Effect.fn("passkey.settleAssertion")(function* (
    mapping: any,
    claim: PasskeyClaim,
    outcome:
      | { readonly _tag: "Rejected" | "Ambiguous" }
      | {
          readonly _tag: "Assertion";
          readonly credential: PasskeyCredential;
          readonly assertion: PasskeyAssertionVerified;
          readonly evidence: typeof PasskeyEvidence.Type;
        },
    dialect: "pg" | "mysql" | "sqlite",
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const assertedCredential = outcome._tag === "Assertion" ? outcome.credential : undefined;
    const current = yield* readModule(mapping);

    if (current === undefined || claim.ceremony.moduleId !== mapping.moduleId)
      return "Rejected" as const;
    yield* lockAdmission(mapping);

    const originalIds =
      targetRevision(claim.ceremony)?.credentials.map((item) => item.credentialId) ??
      (outcome._tag === "Assertion"
        ? outcome.credential.revision.credentials.map((item) => item.credentialId)
        : undefined);

    const subjectId =
      outcome._tag === "Assertion"
        ? outcome.credential.revision.subjectId
        : knownSubject(claim.ceremony);

    const subject =
      subjectId === undefined ? undefined : yield* readSubject(mapping.read, subjectId);

    yield* readPolicyGuards(mapping);

    const found =
      outcome._tag !== "Assertion" || subject === undefined
        ? undefined
        : yield* readCredential(
            mapping.read,
            subject,
            claim.ceremony.profile.rpId,
            outcome.credential.protocolCredentialId,
            originalIds,
          );

    const read = yield* readFlow(mapping, claim.ceremony.flowId);

    if (read === undefined || !exactClaim(read, claim)) return "Rejected" as const;
    if (outcome._tag !== "Assertion") return yield* terminalFlow(mapping, read, outcome._tag);
    invariant(assertedCredential !== undefined);
    const captured = "credential" in read ? read.credential : undefined;
    const assertion = outcome.assertion;

    if (
      captured === undefined ||
      found === undefined ||
      !compatiblePolicy(read.ceremony, read.policy, current) ||
      !sameCredential(captured, assertedCredential) ||
      !sameCredential(captured, found.credential)
    )
      return yield* terminalFlow(mapping, read, "Rejected");
    const credential = found.credential;
    const profile = read.ceremony.profile;

    if (
      assertion.protocolCredentialId !== credential.protocolCredentialId ||
      (assertion.userHandle !== undefined && assertion.userHandle !== credential.userHandle) ||
      assertion.backupEligible !== credential.backupEligible ||
      (assertion.backupState && !assertion.backupEligible) ||
      (profile.userVerification === "required" && !assertion.userVerified) ||
      !profile.algorithms.includes(credential.algorithm) ||
      (read.ceremony.allowedCredentials.length !== 0 &&
        !read.ceremony.allowedCredentials.some(
          (item) => item.id === credential.protocolCredentialId,
        )) ||
      (read.ceremony.purpose === "sign-in" &&
        (assertion.userHandle !== credential.userHandle ||
          !credential.primarySignIn ||
          !credential.enrollmentUserVerified ||
          !credential.profile.primarySignIn ||
          credential.profile.userVerification !== "required" ||
          !assertion.userVerified)) ||
      !evidenceMatches(read.ceremony, captured, credential, assertion, outcome.evidence) ||
      !(yield* owner.check(liveCondition(mapping, read.ceremony, claim)))
    )
      return yield* terminalFlow(mapping, read, "Rejected");
    yield* readCharges(mapping, read.ceremony, read.policy, credential.revision.subjectId);
    yield* guardChargeSet(mapping, read.ceremony, credential.revision.subjectId);
    yield* updateTelemetry(mapping, found, assertion, dialect);
    yield* terminalFlow(mapping, read, "Verified");
    owner.postconditions.push(liveCondition(mapping, read.ceremony, claim));

    return "Verified" as const;
  });

  const purposeCondition = (table: any, purposes: ReadonlyArray<string>) =>
    sql`${col(table.table, table.purpose)} in (${sql.join(
      purposes.map((purpose) => sql`${purpose}`),
      sql`, `,
    )})`;

  const custodyFree = (mapping: any, flowExpression: ReturnType<QueryOperations["sql"]>) => {
    if (mapping.intent === undefined) return sql`1 = 1`;
    const intent = mapping.intent;

    return sql`not exists (select 1 from ${intent.table} where ${both(
      equal(intent.table, { [intent.moduleId]: mapping.moduleId }),
      sql`${col(intent.table, intent.flowId)} = ${flowExpression}`,
      intent.custodyCondition,
    )})`;
  };

  const flowDue = (mapping: any, purposes: ReadonlyArray<string>) => {
    const flow = mapping.flow,
      charge = mapping.charge,
      now = mapping.clock.engineNowMillis;

    const state = sql`${col(flow.table, flow.state)}`;
    const retained = sql`${mapping.clock.toMillis(sql`${col(flow.table, flow.retentionUntil)}`)} <= ${now}`;

    const chargeLive = sql`exists (select 1 from ${charge.table} where ${both(
      equal(charge.table, { [charge.moduleId]: mapping.moduleId }),
      sql`${col(charge.table, charge.flowId)} = ${col(flow.table, flow.flowId)}`,
      sql`(${col(charge.table, charge.retainUntil)} is null or ${mapping.clock.toMillis(sql`${col(charge.table, charge.retainUntil)}`)} > ${now})`,
    )})`;

    return both(
      equal(flow.table, { [flow.moduleId]: mapping.moduleId }),
      purposeCondition(flow, purposes),
      sql`((${state} = ${flow.states.Pending} and ${mapping.clock.toMillis(sql`${col(flow.table, flow.expiresAt)}`)} <= ${now}) or
        (${state} = ${flow.states.Claimed} and ${mapping.clock.toMillis(sql`${col(flow.table, flow.claimExpiresAt)}`)} <= ${now}) or
        (${state} in (${flow.states.Verified}, ${flow.states.Rejected}, ${flow.states.Ambiguous}, ${flow.states.RegistrationAccepted}) and ${retained} and not (${chargeLive}) and ${custodyFree(mapping, sql`${col(flow.table, flow.flowId)}`)}))`,
    );
  };

  const chargeDue = (mapping: any, purposes: ReadonlyArray<string>) => {
    const charge = mapping.charge;

    return both(
      equal(charge.table, { [charge.moduleId]: mapping.moduleId }),
      purposeCondition(charge, purposes),
      sql`${col(charge.table, charge.admittedAt)} is not null and ${mapping.clock.toMillis(sql`${col(charge.table, charge.retainUntil)}`)} <= ${mapping.clock.engineNowMillis}`,
      custodyFree(mapping, sql`${col(charge.table, charge.flowId)}`),
    );
  };

  /** Flow transitions and row removals share one bound. Prepared hasMore is
   * predicted from this owner's staged changes, then asserted after final writes. */
  const cleanupCeremonies = Effect.fn("passkey.cleanupCeremonies")(function* (
    mapping: any,
    input: { readonly moduleId: string; readonly nowMillis: number; readonly limit: number },
    purposes: ReadonlyArray<string>,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    invariant(
      input.moduleId === mapping.moduleId &&
        Number.isSafeInteger(input.nowMillis) &&
        input.nowMillis >= 0 &&
        Number.isSafeInteger(input.limit) &&
        input.limit >= 1 &&
        input.limit <= 1000,
    );
    yield* readModule(mapping);
    yield* lockAdmission(mapping);
    yield* readPolicyGuards(mapping);

    const flow = mapping.flow,
      charge = mapping.charge;

    const rows = (yield* owner.read(flow.table, flowDue(mapping, purposes), {
      limit: input.limit,
      takeOnly: true,
      observe: false,
      orderBy: sql`${col(flow.table, flow.flowId)}`,
    })).rows;

    const touched: string[] = [];
    const transitioned: FlowRead[] = [];

    let terminalized = 0,
      removed = 0;

    for (const candidate of rows) {
      const read = yield* readFlow(mapping, candidate[flow.flowId]);

      if (read === undefined) continue;
      invariant(
        yield* owner.check(
          sql`exists (select 1 from ${flow.table} where ${both(equal(flow.table, { [flow.moduleId]: mapping.moduleId, [flow.flowId]: read.ceremony.flowId }), flowDue(mapping, purposes))})`,
        ),
      );
      touched.push(read.ceremony.flowId);
      if (read.state === "Pending" || read.state === "Claimed") {
        const deadline =
          read.state === "Pending"
            ? read.ceremony.expiresAtMillis
            : read.claim!.claimExpiresAtMillis;

        if (read.state === "Pending") yield* releaseRegistrationCustody(mapping, read.ceremony);
        yield* terminalFlow(mapping, read, read.state === "Pending" ? "Rejected" : "Ambiguous");
        owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${deadline}`);
        transitioned.push(read);
        terminalized++;
      } else {
        yield* scrubRegistrationIntent(mapping, read.ceremony);
        yield* owner.remove(flow.table, {
          [flow.moduleId]: mapping.moduleId,
          [flow.flowId]: read.ceremony.flowId,
        });
        owner.postconditions.push(
          sql`${mapping.clock.engineNowMillis} >= ${read.ceremony.retentionUntilMillis}`,
          custodyFree(mapping, sql`${read.ceremony.flowId}`),
          sql`not exists (select 1 from ${charge.table} where ${both(
            equal(charge.table, {
              [charge.moduleId]: mapping.moduleId,
              [charge.flowId]: read.ceremony.flowId,
            }),
            sql`(${col(charge.table, charge.retainUntil)} is null or ${mapping.clock.toMillis(sql`${col(charge.table, charge.retainUntil)}`)} > ${mapping.clock.engineNowMillis})`,
          )})`,
        );
        removed++;
      }
    }
    const removedCharges: Array<{ flowId: string; kind: string }> = [];
    const remaining = input.limit - terminalized - removed;

    if (remaining > 0) {
      const charges = (yield* owner.read(charge.table, chargeDue(mapping, purposes), {
        limit: remaining,
        takeOnly: true,
        observe: false,
        orderBy: sql`${col(charge.table, charge.flowId)}, ${col(charge.table, charge.kind)}`,
      })).rows;

      for (const candidate of charges) {
        const identity = {
          [charge.moduleId]: mapping.moduleId,
          [charge.flowId]: candidate[charge.flowId],
          [charge.kind]: candidate[charge.kind],
        };

        const selected = (yield* owner.read(charge.table, equal(charge.table, identity), {
          limit: 1,
        })).rows[0];

        invariant(selected !== undefined);
        const horizon = mapping.clock.decodeInstant(selected[charge.retainUntil]);

        invariant(Number.isSafeInteger(horizon));
        yield* owner.remove(charge.table, identity);
        owner.postconditions.push(
          sql`${mapping.clock.engineNowMillis} >= ${horizon}`,
          custodyFree(mapping, sql`${candidate[charge.flowId]}`),
        );
        removedCharges.push({ flowId: candidate[charge.flowId], kind: candidate[charge.kind] });
        removed++;
      }
    }

    const excludeFlows =
      touched.length === 0
        ? undefined
        : sql`${col(flow.table, flow.flowId)} not in (${sql.join(
            touched.map((id) => sql`${id}`),
            sql`, `,
          )})`;

    const excludeCharges = removedCharges.map(
      (item) =>
        sql`not (${equal(charge.table, { [charge.flowId]: item.flowId, [charge.kind]: item.kind })})`,
    );

    const predicted = sql`exists (select 1 from ${flow.table} where ${both(flowDue(mapping, purposes), excludeFlows)}) or exists (select 1 from ${charge.table} where ${both(chargeDue(mapping, purposes), ...excludeCharges)})`;
    // A transitioned row cannot also be removed by this call, but may be due now.
    // Read through check only for unchanged rows; D1's prebatch assertion must use
    // this predictive predicate, while the final assertion uses actual states.
    let hasMore = yield* owner.check(predicted);

    for (const read of transitioned) {
      if (read.ceremony.retentionUntilMillis > (yield* owner.now(mapping.clock))) continue;
      const liveCharges = sql`exists (select 1 from ${charge.table} where ${both(equal(charge.table, { [charge.moduleId]: mapping.moduleId, [charge.flowId]: read.ceremony.flowId }), sql`${mapping.clock.toMillis(sql`${col(charge.table, charge.retainUntil)}`)} > ${mapping.clock.engineNowMillis}`, ...excludeCharges)})`;

      if (
        !(yield* owner.check(liveCharges)) &&
        (yield* owner.check(custodyFree(mapping, sql`${read.ceremony.flowId}`)))
      )
        hasMore = true;
    }
    const actual = sql`exists (select 1 from ${flow.table} where ${flowDue(mapping, purposes)}) or exists (select 1 from ${charge.table} where ${chargeDue(mapping, purposes)})`;

    owner.postconditions.push(hasMore ? actual : sql`not (${actual})`);

    return { terminalized, removed, hasMore };
  });

  return {
    assertionPurposes,
    contextPurpose,
    knownSubject,
    compatiblePolicy,
    liveCondition,
    matchesAccess,
    readFlow,
    terminalFlow,
    issueAssertion,
    contextAssertion,
    claimAssertion,
    exactClaim,
    settleAssertion,
    cleanupCeremonies,
  };
};
