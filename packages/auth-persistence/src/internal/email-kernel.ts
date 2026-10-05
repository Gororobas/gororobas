import {
  EmailAddressPersistence,
  type EmailAddressMutation,
  type EmailAction,
  type EmailCredentialSnapshot,
  EmailSignInTargets,
  EmailUnavailable,
  snapshotEmailCredential,
  snapshotEmailRequirement,
  snapshotEmailRevision,
} from "@yielded/auth/Email";
import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  type CommitJournal,
  type PreparedCommit,
  LifecycleHooks,
  HookConfigurationError,
} from "@yielded/auth/Hooks";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import {
  ProofUnavailable,
  type ProofCompletionDecision,
  type ProofCompletionInput,
} from "@yielded/auth/Proofs";
import {
  assessAuthentication,
  snapshotAuthenticationEvidence,
  type AuthenticationRevision,
  type SecurityRevision,
} from "@yielded/auth/Sessions";
import { Cause, Context, DateTime, Effect, Option, Schema } from "effect";
import type * as SqlError from "effect/sql/SqlError";

import { isMappedConstraintConflict, PersistenceMappingError } from "./mapping-error";
import {
  type AnyEmailAddressMapping,
  type AnyEmailSignInMapping,
  requiredEmailAddressConstraints,
  requiredEmailSignInConstraints,
} from "./models/email-model";
import {
  CurrentProofSql,
  type makeProofKernel,
  type ProofSqlConfiguration,
  type ProofSqlDatabase,
} from "./proof-kernel";
/* oxlint-disable no-explicit-any -- the shared dialect kernel erases consumer Drizzle table types internally. */
import type { QueryFailure } from "./query-operations";
import type { QueryOperations, SqlFragment, SqlColumn } from "./query-operations";
import type { NativeDatabase } from "./transaction-kernel";

type AdapterFailure = QueryFailure | PersistenceMappingError | SqlError.SqlError;
type SignInMapping = AnyEmailSignInMapping;

export interface EmailSqlQuery<A = ReadonlyArray<any>> extends Effect.Effect<A, AdapterFailure> {
  readonly getSQL: () => ReturnType<QueryOperations["sql"]>;
  readonly from: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly where: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly limit: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly orderBy: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly for: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly set: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly values: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly returning: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly innerJoin: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly onConflictDoNothing: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly onDuplicateKeyUpdate: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
  readonly $returningId: (...args: ReadonlyArray<any>) => EmailSqlQuery<A>;
}

export interface EmailSqlDatabase {
  readonly select: (...args: ReadonlyArray<any>) => EmailSqlQuery;
  readonly insert: (...args: ReadonlyArray<any>) => EmailSqlQuery;
  readonly update: (...args: ReadonlyArray<any>) => EmailSqlQuery;
  readonly delete: (...args: ReadonlyArray<any>) => EmailSqlQuery;
  readonly transaction: <A, E, R>(
    body: (transaction: EmailSqlDatabase) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
}

export class CurrentEmailSql extends Context.Service<CurrentEmailSql, EmailSqlDatabase>()(
  "effect-auth/CurrentEmailSql",
) {}

export interface EmailSqlConfiguration {
  readonly mode: "interactive" | "synchronous";
  readonly locking: boolean;
  readonly standaloneGuard: Effect.Effect<void, EmailUnavailable>;
  readonly coordinated?: boolean;
  readonly proof?: {
    readonly mapping: any;
    readonly configuration: ProofSqlConfiguration;
  };
}

export interface CurrentAddress {
  readonly nativeSubjectId: unknown;
  readonly subject: any;
  readonly revision: AuthenticationRevision;
  readonly source?: {
    readonly credential: any;
    readonly identifier: any;
    readonly snapshot: EmailCredentialSnapshot;
  };
  readonly targetIdentifier?: any;
  readonly targetCredential?: any;
  readonly targetIdentifierRevision?: SecurityRevision;
  readonly eligible: boolean;
}

export const makeEmailKernel = <
  Fragment extends SqlFragment = SqlFragment,
  Column extends SqlColumn = SqlColumn,
>(
  operations: QueryOperations<Fragment, Column>,
  proofs: Pick<ReturnType<typeof makeProofKernel>, "completeProofPlanIn">,
) => {
  type AddressMapping = AnyEmailAddressMapping<Fragment>;

  const { and, eq, inArray, lte, column, updateValues } = operations;
  const { completeProofPlanIn } = proofs;
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

  const selectRows = (query: EmailSqlQuery, locking: boolean) =>
    locking && typeof query.for === "function" ? query.for("update") : query;

  const sameIdentifier = (left: LoginIdentifier, right: LoginIdentifier) =>
    left.namespace === right.namespace && left.value === right.value;

  const validEmailSignInConstraints = (mapping: SignInMapping) =>
    Object.entries(requiredEmailSignInConstraints).every(
      ([key, value]) =>
        mapping.constraints[key as keyof typeof requiredEmailSignInConstraints] === value,
    );

  const validAddressConstraints = (mapping: AddressMapping) =>
    Object.entries(requiredEmailAddressConstraints).every(
      ([key, value]) =>
        mapping.constraints[key as keyof typeof requiredEmailAddressConstraints] === value,
    );

  const subjectColumns = (mapping: SignInMapping) => ({
    id: column(mapping.subject.table, mapping.subject.id),
    status: column(mapping.subject.table, mapping.subject.status),
    securityRevision: column(mapping.subject.table, mapping.subject.securityRevision),
  });

  const identifierColumns = (mapping: SignInMapping) => ({
    namespace: column(mapping.identifier.table, mapping.identifier.namespace),
    value: column(mapping.identifier.table, mapping.identifier.value),
    subjectId: column(mapping.identifier.table, mapping.identifier.subjectId),
    verifiedAt: column(mapping.identifier.table, mapping.identifier.verifiedAt),
    bindingRevision: column(mapping.identifier.table, mapping.identifier.bindingRevision),
  });

  const credentialColumns = (mapping: SignInMapping) => ({
    moduleId: column(mapping.credential.table, mapping.credential.moduleId),
    subjectId: column(mapping.credential.table, mapping.credential.subjectId),
    credentialId: column(mapping.credential.table, mapping.credential.credentialId),
    identifierNamespace: column(mapping.credential.table, mapping.credential.identifierNamespace),
    identifierValue: column(mapping.credential.table, mapping.credential.identifierValue),
    credentialRevision: column(mapping.credential.table, mapping.credential.credentialRevision),
    status: column(mapping.credential.table, mapping.credential.status),
  });

  const authorityColumns = (mapping: AddressMapping) => ({
    subjectId: column(mapping.authorityCredential.table, mapping.authorityCredential.subjectId),
    credentialId: column(
      mapping.authorityCredential.table,
      mapping.authorityCredential.credentialId,
    ),
    revision: column(mapping.authorityCredential.table, mapping.authorityCredential.revision),
    status: column(mapping.authorityCredential.table, mapping.authorityCredential.status),
  });

  const commandColumns = (mapping: AddressMapping) => ({
    moduleId: column(mapping.command.table, mapping.command.moduleId),
    commandId: column(mapping.command.table, mapping.command.commandId),
    action: column(mapping.command.table, mapping.command.action),
    bindingDigest: column(mapping.command.table, mapping.command.bindingDigest),
    retentionUntil: column(mapping.command.table, mapping.command.retentionUntil),
  });

  const allocate = <A>(
    mode: EmailSqlConfiguration["mode"],
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

  const nextSecurityRevision = (
    mapping: AddressMapping,
    mode: EmailSqlConfiguration["mode"],
    current: SecurityRevision,
  ) => {
    if (mode === "synchronous")
      return mapping.subject.nextSecurityRevisionSync === undefined
        ? Effect.fail(unavailable())
        : Effect.try({
            try: () => mapping.subject.nextSecurityRevisionSync!(current),
            catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
          });
    if (mapping.subject.nextSecurityRevision !== undefined)
      return mapping.subject.nextSecurityRevision(current);
    if (mapping.subject.nextSecurityRevisionSync !== undefined)
      return Effect.try({
        try: () => mapping.subject.nextSecurityRevisionSync!(current),
        catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
      });

    return Effect.fail(unavailable());
  };

  const safeRead = <A, E, R>(
    database: EmailSqlDatabase,
    configuration: EmailSqlConfiguration,
    body: Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      if (configuration.coordinated !== true) {
        if (yield* hasCommitScope) return yield* unavailable();
        yield* configuration.standaloneGuard;
      }

      return yield* database.transaction((transaction) =>
        body.pipe(
          Effect.provideService(CurrentEmailSql, transaction),
          Effect.provideService(CurrentProofSql, transaction as unknown as ProofSqlDatabase),
        ),
      );
    });

  const owned = <A, E, R>(
    database: EmailSqlDatabase,
    configuration: EmailSqlConfiguration,
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

  const emailLookupQuery = (
    mapping: SignInMapping,
    moduleId: string,
    identifier: LoginIdentifier,
  ) => {
    const subject = subjectColumns(mapping),
      binding = identifierColumns(mapping),
      credential = credentialColumns(mapping);

    return {
      fields: {
        subject: mapping.subject.table,
        identifier: mapping.identifier.table,
        credential: mapping.credential.table,
      },
      from: mapping.identifier.table,
      subjectTable: mapping.subject.table,
      subjectJoin: eq(subject.id, binding.subjectId),
      credentialTable: mapping.credential.table,
      credentialJoin: and(
        eq(credential.moduleId, moduleId),
        eq(credential.subjectId, binding.subjectId),
        eq(credential.identifierNamespace, binding.namespace),
        eq(credential.identifierValue, binding.value),
      ),
      predicate: and(
        eq(binding.namespace, identifier.namespace),
        eq(binding.value, identifier.value),
      ),
      limit: 1,
    };
  };

  const emailLookupRows = Effect.fn("Drizzle.emailLookupRows")(function* (
    mapping: SignInMapping,
    moduleId: string,
    identifier: LoginIdentifier,
  ) {
    const database = yield* CurrentEmailSql;
    const query = emailLookupQuery(mapping, moduleId, identifier);

    return yield* database
      .select(query.fields)
      .from(query.from)
      .innerJoin(query.subjectTable, query.subjectJoin)
      .innerJoin(query.credentialTable, query.credentialJoin)
      .where(query.predicate)
      .limit(query.limit);
  });

  const decodeEmailSnapshot = Effect.fn("DrizzleEmail.decodeSnapshot")(function* (
    mapping: SignInMapping,
    moduleId: string,
    requested: LoginIdentifier,
    row: any,
  ) {
    if (
      !mapping.subject.isActiveStatus(row.subject[mapping.subject.status]) ||
      !mapping.identifier.isCurrent(row.identifier) ||
      !mapping.credential.isActiveStatus(row.credential[mapping.credential.status])
    )
      return undefined;

    const snapshot = yield* mapping.credential
      .decode({
        moduleId,
        subject: row.subject,
        identifier: row.identifier,
        credential: row.credential,
      })
      .pipe(Effect.flatMap(snapshotEmailCredential));

    const subjectId = yield* mapping.subjectId.toSubject(row.subject[mapping.subject.id]);

    const verifiedAtMillis = yield* mapping.decodeInstant(
      row.identifier[mapping.identifier.verifiedAt],
    );

    if (
      snapshot.moduleId !== moduleId ||
      !sameIdentifier(snapshot.identifier, requested) ||
      snapshot.revision.subjectId !== subjectId ||
      snapshot.revision.securityRevision !== row.subject[mapping.subject.securityRevision] ||
      snapshot.identifierRevision !== row.identifier[mapping.identifier.bindingRevision] ||
      snapshot.verifiedAtMillis !== verifiedAtMillis ||
      snapshot.credentialId !== row.credential[mapping.credential.credentialId] ||
      snapshot.credentialRevision !== row.credential[mapping.credential.credentialRevision]
    )
      return undefined;

    return snapshot;
  });

  const makeSqlEmailSignInTargets = Effect.fn("makeSqlEmailSignInTargets")(function* (
    mapping: SignInMapping,
    configuration: EmailSqlConfiguration,
  ): Effect.fn.Return<
    EmailSignInTargets["Service"],
    EmailUnavailable,
    CurrentEmailSql | NativeDatabase
  > {
    const database = yield* CurrentEmailSql;

    if (!configuration.coordinated)
      yield* (
        operations.validateStorage?.({
          ...mapping,
          proof: configuration.proof?.mapping,
        }) ?? Effect.void
      ).pipe(Effect.mapError(unavailable));

    return EmailSignInTargets.of({
      lookup: (input) =>
        (validEmailSignInConstraints(mapping)
          ? safeRead(
              database,
              configuration,
              Effect.gen(function* () {
                const row = (yield* emailLookupRows(mapping, input.moduleId, input.identifier))[0];

                if (row === undefined) return Option.none();

                const snapshot = yield* decodeEmailSnapshot(
                  mapping,
                  input.moduleId,
                  input.identifier,
                  row,
                );

                return snapshot === undefined ? Option.none() : Option.some(snapshot);
              }),
            )
          : Effect.fail(unavailable())
        ).pipe(Effect.provideService(CurrentEmailSql, database), translateFailure),
    });
  });

  const readSubject = Effect.fn("DrizzleEmail.readSubject")(function* (
    mapping: AddressMapping,
    subjectId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const nativeSubjectId = yield* mapping.subjectId.toNative(subjectId as any);
    const s = subjectColumns(mapping);

    const subject = (yield* selectRows(
      database.select().from(mapping.subject.table).where(eq(s.id, nativeSubjectId)).limit(1),
      locking,
    ))[0];

    return { nativeSubjectId, subject };
  });

  const identifierRow = Effect.fn("Drizzle.identifierRow")(function* (
    mapping: SignInMapping,
    identifier: LoginIdentifier,
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const i = identifierColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.identifier.table)
        .where(and(eq(i.namespace, identifier.namespace), eq(i.value, identifier.value)))
        .limit(1),
      locking,
    );
  });

  const credentialById = Effect.fn("Drizzle.credentialById")(function* (
    mapping: SignInMapping,
    moduleId: string,
    credentialId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const c = credentialColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.credential.table)
        .where(and(eq(c.moduleId, moduleId), eq(c.credentialId, credentialId)))
        .limit(1),
      locking,
    );
  });

  const credentialByIdentifier = Effect.fn("Drizzle.credentialByIdentifier")(function* (
    mapping: SignInMapping,
    moduleId: string,
    identifier: LoginIdentifier,
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const c = credentialColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.credential.table)
        .where(
          and(
            eq(c.moduleId, moduleId),
            eq(c.identifierNamespace, identifier.namespace),
            eq(c.identifierValue, identifier.value),
          ),
        )
        .limit(1),
      locking,
    );
  });

  const currentAddress = Effect.fn("DrizzleEmail.currentAddress")(function* (
    mapping: AddressMapping,
    input: {
      readonly moduleId: string;
      readonly subjectId: string;
      readonly target: LoginIdentifier;
      readonly sourceCredentialId?: string;
    },
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const locked = yield* readSubject(mapping, input.subjectId, locking);

    if (
      locked.subject === undefined ||
      !mapping.subject.isActiveStatus(locked.subject[mapping.subject.status])
    )
      return undefined;

    const discoveredSource =
      input.sourceCredentialId === undefined
        ? undefined
        : (yield* credentialById(mapping, input.moduleId, input.sourceCredentialId, false))[0];

    const sourceIdentifier: LoginIdentifier | undefined =
      discoveredSource === undefined
        ? undefined
        : {
            namespace: discoveredSource[mapping.credential.identifierNamespace],
            value: discoveredSource[mapping.credential.identifierValue],
          };

    const identifiers = [
      input.target,
      ...(sourceIdentifier === undefined ? [] : [sourceIdentifier]),
    ]
      .filter(
        (value, index, values) =>
          values.findIndex((candidate) => sameIdentifier(candidate, value)) === index,
      )
      .sort((left, right) =>
        `${left.namespace}\u0000${left.value}`.localeCompare(
          `${right.namespace}\u0000${right.value}`,
        ),
      );

    const lockedIdentifiers = new Map<string, any>();

    for (const identifier of identifiers) {
      const row = (yield* identifierRow(mapping, identifier, locking))[0];

      if (row !== undefined)
        lockedIdentifiers.set(`${identifier.namespace}\u0000${identifier.value}`, row);
    }

    const sourceCredential =
      input.sourceCredentialId === undefined
        ? undefined
        : (yield* credentialById(mapping, input.moduleId, input.sourceCredentialId, locking))[0];

    const targetCredential = (yield* credentialByIdentifier(
      mapping,
      input.moduleId,
      input.target,
      locking,
    ))[0];

    const a = authorityColumns(mapping);

    const authority = yield* selectRows(
      database
        .select()
        .from(mapping.authorityCredential.table)
        .where(eq(a.subjectId, locked.nativeSubjectId))
        .orderBy(a.credentialId),
      locking,
    );

    const activeAuthority = authority.filter((row: any) =>
      mapping.authorityCredential.isActiveStatus(row[mapping.authorityCredential.status]),
    );

    const subjectId = yield* mapping.subjectId.toSubject(locked.nativeSubjectId);

    const revision: AuthenticationRevision = Object.freeze({
      subjectId,
      securityRevision: locked.subject[mapping.subject.securityRevision],
      credentials: Object.freeze(
        activeAuthority.map((row: any) =>
          Object.freeze({
            credentialId: row[mapping.authorityCredential.credentialId],
            revision: row[mapping.authorityCredential.revision],
          }),
        ),
      ),
    });

    const targetIdentifier = lockedIdentifiers.get(
      `${input.target.namespace}\u0000${input.target.value}`,
    );

    const targetOwned =
      targetIdentifier !== undefined &&
      mapping.subjectId.equals(
        targetIdentifier[mapping.identifier.subjectId],
        locked.nativeSubjectId,
      );

    const targetMutable =
      targetOwned &&
      mapping.identifier.isMutableTarget(targetIdentifier) &&
      (targetCredential === undefined ||
        (!mapping.credential.isActiveStatus(targetCredential[mapping.credential.status]) &&
          mapping.subjectId.equals(
            targetCredential[mapping.credential.subjectId],
            locked.nativeSubjectId,
          )));

    let source: CurrentAddress["source"];

    if (input.sourceCredentialId !== undefined) {
      if (
        sourceCredential === undefined ||
        sourceIdentifier === undefined ||
        !mapping.subjectId.equals(
          sourceCredential[mapping.credential.subjectId],
          locked.nativeSubjectId,
        ) ||
        !mapping.credential.isActiveStatus(sourceCredential[mapping.credential.status])
      )
        return undefined;

      const sourceIdentifierRow = lockedIdentifiers.get(
        `${sourceIdentifier.namespace}\u0000${sourceIdentifier.value}`,
      );

      if (
        sourceIdentifierRow === undefined ||
        !mapping.identifier.isCurrent(sourceIdentifierRow) ||
        !mapping.subjectId.equals(
          sourceIdentifierRow[mapping.identifier.subjectId],
          locked.nativeSubjectId,
        )
      )
        return undefined;

      const snapshot = yield* mapping.credential
        .decode({
          moduleId: input.moduleId,
          subject: locked.subject,
          identifier: sourceIdentifierRow,
          credential: sourceCredential,
        })
        .pipe(Effect.flatMap(snapshotEmailCredential));

      source = { credential: sourceCredential, identifier: sourceIdentifierRow, snapshot };
    }
    let eligible = targetIdentifier === undefined ? targetCredential === undefined : targetMutable;

    if (input.sourceCredentialId !== undefined && source === undefined) eligible = false;
    if (source !== undefined && sameIdentifier(source.snapshot.identifier, input.target))
      eligible = false;
    if (mapping.addressCardinality === "single" && input.sourceCredentialId === undefined) {
      const c = credentialColumns(mapping);

      const rows = yield* selectRows(
        database
          .select()
          .from(mapping.credential.table)
          .where(and(eq(c.moduleId, input.moduleId), eq(c.subjectId, locked.nativeSubjectId))),
        locking,
      );

      if (
        rows.some((row: any) => mapping.credential.isActiveStatus(row[mapping.credential.status]))
      )
        eligible = false;
    }

    return {
      nativeSubjectId: locked.nativeSubjectId,
      subject: locked.subject,
      revision,
      ...(source === undefined ? {} : { source }),
      ...(targetIdentifier === undefined ? {} : { targetIdentifier }),
      ...(targetCredential === undefined ? {} : { targetCredential }),
      ...(targetMutable
        ? { targetIdentifierRevision: targetIdentifier[mapping.identifier.bindingRevision] }
        : {}),
      eligible,
    };
  });

  const sameEmailRevision = (left: AuthenticationRevision, right: AuthenticationRevision) => {
    if (
      left.subjectId !== right.subjectId ||
      left.securityRevision !== right.securityRevision ||
      left.credentials.length !== right.credentials.length
    )
      return false;

    const expected = [...left.credentials].sort((a, b) =>
      a.credentialId.localeCompare(b.credentialId),
    );

    const actual = [...right.credentials].sort((a, b) =>
      a.credentialId.localeCompare(b.credentialId),
    );

    return expected.every(
      (item, index) =>
        item.credentialId === actual[index]!.credentialId &&
        item.revision === actual[index]!.revision,
    );
  };

  const actionModule = (moduleId: string, action: EmailAction) =>
    `${moduleId}/${action === "verify-address" ? "verify-address" : "change-address"}`;

  const actionPurpose = (action: EmailAction) =>
    action === "verify-address" ? "email-address-verification" : "email-address-change";

  const completionMatches = (input: EmailAddressMutation, action: EmailAction) => {
    const completion = input.completion.input;
    const binding = completion.binding;

    return (
      completion.moduleId === actionModule(input.moduleId, action) &&
      completion.purpose === actionPurpose(action) &&
      binding._tag === "IdentifierChange" &&
      sameIdentifier(binding.identifier, input.target) &&
      sameEmailRevision(binding.revision, input.captured.revision)
    );
  };

  const snapshotEmailMutation = Effect.fn("DrizzleEmail.snapshotMutation")(function* (
    input: EmailAddressMutation,
  ) {
    const evidence = yield* snapshotAuthenticationEvidence(input.authorization.evidence).pipe(
      Effect.mapError(unavailable),
    );

    const requirement = yield* snapshotEmailRequirement(input.authorization.requirement);

    const source =
      input.captured.source === undefined
        ? undefined
        : yield* snapshotEmailCredential(input.captured.source);

    return Object.freeze({
      ...input,
      target: Object.freeze({ ...input.target }),
      ...(input.invalidation === undefined
        ? {}
        : { invalidation: Object.freeze({ ...input.invalidation }) }),
      captured: Object.freeze({
        eligible: input.captured.eligible,
        revision: snapshotEmailRevision(input.captured.revision),
        ...(input.captured.targetIdentifierRevision === undefined
          ? {}
          : { targetIdentifierRevision: input.captured.targetIdentifierRevision }),
        ...(source === undefined ? {} : { source }),
      }),
      authorization: Object.freeze({
        challenge: Object.freeze({
          ...input.authorization.challenge,
          target: Object.freeze({ ...input.authorization.challenge.target }),
          revision: snapshotEmailRevision(input.authorization.challenge.revision),
        }),
        evidence,
        requirement,
      }),
    });
  });

  const validateEmailAuthority = Effect.fn("DrizzleEmail.validateAuthority")(function* (
    mapping: AddressMapping,
    configuration: EmailSqlConfiguration,
    input: EmailAddressMutation,
    action: EmailAction,
  ) {
    const confirmsExisting =
      action === "verify-address" && input.captured.targetIdentifierRevision !== undefined;

    if (
      !input.captured.eligible ||
      !completionMatches(input, action) ||
      input.authorization.challenge.moduleId !== input.moduleId ||
      input.authorization.challenge.action !== action ||
      input.authorization.challenge.commandId !== input.commandId ||
      !sameIdentifier(input.authorization.challenge.target, input.target) ||
      input.authorization.challenge.sourceCredentialId !== input.captured.source?.credentialId ||
      !sameEmailRevision(input.authorization.challenge.revision, input.captured.revision) ||
      input.authorization.challenge.targetIdentifierRevision !==
        input.captured.targetIdentifierRevision ||
      (input.authorization.evidence.flowId as string) !== (input.commandId as string) ||
      input.authorization.evidence.bindingDigest !== input.authorization.challenge.bindingDigest ||
      !sameEmailRevision(input.authorization.evidence.revision, input.captured.revision) ||
      (action === "verify-address" && input.captured.source !== undefined) ||
      (action === "change-address" && input.captured.source === undefined) ||
      confirmsExisting !== (input.invalidation === undefined) ||
      (input.invalidation?.existingSessions === "immediate" &&
        mapping.sessionInvalidation !== "same-authority-immediate")
    )
      return undefined;

    const current = yield* currentAddress(
      mapping,
      {
        moduleId: input.moduleId,
        subjectId: input.captured.revision.subjectId,
        target: input.target,
        ...(input.captured.source === undefined
          ? {}
          : { sourceCredentialId: input.captured.source.credentialId }),
      },
      configuration.locking,
    );

    if (
      current === undefined ||
      !current.eligible ||
      !sameEmailRevision(current.revision, input.captured.revision) ||
      current.targetIdentifierRevision !== input.captured.targetIdentifierRevision ||
      (input.captured.source !== undefined &&
        (current.source === undefined ||
          current.source.snapshot.identifierRevision !== input.captured.source.identifierRevision ||
          current.source.snapshot.credentialRevision !== input.captured.source.credentialRevision ||
          !sameIdentifier(current.source.snapshot.identifier, input.captured.source.identifier)))
    )
      return undefined;

    const currentRequirement = yield* mapping.subject.decodeActionRequirement(
      current.subject,
      action,
    );

    const original = yield* assessAuthentication(
      input.authorization.evidence,
      input.authorization.requirement,
    ).pipe(Effect.mapError(unavailable));

    const configured = yield* assessAuthentication(
      input.authorization.evidence,
      currentRequirement,
    ).pipe(Effect.mapError(unavailable));

    return original.satisfied && configured.satisfied ? current : undefined;
  });

  const commandExists = Effect.fn("Drizzle.commandExists")(function* (
    mapping: AddressMapping,
    moduleId: string,
    commandId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentEmailSql;

    const c = commandColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.command.table)
        .where(and(eq(c.moduleId, moduleId), eq(c.commandId, commandId)))
        .limit(1),
      locking,
    );
  });

  const applyMutation = Effect.fn("DrizzleEmail.applyMutation")(function* (
    mapping: AddressMapping,
    input: EmailAddressMutation,
    action: EmailAction,
    current: CurrentAddress,
    allocated: {
      readonly targetCredentialId: string;
      readonly targetIdentifierRevision: SecurityRevision;
      readonly targetCredentialRevision: SecurityRevision;
      readonly sourceIdentifierRevision: SecurityRevision;
      readonly sourceCredentialRevision: SecurityRevision;
      readonly nextSecurityRevision: SecurityRevision;
    },
    now: number,
  ) {
    const database = yield* CurrentEmailSql;

    const i = identifierColumns(mapping);
    const c = credentialColumns(mapping);
    const a = authorityColumns(mapping);
    const s = subjectColumns(mapping);

    const targetCredentialId =
      current.targetCredential?.[mapping.credential.credentialId] ?? allocated.targetCredentialId;

    if (action === "change-address") {
      const source = current.source!;

      yield* database
        .update(mapping.identifier.table)
        .set(
          mapping.identifier.encodeRetirement({
            source: source.snapshot.identifier,
            bindingRevision: allocated.sourceIdentifierRevision,
          }),
        )
        .where(
          and(
            eq(i.namespace, source.snapshot.identifier.namespace),
            eq(i.value, source.snapshot.identifier.value),
            eq(i.subjectId, current.nativeSubjectId),
            eq(i.bindingRevision, source.snapshot.identifierRevision),
          ),
        );
      yield* database
        .update(mapping.credential.table)
        .set(
          mapping.credential.encodeRetirement({
            source: source.snapshot.identifier,
            credentialRevision: allocated.sourceCredentialRevision,
          }),
        )
        .where(
          and(
            eq(c.moduleId, input.moduleId),
            eq(c.credentialId, source.snapshot.credentialId),
            eq(c.subjectId, current.nativeSubjectId),
            eq(c.credentialRevision, source.snapshot.credentialRevision),
          ),
        );
      yield* database
        .update(mapping.authorityCredential.table)
        .set(mapping.authorityCredential.encodeRetirement(allocated.sourceCredentialRevision))
        .where(
          and(
            eq(a.subjectId, current.nativeSubjectId),
            eq(a.credentialId, source.snapshot.credentialId),
            eq(a.revision, source.snapshot.credentialRevision),
          ),
        );
    }
    if (current.targetIdentifier === undefined) {
      yield* database.insert(mapping.identifier.table).values(
        mapping.identifier.encodeVerifiedInsert({
          identifier: input.target,
          subjectId: current.nativeSubjectId,
          verifiedAtMillis: now,
          bindingRevision: allocated.targetIdentifierRevision,
        }),
      );
    } else {
      yield* database
        .update(mapping.identifier.table)
        .set(
          mapping.identifier.encodeVerification({
            verifiedAtMillis: now,
            bindingRevision: allocated.targetIdentifierRevision,
          }),
        )
        .where(
          and(
            eq(i.namespace, input.target.namespace),
            eq(i.value, input.target.value),
            eq(i.subjectId, current.nativeSubjectId),
            eq(i.bindingRevision, current.targetIdentifier![mapping.identifier.bindingRevision]),
          ),
        );
    }
    if (current.targetCredential === undefined) {
      yield* database.insert(mapping.credential.table).values(
        mapping.credential.encodeVerifiedInsert({
          moduleId: input.moduleId,
          subjectId: current.nativeSubjectId,
          credentialId: targetCredentialId,
          identifier: input.target,
          credentialRevision: allocated.targetCredentialRevision,
        }),
      );
      yield* database.insert(mapping.authorityCredential.table).values(
        mapping.authorityCredential.encodeInsert({
          subjectId: current.nativeSubjectId,
          credentialId: targetCredentialId,
          revision: allocated.targetCredentialRevision,
        }),
      );
    } else {
      const oldRevision = current.targetCredential[mapping.credential.credentialRevision];

      yield* database
        .update(mapping.credential.table)
        .set(
          mapping.credential.encodeActivation({
            identifier: input.target,
            credentialRevision: allocated.targetCredentialRevision,
          }),
        )
        .where(
          and(
            eq(c.moduleId, input.moduleId),
            eq(c.credentialId, targetCredentialId),
            eq(c.subjectId, current.nativeSubjectId),
            eq(c.credentialRevision, oldRevision),
          ),
        );
      yield* database
        .update(mapping.authorityCredential.table)
        .set(mapping.authorityCredential.encodeActivation(allocated.targetCredentialRevision))
        .where(
          and(
            eq(a.subjectId, current.nativeSubjectId),
            eq(a.credentialId, targetCredentialId),
            eq(a.revision, oldRevision),
          ),
        );
    }
    yield* database
      .update(mapping.subject.table)
      .set(updateValues([[mapping.subject.securityRevision, allocated.nextSecurityRevision]]))
      .where(
        and(
          eq(s.id, current.nativeSubjectId),
          eq(s.securityRevision, input.captured.revision.securityRevision),
        ),
      );
    yield* database.insert(mapping.command.table).values(
      mapping.command.encodeInsert({
        moduleId: input.moduleId,
        commandId: input.commandId,
        action,
        bindingDigest: input.authorization.challenge.bindingDigest,
        retentionUntilMillis: now + mapping.commandRetentionMillis,
      }),
    );

    const sourceStillActive =
      action === "verify-address"
        ? []
        : yield* selectRows(
            database
              .select()
              .from(mapping.credential.table)
              .where(
                and(
                  eq(c.moduleId, input.moduleId),
                  eq(c.credentialId, current.source!.snapshot.credentialId),
                  eq(c.subjectId, current.nativeSubjectId),
                ),
              ),
            false,
          );

    const target = (yield* emailLookupRows(mapping, input.moduleId, input.target))[0];

    const targetAuthority = yield* selectRows(
      database
        .select()
        .from(mapping.authorityCredential.table)
        .where(
          and(eq(a.subjectId, current.nativeSubjectId), eq(a.credentialId, targetCredentialId)),
        )
        .limit(1),
      false,
    );

    const command = yield* selectRows(
      database
        .select()
        .from(mapping.command.table)
        .where(
          and(
            eq(commandColumns(mapping).moduleId, input.moduleId),
            eq(commandColumns(mapping).commandId, input.commandId),
            eq(commandColumns(mapping).action, action),
            eq(commandColumns(mapping).bindingDigest, input.authorization.challenge.bindingDigest),
            eq(
              commandColumns(mapping).retentionUntil,
              mapping.encodeInstant(now + mapping.commandRetentionMillis),
            ),
          ),
        )
        .limit(1),
      false,
    );

    const targetVerifiedAt =
      target === undefined
        ? undefined
        : yield* mapping.decodeInstant(target.identifier[mapping.identifier.verifiedAt]);

    const sourceIdentifier =
      action === "verify-address"
        ? []
        : yield* identifierRow(mapping, current.source!.snapshot.identifier, false);

    const sourceAuthority =
      action === "verify-address"
        ? []
        : yield* selectRows(
            database
              .select()
              .from(mapping.authorityCredential.table)
              .where(
                and(
                  eq(a.subjectId, current.nativeSubjectId),
                  eq(a.credentialId, current.source!.snapshot.credentialId),
                ),
              )
              .limit(1),
            false,
          );

    return (
      target !== undefined &&
      mapping.subjectId.equals(target.subject[mapping.subject.id], current.nativeSubjectId) &&
      mapping.subject.isActiveStatus(target.subject[mapping.subject.status]) &&
      target.subject[mapping.subject.securityRevision] === allocated.nextSecurityRevision &&
      target.identifier[mapping.identifier.bindingRevision] ===
        allocated.targetIdentifierRevision &&
      targetVerifiedAt === now &&
      target.credential[mapping.credential.credentialRevision] ===
        allocated.targetCredentialRevision &&
      target.credential[mapping.credential.credentialId] === targetCredentialId &&
      mapping.subjectId.equals(
        target.credential[mapping.credential.subjectId],
        current.nativeSubjectId,
      ) &&
      mapping.identifier.isCurrent(target.identifier) &&
      mapping.credential.isActiveStatus(target.credential[mapping.credential.status]) &&
      targetAuthority.length === 1 &&
      targetAuthority[0]![mapping.authorityCredential.revision] ===
        allocated.targetCredentialRevision &&
      mapping.authorityCredential.isActiveStatus(
        targetAuthority[0]![mapping.authorityCredential.status],
      ) &&
      command.length === 1 &&
      (action === "verify-address" ||
        (sourceStillActive.length === 1 &&
          sourceStillActive[0]![mapping.credential.credentialRevision] ===
            allocated.sourceCredentialRevision &&
          !mapping.credential.isActiveStatus(sourceStillActive[0]![mapping.credential.status]) &&
          sourceIdentifier.length === 1 &&
          mapping.subjectId.equals(
            sourceIdentifier[0]![mapping.identifier.subjectId],
            current.nativeSubjectId,
          ) &&
          sourceIdentifier[0]![mapping.identifier.bindingRevision] ===
            allocated.sourceIdentifierRevision &&
          !mapping.identifier.isCurrent(sourceIdentifier[0]!) &&
          sourceAuthority.length === 1 &&
          sourceAuthority[0]![mapping.authorityCredential.revision] ===
            allocated.sourceCredentialRevision &&
          !mapping.authorityCredential.isActiveStatus(
            sourceAuthority[0]![mapping.authorityCredential.status],
          )))
    );
  });

  const probeProofCompletion = Effect.fn("Drizzle.probeProofCompletion")(function* (
    configuration: EmailSqlConfiguration,
    input: ProofCompletionInput,
  ) {
    const database = yield* CurrentEmailSql;

    if (configuration.proof === undefined) return yield* Effect.fail(unavailable());
    const validProbe = { _tag: "EmailProofCompletionValid" } as const;

    const plan = {
      input,
      prepare: <A>(
        decision: ProofCompletionDecision,
        journal: CommitJournal,
        project: (decision: ProofCompletionDecision) => A,
      ) => journal.prepare(project(decision)),
    };

    const probe = coordinateCommit(
      () =>
        database.transaction((transaction) =>
          completeProofPlanIn(
            configuration.proof!.mapping,
            configuration.proof!.configuration,
            plan,
            Effect.fail(validProbe),
            () => false,
          ).pipe(
            Effect.provideService(CurrentProofSql, transaction as unknown as ProofSqlDatabase),
          ),
        ),
      { mode: configuration.mode },
    );

    return yield* probe.pipe(
      Effect.as(false),
      Effect.catchCause((cause) => {
        const reason = cause.reasons[0];

        return cause.reasons.length === 1 &&
          reason !== undefined &&
          Cause.isFailReason(reason) &&
          reason.error === validProbe
          ? Effect.succeed(true)
          : Effect.failCause(cause);
      }),
    );
  });

  const prepareRejected = Effect.fn("Drizzle.prepareRejected")(function* <A>(
    configuration: EmailSqlConfiguration,
    prepare: (value: "rejected", journal: CommitJournal) => PreparedCommit<A>,
  ) {
    const database = yield* CurrentEmailSql;

    return yield* owned(
      database,
      configuration,
      Effect.gen(function* () {
        const journal = yield* CurrentCommitJournal;

        return yield* Effect.succeed(prepare("rejected", journal));
      }),
    );
  });

  const makeSqlEmailAddressPersistence = Effect.fn("makeSqlEmailAddressPersistence")(function* (
    mapping: AddressMapping,
    configuration: EmailSqlConfiguration,
  ): Effect.fn.Return<
    EmailAddressPersistence["Service"],
    EmailUnavailable,
    LifecycleHooks | CurrentEmailSql | NativeDatabase
  > {
    const database = yield* CurrentEmailSql;

    if (!configuration.coordinated)
      yield* (
        operations.validateStorage?.({
          ...mapping,
          proof: configuration.proof?.mapping,
        }) ?? Effect.void
      ).pipe(Effect.mapError(unavailable));
    const hooks = yield* LifecycleHooks;

    return EmailAddressPersistence.of({
      target: (input) =>
        (validAddressConstraints(mapping)
          ? safeRead(
              database,
              configuration,
              Effect.gen(function* () {
                const current = yield* currentAddress(mapping, input, configuration.locking);

                if (current === undefined) return yield* unavailable();

                return Object.freeze({
                  revision: snapshotEmailRevision(current.revision),
                  eligible: current.eligible,
                  ...(current.targetIdentifierRevision === undefined
                    ? {}
                    : { targetIdentifierRevision: current.targetIdentifierRevision }),
                  ...(current.source === undefined
                    ? {}
                    : { source: yield* snapshotEmailCredential(current.source.snapshot) }),
                });
              }),
            )
          : Effect.fail(unavailable())
        ).pipe(
          Effect.provideService(CurrentEmailSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      checkCompletion: (input) => {
        if (configuration.proof === undefined || input.binding._tag !== "IdentifierChange")
          return Effect.succeed(false).pipe(
            Effect.provideService(CurrentEmailSql, database),
            Effect.provideService(LifecycleHooks, hooks),
            translateFailure,
          );
        const binding = input.binding;

        return safeRead(
          database,
          configuration,
          Effect.gen(function* () {
            const action: EmailAction | undefined =
              input.moduleId.endsWith("/verify-address") &&
              input.purpose === "email-address-verification"
                ? "verify-address"
                : input.moduleId.endsWith("/change-address") &&
                    input.purpose === "email-address-change"
                  ? "change-address"
                  : undefined;

            if (action === undefined) return false;
            const moduleId = input.moduleId.slice(0, -`/${action}`.length);

            const current = yield* currentAddress(
              mapping,
              {
                moduleId,
                subjectId: binding.revision.subjectId,
                target: binding.identifier,
              },
              false,
            );

            return current !== undefined && sameEmailRevision(current.revision, binding.revision);
          }),
        )
          .pipe(
            Effect.flatMap((current) =>
              current ? probeProofCompletion(configuration, input) : Effect.succeed(false),
            ),
          )
          .pipe(
            Effect.provideService(CurrentEmailSql, database),
            Effect.provideService(LifecycleHooks, hooks),
            translateFailure,
          );
      },
      verifyWithProof: (uncaptured, prepare) =>
        mutateAddress(mapping, configuration, uncaptured, "verify-address", prepare).pipe(
          Effect.provideService(CurrentEmailSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      changeWithProof: (uncaptured, prepare) =>
        mutateAddress(mapping, configuration, uncaptured, "change-address", prepare).pipe(
          Effect.provideService(CurrentEmailSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      cleanup: (input, prepare) =>
        owned(
          database,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentEmailSql;
            const journal = yield* CurrentCommitJournal;

            const c = commandColumns(mapping);
            const now = yield* nowMillis;

            const rows = yield* selectRows(
              transaction
                .select({ commandId: c.commandId })
                .from(mapping.command.table)
                .where(
                  and(
                    eq(c.moduleId, input.moduleId),
                    lte(c.retentionUntil, mapping.encodeInstant(now)),
                  ),
                )
                .limit(input.limit + 1),
              configuration.locking,
            );

            const selected = rows.slice(0, input.limit);

            const receipt = prepare(
              { removed: selected.length, hasMore: rows.length > input.limit },
              journal,
            );

            if (selected.length > 0)
              yield* transaction.delete(mapping.command.table).where(
                and(
                  eq(c.moduleId, input.moduleId),
                  inArray(
                    c.commandId,
                    selected.map((row: any) => row.commandId),
                  ),
                  lte(c.retentionUntil, mapping.encodeInstant(now)),
                ),
              );

            return receipt;
          }),
        ).pipe(
          Effect.provideService(CurrentEmailSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    });
  });

  const mutateAddress = Effect.fn("Drizzle.mutateAddress")(function* <A>(
    mapping: AddressMapping,
    configuration: EmailSqlConfiguration,
    uncaptured: EmailAddressMutation,
    action: EmailAction,
    prepare: (value: "changed" | "rejected", journal: CommitJournal) => PreparedCommit<A>,
  ) {
    const database = yield* CurrentEmailSql;

    if (!validAddressConstraints(mapping) || configuration.proof === undefined)
      return yield* unavailable();
    const input = yield* snapshotEmailMutation(uncaptured);

    const targetCredentialId = yield* allocate(
      configuration.mode,
      mapping.allocateCredentialId,
      mapping.allocateCredentialIdSync,
    );

    const targetIdentifierRevision = yield* allocate(
      configuration.mode,
      mapping.allocateRevision,
      mapping.allocateRevisionSync,
    );

    const targetCredentialRevision = yield* allocate(
      configuration.mode,
      mapping.allocateRevision,
      mapping.allocateRevisionSync,
    );

    const sourceIdentifierRevision = yield* allocate(
      configuration.mode,
      mapping.allocateRevision,
      mapping.allocateRevisionSync,
    );

    const sourceCredentialRevision = yield* allocate(
      configuration.mode,
      mapping.allocateRevision,
      mapping.allocateRevisionSync,
    );

    const confirmsExisting =
      action === "verify-address" && input.captured.targetIdentifierRevision !== undefined;

    const nextRevision = confirmsExisting
      ? input.captured.revision.securityRevision
      : yield* nextSecurityRevision(
          mapping,
          configuration.mode,
          input.captured.revision.securityRevision,
        );

    if (
      (!confirmsExisting && nextRevision === input.captured.revision.securityRevision) ||
      [
        targetIdentifierRevision,
        targetCredentialRevision,
        sourceIdentifierRevision,
        sourceCredentialRevision,
      ].some((value) => input.captured.revision.credentials.some((item) => item.revision === value))
    )
      return yield* unavailable();

    const run = owned(
      database,
      configuration,
      Effect.gen(function* () {
        const journal = yield* CurrentCommitJournal;

        const current = yield* validateEmailAuthority(mapping, configuration, input, action);

        if (current === undefined) return prepare("rejected", journal);
        if (
          (yield* commandExists(mapping, input.moduleId, input.commandId, configuration.locking))
            .length > 0
        )
          return prepare("rejected", journal);
        let receipt: PreparedCommit<A> | undefined;

        yield* completeProofPlanIn(
          configuration.proof!.mapping,
          configuration.proof!.configuration,
          input.completion,
          Effect.gen(function* () {
            // The proof helper may wait on continuation/series locks. Read the
            // commit clock and reassess both policies only after those locks.
            const currentRequirement = yield* mapping.subject.decodeActionRequirement(
              current.subject,
              action,
            );

            const original = yield* assessAuthentication(
              input.authorization.evidence,
              input.authorization.requirement,
            ).pipe(Effect.mapError(unavailable));

            const configured = yield* assessAuthentication(
              input.authorization.evidence,
              currentRequirement,
            ).pipe(Effect.mapError(unavailable));

            if (!original.satisfied || !configured.satisfied) return false;
            const now = yield* nowMillis;

            return yield* applyMutation(
              mapping,
              input,
              action,
              current,
              {
                targetCredentialId,
                targetIdentifierRevision,
                targetCredentialRevision,
                sourceIdentifierRevision,
                sourceCredentialRevision,
                nextSecurityRevision: nextRevision,
              },
              now,
            );
          }),
          (decision) => {
            receipt = prepare(decision === "completed" ? "changed" : "rejected", journal);

            return decision;
          },
        );

        return receipt ?? prepare("rejected", journal);
      }),
    );

    return yield* run.pipe(
      Effect.catchCause((cause) =>
        (cause.reasons.every(Cause.isFailReason) &&
          isMappedConstraintConflict(mapping.isCommandConflict, cause)) ||
        (cause.reasons.every(Cause.isFailReason) &&
          isMappedConstraintConflict(mapping.isIdentifierConflict, cause)) ||
        (cause.reasons.every(Cause.isFailReason) &&
          isMappedConstraintConflict(mapping.isCredentialConflict, cause))
          ? prepareRejected(configuration, prepare)
          : Effect.failCause(cause),
      ),
    );
  });

  return {
    validEmailSignInConstraints,
    emailLookupQuery,
    decodeEmailSnapshot,
    makeSqlEmailSignInTargets,
    currentAddress,
    sameEmailRevision,
    snapshotEmailMutation,
    validateEmailAuthority,
    makeSqlEmailAddressPersistence,
  };
};
