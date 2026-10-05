import type { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  type PrepareEmailCommit,
  type EmailCommandId,
  type EmailRegistrationDecision,
  EmailUnavailable,
} from "@yielded/auth/Email";
import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  type PreparedCommit,
  LifecycleHooks,
  HookConfigurationError,
} from "@yielded/auth/Hooks";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import { type ProofCompletionPlan, ProofUnavailable } from "@yielded/auth/Proofs";
import type { TokenDigest } from "@yielded/auth/Schema";
import { SecurityRevision } from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- registration plans bridge consumer-owned Drizzle rows. */
import { and, eq, isNull } from "drizzle-orm";
import { Cause, DateTime, Effect, Schema } from "effect";

import {
  type AnyEmailRegistrationMapping,
  requiredEmailRegistrationConstraints,
} from "./email-model";
import { CurrentEmailSql, type EmailSqlDatabase, type EmailSqlQuery } from "./email-sql";
import { column, isMappedConstraintConflict, PersistenceMappingError, updateValues } from "./model";
import {
  CurrentProofSql,
  completeProofPlanIn,
  type ProofSqlConfiguration,
  type ProofSqlDatabase,
} from "./proof-sql";
import { validateDrizzleStorage } from "./storage-validation";

type Mapping<Registration> = AnyEmailRegistrationMapping<Registration>;
const unavailable = () => EmailUnavailable.make({});

const translateFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, EmailUnavailable, R> =>
  reportPersistenceFailure(
    effect,
    (error) =>
      Schema.is(EmailUnavailable)(error) ||
      Schema.is(ProofUnavailable)(error) ||
      Schema.is(HookConfigurationError)(error),
  ).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => unavailable()))));

const nowMillis = Effect.map(DateTime.now, DateTime.toEpochMillis);

export interface EmailRegistrationAuthority<Registration> {
  readonly inspect: (input: {
    readonly identifier: LoginIdentifier;
    readonly registration: Registration;
  }) => Effect.Effect<
    { readonly fingerprint: TokenDigest; readonly eligible: boolean },
    EmailUnavailable
  >;
  readonly registerWithProof: <A>(
    input: {
      readonly moduleId: string;
      readonly commandId: EmailCommandId;
      readonly identifier: LoginIdentifier;
      readonly registration: Registration;
      readonly fingerprint: TokenDigest;
      readonly completion: ProofCompletionPlan;
    },
    prepare: PrepareEmailCommit<EmailRegistrationDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, EmailUnavailable>;
}

export interface EmailRegistrationConfiguration {
  readonly mode: "interactive" | "synchronous";
  readonly locking: boolean;
  readonly standaloneGuard: Effect.Effect<void, EmailUnavailable>;
  readonly coordinated?: boolean;
  readonly generatedSubjectRows: (query: EmailSqlQuery) => EmailSqlQuery;
  readonly proof: {
    readonly mapping: any;
    readonly configuration: ProofSqlConfiguration;
  };
}

const selectRows = (query: EmailSqlQuery, locking: boolean) =>
  locking && typeof query.for === "function" ? query.for("update") : query;

const sameIdentifier = (left: LoginIdentifier, right: LoginIdentifier) =>
  left.namespace === right.namespace && left.value === right.value;

const validConstraints = <Registration>(mapping: Mapping<Registration>) => {
  if (
    mapping.constraints.request !== requiredEmailRegistrationConstraints.request ||
    mapping.constraints.pendingReference !== requiredEmailRegistrationConstraints.pendingReference
  )
    return false;
  if (mapping.mode === "pending") return true;

  return Object.entries(requiredEmailRegistrationConstraints).every(
    ([key, value]) =>
      mapping.constraints[key as keyof typeof requiredEmailRegistrationConstraints] === value,
  );
};

const allocate = <A>(
  mode: EmailRegistrationConfiguration["mode"],
  asynchronous: Effect.Effect<A, PersistenceMappingError> | undefined,
  synchronous: (() => A) | undefined,
) => {
  if (mode === "synchronous")
    return synchronous === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: synchronous,
          catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
        });
  if (asynchronous !== undefined) return asynchronous;

  return synchronous === undefined
    ? Effect.fail(unavailable())
    : Effect.try({
        try: synchronous,
        catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
      });
};

const registrationRows = Effect.fn("Drizzle.registrationRows")(function* <Registration>(
  mapping: Mapping<Registration>,
  moduleId: string,
  commandId: string,
  locking: boolean,
) {
  const database = yield* CurrentEmailSql;

  const module = column(mapping.registration.table, mapping.registration.moduleId);
  const command = column(mapping.registration.table, mapping.registration.commandId);

  return yield* selectRows(
    database
      .select()
      .from(mapping.registration.table)
      .where(and(eq(module, moduleId), eq(command, commandId)))
      .limit(1),
    locking,
  );
});

/** Discover before locking, then lock subject before identifier like the other
 * identity owners. A changed discovery is rejected rather than locking a second
 * subject in the opposite order. Proof authority separately enforces the host's
 * active/unverified eligibility policy in the same physical owner. */
export const readEmailRegistrationTarget = Effect.fnUntraced(function* <Registration>(
  mapping: Extract<Mapping<Registration>, { readonly mode: "atomic" }>,
  identifier: LoginIdentifier,
  locking: boolean,
) {
  const database = yield* CurrentEmailSql;
  const i = mapping.identifier;
  const s = mapping.subject;

  const lookup = () =>
    database
      .select()
      .from(i.table)
      .where(
        and(
          eq(column(i.table, i.namespace), identifier.namespace),
          eq(column(i.table, i.value), identifier.value),
        ),
      )
      .limit(1);

  const discovered = (yield* lookup())[0];

  if (discovered === undefined) return { _tag: "Absent" } as const;
  if (discovered[i.verifiedAt] !== null) return { _tag: "Rejected" } as const;
  const nativeSubjectId = discovered[i.subjectId];

  const subject = (yield* selectRows(
    database
      .select()
      .from(s.table)
      .where(eq(column(s.table, s.id), nativeSubjectId))
      .limit(1),
    locking,
  ))[0];

  const current = (yield* selectRows(lookup(), locking))[0];

  if (
    subject === undefined ||
    current === undefined ||
    current[i.verifiedAt] !== null ||
    !mapping.subjectId.equals(current[i.subjectId], nativeSubjectId) ||
    current[i.bindingRevision] !== discovered[i.bindingRevision]
  )
    return { _tag: "Rejected" } as const;

  return {
    _tag: "Reserved" as const,
    nativeSubjectId,
    bindingRevision: yield* Schema.decodeUnknownEffect(SecurityRevision)(
      current[i.bindingRevision],
    ),
    securityRevision: yield* Schema.decodeUnknownEffect(SecurityRevision)(
      subject[s.securityRevision],
    ),
  };
});

const owned = <A, E, R>(
  database: EmailSqlDatabase,
  configuration: EmailRegistrationConfiguration,
  body: Effect.Effect<A, E, R>,
) => {
  const run = coordinateCommit(
    () =>
      database.transaction((transaction) =>
        body.pipe(
          Effect.provideService(CurrentEmailSql, transaction),
          Effect.provideService(CurrentProofSql, transaction as unknown as ProofSqlDatabase),
        ),
      ),
    { mode: configuration.mode },
  ).pipe(Effect.map((result) => result.value));

  return configuration.coordinated !== true
    ? Effect.gen(function* () {
        if (yield* hasCommitScope) return yield* unavailable();
        yield* configuration.standaloneGuard;

        return yield* run;
      })
    : run;
};

const completionMatches = <Registration>(
  mapping: Mapping<Registration>,
  input: {
    readonly moduleId: string;
    readonly identifier: LoginIdentifier;
    readonly completion: ProofCompletionPlan;
  },
) => {
  const completion = input.completion.input;

  return (
    completion.moduleId === `${input.moduleId}/registration` &&
    completion.purpose === "email-code-registration" &&
    completion.binding._tag === "Identifier" &&
    sameIdentifier(completion.binding.identifier, input.identifier) &&
    validConstraints(mapping)
  );
};

const prepareReplay = Effect.fn("DrizzleEmailRegistration.prepareReplay")(function* <
  Registration,
  A,
>(
  mapping: Mapping<Registration>,
  row: any,
  fingerprint: TokenDigest,
  prepare: PrepareEmailCommit<EmailRegistrationDecision, A>,
) {
  const journal = yield* CurrentCommitJournal;

  if (row[mapping.registration.fingerprint] !== fingerprint)
    return prepare({ _tag: "Rejected" }, journal);

  return prepare(yield* mapping.registration.decodeReplay(row), journal);
});

const registerIn = Effect.fn("DrizzleEmailRegistration.registerIn")(function* <Registration, A>(
  mapping: Mapping<Registration>,
  configuration: EmailRegistrationConfiguration,
  input: {
    readonly moduleId: string;
    readonly commandId: string;
    readonly identifier: LoginIdentifier;
    readonly registration: Registration;
    readonly fingerprint: TokenDigest;
    readonly completion: ProofCompletionPlan;
  },
  inspected: { readonly fingerprint: TokenDigest; readonly eligible: boolean },
  allocated: {
    readonly credentialId?: string;
    readonly securityRevision?: SecurityRevision;
    readonly displacedSecurityRevision?: SecurityRevision;
    readonly identifierRevision?: SecurityRevision;
    readonly credentialRevision?: SecurityRevision;
    readonly nativeSubjectId?: unknown;
    readonly pendingReference?: string;
  },
  prepare: PrepareEmailCommit<EmailRegistrationDecision, A>,
) {
  const journal = yield* CurrentCommitJournal;

  const existing = (yield* registrationRows(
    mapping,
    input.moduleId,
    input.commandId,
    configuration.locking,
  ))[0];

  if (existing !== undefined)
    return yield* prepareReplay(mapping, existing, input.fingerprint, prepare);
  if (!completionMatches(mapping, input)) return prepare({ _tag: "Rejected" }, journal);
  if (!inspected.eligible || inspected.fingerprint !== input.fingerprint)
    return prepare({ _tag: "Rejected" }, journal);

  const target =
    mapping.mode === "atomic"
      ? yield* readEmailRegistrationTarget(mapping, input.identifier, configuration.locking)
      : undefined;

  if (target?._tag === "Rejected") return prepare({ _tag: "Rejected" }, journal);
  if (
    target?._tag === "Reserved" &&
    (allocated.displacedSecurityRevision === undefined ||
      allocated.displacedSecurityRevision === target.securityRevision ||
      allocated.identifierRevision === target.bindingRevision)
  )
    return yield* unavailable();
  const now = yield* nowMillis;

  const intent = {
    moduleId: input.moduleId,
    commandId: input.commandId,
    identifier: Object.freeze({ ...input.identifier }),
    registration: input.registration,
    fingerprint: input.fingerprint,
    completion: Object.freeze({
      moduleId: input.completion.input.moduleId,
      purpose: input.completion.input.purpose,
      continuationId: input.completion.input.continuationId,
      binding: input.completion.input.binding,
    }),
  };

  let decision: EmailRegistrationDecision | undefined;
  let nativeSubjectId = allocated.nativeSubjectId;

  const protectedMutation = Effect.gen(function* () {
    const transaction = yield* CurrentEmailSql;

    if (mapping.mode === "pending") {
      if (allocated.pendingReference === undefined) return false;
      decision = { _tag: "ProvisioningPending", reference: allocated.pendingReference };
      yield* transaction.insert(mapping.registration.table).values(
        mapping.registration.encodeInsert(intent, {
          state: "pending",
          pendingReference: allocated.pendingReference,
          retentionUntilMillis: now + mapping.retentionMillis,
        }),
      );
    } else {
      if (
        allocated.credentialId === undefined ||
        allocated.securityRevision === undefined ||
        allocated.identifierRevision === undefined ||
        allocated.credentialRevision === undefined
      )
        return false;

      const subjectInsert = transaction.insert(mapping.subject.table).values(
        mapping.provisioning.encodeSubjectInsert(intent, {
          nativeSubjectId,
          securityRevision: allocated.securityRevision,
        }),
      );

      if (mapping.provisioning.idMode === "generated") {
        const rows = yield* configuration.generatedSubjectRows(subjectInsert);

        nativeSubjectId = yield* mapping.provisioning.decodeGeneratedId(rows);
      } else yield* subjectInsert;
      if (nativeSubjectId === undefined) return false;
      if (target?._tag === "Reserved") {
        const i = mapping.identifier;
        const s = mapping.subject;

        // Change only mapped ownership columns. Never delete a consumer-owned
        // identifier row or copy insertion defaults over unrelated columns.
        yield* transaction
          .update(i.table)
          .set(
            updateValues([
              [i.subjectId, nativeSubjectId],
              [i.verifiedAt, mapping.encodeInstant(now)],
              [i.bindingRevision, allocated.identifierRevision],
            ]),
          )
          .where(
            and(
              eq(column(i.table, i.namespace), input.identifier.namespace),
              eq(column(i.table, i.value), input.identifier.value),
              eq(column(i.table, i.subjectId), target.nativeSubjectId),
              eq(column(i.table, i.bindingRevision), target.bindingRevision),
              isNull(column(i.table, i.verifiedAt)),
            ),
          );
        yield* transaction
          .update(s.table)
          .set(updateValues([[s.securityRevision, allocated.displacedSecurityRevision]]))
          .where(
            and(
              eq(column(s.table, s.id), target.nativeSubjectId),
              eq(column(s.table, s.securityRevision), target.securityRevision),
            ),
          );
      } else {
        yield* transaction.insert(mapping.identifier.table).values(
          mapping.identifier.encodeVerifiedInsert({
            identifier: input.identifier,
            subjectId: nativeSubjectId,
            verifiedAtMillis: now,
            bindingRevision: allocated.identifierRevision,
          }),
        );
      }
      yield* transaction.insert(mapping.credential.table).values(
        mapping.credential.encodeVerifiedInsert({
          moduleId: input.moduleId,
          subjectId: nativeSubjectId,
          credentialId: allocated.credentialId,
          identifier: input.identifier,
          credentialRevision: allocated.credentialRevision,
        }),
      );
      yield* transaction.insert(mapping.authorityCredential.table).values(
        mapping.authorityCredential.encodeInsert({
          subjectId: nativeSubjectId,
          credentialId: allocated.credentialId,
          revision: allocated.credentialRevision,
        }),
      );
      yield* transaction.insert(mapping.registration.table).values(
        mapping.registration.encodeInsert(intent, {
          state: "registered",
          nativeSubjectId,
          retentionUntilMillis: now + mapping.retentionMillis,
        }),
      );
      decision = { _tag: "Registered" };
    }
    const stored = (yield* registrationRows(mapping, input.moduleId, input.commandId, false))[0];
    const registrationModule = column(mapping.registration.table, mapping.registration.moduleId);
    const registrationCommand = column(mapping.registration.table, mapping.registration.commandId);

    const registrationFingerprint = column(
      mapping.registration.table,
      mapping.registration.fingerprint,
    );

    const registrationState = column(mapping.registration.table, mapping.registration.state);
    const registrationSubject = column(mapping.registration.table, mapping.registration.subjectId);

    const registrationReference = column(
      mapping.registration.table,
      mapping.registration.pendingReference,
    );

    const registrationRetention = column(
      mapping.registration.table,
      mapping.registration.retentionUntil,
    );

    const exactRegistration = yield* selectRows(
      transaction
        .select()
        .from(mapping.registration.table)
        .where(
          and(
            eq(registrationModule, input.moduleId),
            eq(registrationCommand, input.commandId),
            eq(registrationFingerprint, input.fingerprint),
            eq(registrationState, mapping.mode === "pending" ? "pending" : "registered"),
            eq(registrationRetention, mapping.encodeInstant(now + mapping.retentionMillis)),
            mapping.mode === "pending"
              ? and(
                  eq(registrationReference, allocated.pendingReference!),
                  isNull(registrationSubject),
                )
              : and(eq(registrationSubject, nativeSubjectId), isNull(registrationReference)),
          ),
        )
        .limit(1),
      false,
    );

    if (mapping.mode === "atomic" && nativeSubjectId !== undefined) {
      const subjectId = column(mapping.subject.table, mapping.subject.id);
      const identifierNamespace = column(mapping.identifier.table, mapping.identifier.namespace);
      const identifierValue = column(mapping.identifier.table, mapping.identifier.value);
      const identifierSubject = column(mapping.identifier.table, mapping.identifier.subjectId);
      const identifierVerifiedAt = column(mapping.identifier.table, mapping.identifier.verifiedAt);
      const credentialModule = column(mapping.credential.table, mapping.credential.moduleId);
      const credentialId = column(mapping.credential.table, mapping.credential.credentialId);
      const credentialSubject = column(mapping.credential.table, mapping.credential.subjectId);

      const credentialNamespace = column(
        mapping.credential.table,
        mapping.credential.identifierNamespace,
      );

      const credentialValue = column(mapping.credential.table, mapping.credential.identifierValue);

      const authoritySubject = column(
        mapping.authorityCredential.table,
        mapping.authorityCredential.subjectId,
      );

      const authorityId = column(
        mapping.authorityCredential.table,
        mapping.authorityCredential.credentialId,
      );

      const subject = (yield* selectRows(
        transaction
          .select()
          .from(mapping.subject.table)
          .where(eq(subjectId, nativeSubjectId))
          .limit(1),
        false,
      ))[0];

      const identifier = (yield* selectRows(
        transaction
          .select()
          .from(mapping.identifier.table)
          .where(
            and(
              eq(identifierNamespace, input.identifier.namespace),
              eq(identifierValue, input.identifier.value),
              eq(identifierSubject, nativeSubjectId),
              eq(identifierVerifiedAt, mapping.encodeInstant(now)),
            ),
          )
          .limit(1),
        false,
      ))[0];

      const credential = (yield* selectRows(
        transaction
          .select()
          .from(mapping.credential.table)
          .where(
            and(
              eq(credentialModule, input.moduleId),
              eq(credentialId, allocated.credentialId!),
              eq(credentialSubject, nativeSubjectId),
              eq(credentialNamespace, input.identifier.namespace),
              eq(credentialValue, input.identifier.value),
            ),
          )
          .limit(1),
        false,
      ))[0];

      const authority = (yield* selectRows(
        transaction
          .select()
          .from(mapping.authorityCredential.table)
          .where(
            and(eq(authoritySubject, nativeSubjectId), eq(authorityId, allocated.credentialId!)),
          )
          .limit(1),
        false,
      ))[0];

      const displaced =
        target?._tag === "Reserved"
          ? (yield* transaction
              .select()
              .from(mapping.subject.table)
              .where(
                and(
                  eq(subjectId, target.nativeSubjectId),
                  eq(
                    column(mapping.subject.table, mapping.subject.securityRevision),
                    allocated.displacedSecurityRevision,
                  ),
                ),
              )
              .limit(1))[0]
          : undefined;

      if (
        (target?._tag === "Reserved" && displaced === undefined) ||
        subject === undefined ||
        !mapping.subject.isActiveStatus(subject[mapping.subject.status]) ||
        subject[mapping.subject.securityRevision] !== allocated.securityRevision ||
        identifier === undefined ||
        identifier[mapping.identifier.bindingRevision] !== allocated.identifierRevision ||
        !mapping.identifier.isCurrent(identifier) ||
        credential === undefined ||
        credential[mapping.credential.credentialRevision] !== allocated.credentialRevision ||
        !mapping.credential.isActiveStatus(credential[mapping.credential.status]) ||
        authority === undefined ||
        authority[mapping.authorityCredential.revision] !== allocated.credentialRevision ||
        !mapping.authorityCredential.isActiveStatus(authority[mapping.authorityCredential.status])
      )
        return false;
    }

    return (
      stored !== undefined &&
      exactRegistration.length === 1 &&
      stored[mapping.registration.fingerprint] === input.fingerprint &&
      (mapping.mode === "pending" ||
        (nativeSubjectId !== undefined &&
          stored[mapping.registration.subjectId] !== null &&
          mapping.subjectId.equals(stored[mapping.registration.subjectId], nativeSubjectId)))
    );
  });

  let receipt: PreparedCommit<A> | undefined;

  yield* completeProofPlanIn(
    configuration.proof.mapping,
    configuration.proof.configuration,
    input.completion,
    protectedMutation,
    (completionDecision) => {
      receipt = prepare(
        completionDecision === "completed" && decision !== undefined
          ? decision
          : { _tag: "Rejected" },
        journal,
      );

      return completionDecision;
    },
  );

  return receipt ?? prepare({ _tag: "Rejected" }, journal);
});

const prepareConflict = Effect.fn("Drizzle.prepareConflict")(function* <Registration, A>(
  mapping: Mapping<Registration>,
  configuration: EmailRegistrationConfiguration,
  input: {
    readonly moduleId: string;
    readonly commandId: string;
    readonly fingerprint: TokenDigest;
  },
  prepare: PrepareEmailCommit<EmailRegistrationDecision, A>,
) {
  const database = yield* CurrentEmailSql;

  return yield* owned(
    database,
    configuration,
    Effect.gen(function* () {
      const journal = yield* CurrentCommitJournal;

      const row = (yield* registrationRows(
        mapping,
        input.moduleId,
        input.commandId,
        configuration.locking,
      ))[0];

      return row === undefined
        ? prepare({ _tag: "Rejected" }, journal)
        : yield* prepareReplay(mapping, row, input.fingerprint, prepare);
    }),
  );
});

export const makeSqlEmailRegistrationAuthority = Effect.fn("makeSqlEmailRegistrationAuthority")(
  function* <Registration>(
    mapping: Mapping<Registration>,
    configuration: EmailRegistrationConfiguration,
  ): Effect.fn.Return<
    EmailRegistrationAuthority<Registration>,
    EmailUnavailable,
    LifecycleHooks | CurrentEmailSql | NativeDatabase
  > {
    const database = yield* CurrentEmailSql;

    if (!configuration.coordinated)
      yield* validateDrizzleStorage({
        ...mapping,
        proof: configuration.proof.mapping,
      }).pipe(Effect.mapError(unavailable));
    const hooks = yield* LifecycleHooks;

    return {
      inspect: (input) =>
        mapping
          .inspect(input)
          .pipe(
            Effect.provideService(CurrentEmailSql, database),
            Effect.provideService(LifecycleHooks, hooks),
            translateFailure,
          ),
      registerWithProof: (input, prepare) =>
        Effect.gen(function* () {
          if (!validConstraints(mapping)) return yield* unavailable();

          const snapshot = (registration: Registration) =>
            configuration.mode === "synchronous" && configuration.coordinated === true
              ? mapping.snapshotRegistrationSync === undefined
                ? Effect.fail(unavailable())
                : Effect.try({
                    try: () => mapping.snapshotRegistrationSync!(registration),
                    catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
                  })
              : mapping.snapshotRegistration(registration);

          const storedRegistration = yield* snapshot(input.registration);
          const inspectionRegistration = yield* snapshot(input.registration);

          const capturedInput = Object.freeze({
            ...input,
            identifier: Object.freeze({ ...input.identifier }),
            registration: storedRegistration,
          });

          // Registration decoding and fingerprinting may suspend (for example while
          // hashing a detached Registration value). Finish that work before a
          // synchronous Durable Object transaction owner is entered.
          const inspectInput = {
            identifier: capturedInput.identifier,
            registration: inspectionRegistration,
          };

          const inspected =
            configuration.mode === "synchronous" && configuration.coordinated === true
              ? mapping.inspectSync === undefined
                ? yield* unavailable()
                : yield* Effect.try({
                    try: () => mapping.inspectSync!(inspectInput),
                    catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
                  })
              : yield* mapping.inspect(inspectInput);

          const atomic = mapping.mode === "atomic";

          const credentialId = atomic
            ? yield* allocate(
                configuration.mode,
                mapping.allocateCredentialId,
                mapping.allocateCredentialIdSync,
              )
            : undefined;

          const securityRevision = atomic
            ? yield* allocate(
                configuration.mode,
                mapping.allocateRevision,
                mapping.allocateRevisionSync,
              )
            : undefined;

          const displacedSecurityRevision = atomic
            ? yield* allocate(
                configuration.mode,
                mapping.allocateRevision,
                mapping.allocateRevisionSync,
              )
            : undefined;

          const identifierRevision = atomic
            ? yield* allocate(
                configuration.mode,
                mapping.allocateRevision,
                mapping.allocateRevisionSync,
              )
            : undefined;

          const credentialRevision = atomic
            ? yield* allocate(
                configuration.mode,
                mapping.allocateRevision,
                mapping.allocateRevisionSync,
              )
            : undefined;

          const nativeSubjectId =
            atomic && mapping.provisioning.idMode !== "generated"
              ? yield* allocate(
                  configuration.mode,
                  mapping.provisioning.allocateSubjectId,
                  mapping.provisioning.allocateSubjectIdSync,
                )
              : undefined;

          const pendingReference =
            mapping.mode === "pending"
              ? yield* allocate(
                  configuration.mode,
                  mapping.allocatePendingReference,
                  mapping.allocatePendingReferenceSync,
                )
              : undefined;

          const run = owned(
            database,
            configuration,
            Effect.gen(function* () {
              return yield* registerIn(
                mapping,
                configuration,
                capturedInput,
                inspected,
                {
                  ...(credentialId === undefined ? {} : { credentialId }),
                  ...(securityRevision === undefined ? {} : { securityRevision }),
                  ...(displacedSecurityRevision === undefined ? {} : { displacedSecurityRevision }),
                  ...(identifierRevision === undefined ? {} : { identifierRevision }),
                  ...(credentialRevision === undefined ? {} : { credentialRevision }),
                  ...(nativeSubjectId === undefined ? {} : { nativeSubjectId }),
                  ...(pendingReference === undefined ? {} : { pendingReference }),
                },
                prepare,
              );
            }),
          );

          return yield* run.pipe(
            Effect.catchCause((cause) => {
              const request =
                cause.reasons.every(Cause.isFailReason) &&
                isMappedConstraintConflict(mapping.isRequestConflict, cause);

              const conflict =
                mapping.mode === "atomic" &&
                ((cause.reasons.every(Cause.isFailReason) &&
                  isMappedConstraintConflict(mapping.isIdentifierConflict, cause)) ||
                  (cause.reasons.every(Cause.isFailReason) &&
                    isMappedConstraintConflict(mapping.isCredentialConflict, cause)));

              return request || conflict
                ? prepareConflict(mapping, configuration, capturedInput, prepare)
                : Effect.failCause(cause);
            }),
          );
        }).pipe(
          Effect.provideService(CurrentEmailSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    };
  },
);
