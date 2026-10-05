/* oxlint-disable no-explicit-any -- D1 batches bridge consumer-owned Drizzle tables. */
import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  EmailAddressPersistence,
  EmailSignInTargets,
  EmailUnavailable,
  type EmailAction,
  type EmailAddressDecision,
  type EmailRegistrationDecision,
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
  type ProofCompletionPlan,
  type ProofCompletionInput,
  ProofUnavailable,
} from "@yielded/auth/Proofs";
import type { TokenDigest } from "@yielded/auth/Schema";
import {
  assessAuthentication,
  type AuthenticationRequirement,
  type SecurityRevision,
} from "@yielded/auth/Sessions";
import { and, eq, inArray, lte, sql, type AnyRelations, type SQL, type Table } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Schema, Cause, DateTime, Effect, Option, Context } from "effect";
import type { Statement } from "effect/sql/Statement";

import { Database as DatabaseService } from "./d1-database";
import { CurrentD1PlanningDatabase, makeD1Owner } from "./d1-planning";
import { compileD1ProofCompletionPlan } from "./d1-proofs";
import { D1BatchStatements } from "./D1BatchStatements";
import {
  requiredEmailAddressConstraints,
  requiredEmailRegistrationConstraints,
  type D1EmailAddressMapping,
  type D1EmailRegistrationMapping,
  type EmailRegistrationMapping,
  type EmailSignInMapping,
} from "./email-model";
import { type EmailRegistrationAuthority, readEmailRegistrationTarget } from "./email-registration";
import {
  CurrentEmailSql,
  currentAddress,
  decodeEmailSnapshot,
  emailLookupQuery,
  sameEmailRevision,
  snapshotEmailMutation,
  validEmailSignInConstraints,
  validateEmailAuthority,
  type CurrentAddress,
  type EmailSqlDatabase,
} from "./email-sql";
import { column, isMappedConstraintConflict, PersistenceMappingError, updateValues } from "./model";
import { nativeDatabase } from "./native-database";
import type { D1ProofPersistenceMapping } from "./proof-model";
import { validateDrizzleStorage } from "./storage-validation";
import type { SuppliedService } from "./SuppliedService";

type PlanPrepare<Method extends (...args: any[]) => any, A> = (
  value: Parameters<Parameters<Method>[1]>[0],
  journal: CommitJournal,
) => PreparedCommit<A>;

type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type AddressMapping = D1EmailAddressMapping<Table, Table, Table, Table, Table, unknown>;
type RegistrationMapping<Registration> = EmailRegistrationMapping<
  Registration,
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;
type ProofMapping = D1ProofPersistenceMapping<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

const emailLookupRows = Effect.fn("DrizzleD1.emailLookupRows")(function* (
  mapping: EmailSignInMapping<Table, Table, Table, unknown>,
  moduleId: string,
  identifier: LoginIdentifier,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const query = emailLookupQuery(mapping, moduleId, identifier);

  return yield* database
    .select(query.fields)
    .from(query.from)
    .innerJoin(query.subjectTable, query.subjectJoin)
    .innerJoin(query.credentialTable, query.credentialJoin)
    .where(query.predicate)
    .limit(query.limit);
});

const unavailable = () => EmailUnavailable.make({});

const everyFailureMatches = (
  cause: Cause.Cause<unknown>,
  classify: ((cause: unknown) => boolean) | undefined,
): boolean =>
  classify !== undefined &&
  cause.reasons.length > 0 &&
  cause.reasons.every((reason) => Cause.isFailReason(reason) && classify(Cause.fail(reason.error)));

interface Planned<A> {
  readonly receipt: A;
  readonly statements: ReadonlyArray<Statement<any>>;
  readonly retryable?: (cause: unknown) => boolean;
  readonly journalGuard?: PreparedCommit<void>;
}

const statement = Effect.fn(function* (query: {
  readonly toSQL: () => { readonly sql: string; readonly params: unknown[] };
}) {
  const database = yield* CurrentD1PlanningDatabase;
  const rendered = query.toSQL();

  return database.$client.unsafe(rendered.sql, rendered.params);
});

const containsFailure = (failure: unknown, predicate: (value: unknown) => boolean): boolean => {
  const pending: unknown[] = [failure];
  const seen = new Set<unknown>();

  for (let index = 0; index < 32 && pending.length > 0; index++) {
    const value = pending.shift();

    if (value === null || value === undefined || seen.has(value)) continue;
    seen.add(value);
    if (predicate(value)) return true;
    if (Cause.isCause(value)) {
      for (const reason of value.reasons) {
        if (Cause.isFailReason(reason)) pending.push(reason.error);
        else if (Cause.isDieReason(reason)) pending.push(reason.defect);
      }
    } else if (typeof value === "object") {
      const wrapped = value as {
        readonly cause?: unknown;
        readonly reason?: unknown;
        readonly message?: unknown;
      };

      if (wrapped.cause !== undefined) pending.push(wrapped.cause);
      if (wrapped.reason !== undefined) pending.push(wrapped.reason);
      if (wrapped.message !== undefined) pending.push(wrapped.message);
    }
  }

  return false;
};

const guardFailure = (cause: unknown, marker: string) => {
  const path = `$[${marker.replaceAll("'", "''")}]`;
  const native = `bad JSON path: '${path}': SQLITE_ERROR`;

  return containsFailure(cause, (value) => value === native || value === `D1_ERROR: ${native}`);
};

const assertion = Effect.fn(function* (condition: SQL, marker: string) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* statement(
    database
      .select({
        ok: sql`case when ${condition} then 1 else json_extract('[]', ${`$[${marker}]`}) end`.as(
          "ok",
        ),
      })
      .from(sql`(select 1)`),
  );
});

const existsSql = (query: SQL) => sql`exists(${query})`;
const notExistsSql = (query: SQL) => sql`not exists(${query})`;

const readEngineNowMillis = Effect.fn("Drizzle.readEngineNowMillis")(function* (
  clock: AddressMapping["d1"],
) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* awaitRows(
    database
      .select({
        value: sql<number>`${clock.engineNowMillis}`.mapWith(Number),
      })
      .from(sql`(select 1)`),
  ).pipe(
    Effect.flatMap((rows) =>
      typeof rows[0]?.value === "number" && Number.isFinite(rows[0].value)
        ? Effect.succeed(rows[0].value)
        : Effect.fail(unavailable()),
    ),
  );
});

const driverValues = (values: object, entries: ReadonlyArray<readonly [string, unknown]>) => ({
  ...values,
  ...Object.fromEntries(entries),
});

const allocate = <A>(
  asynchronous: Effect.Effect<A, PersistenceMappingError> | undefined,
  synchronous: (() => A) | undefined,
) =>
  asynchronous !== undefined
    ? asynchronous
    : synchronous === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: synchronous,
          catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
        });

const validAddress = (mapping: AddressMapping) =>
  Object.entries(requiredEmailAddressConstraints).every(
    ([key, value]) =>
      mapping.constraints[key as keyof typeof requiredEmailAddressConstraints] === value,
  );

const evidenceCondition = (
  mapping: AddressMapping,
  evidence: Parameters<typeof assessAuthentication>[0],
  requirement: AuthenticationRequirement,
) => {
  const fresh = (proof: (typeof evidence.proofs)[number]) => {
    const verified = DateTime.toEpochMillis(proof.verifiedAt);

    return sql`${mapping.d1.engineNowMillis} >= ${verified} and ${mapping.d1.engineNowMillis} - ${verified} < ${requirement.maximumAgeMillis}`;
  };

  const alternatives = requirement.alternatives.flatMap((alternative) => {
    const byCredential = new Map<string, SQL[]>();

    for (const proof of evidence.proofs)
      byCredential.set(proof.credentialId, [
        ...(byCredential.get(proof.credentialId) ?? []),
        fresh(proof),
      ]);

    const credentials = [...byCredential.values()].map(
      (conditions) => sql`(${sql.join(conditions, sql` or `)})`,
    );

    const factors = alternative.factors.map((factor) => {
      const matches = evidence.proofs.filter((proof) => proof.factors.includes(factor)).map(fresh);

      return matches.length === 0 ? sql`false` : sql`(${sql.join(matches, sql` or `)})`;
    });

    const assurance = evidence.proofs
      .filter(
        (proof) =>
          (!alternative.userVerified || proof.userVerified) &&
          (!alternative.phishingResistant || proof.phishingResistant),
      )
      .map(fresh);

    if (assurance.length === 0 || credentials.length < alternative.minimumCredentials) return [];

    const minimum =
      alternative.minimumCredentials === 0
        ? sql`true`
        : sql`(${sql.join(
            credentials.map((condition) => sql`case when ${condition} then 1 else 0 end`),
            sql` + `,
          )}) >= ${alternative.minimumCredentials}`;

    return [and(...factors, sql`(${sql.join(assurance, sql` or `)})`, minimum)!];
  });

  const noFuture = evidence.proofs.map(
    (proof) => sql`${mapping.d1.engineNowMillis} >= ${DateTime.toEpochMillis(proof.verifiedAt)}`,
  );

  return alternatives.length === 0
    ? sql`false`
    : and(...noFuture, sql`(${sql.join(alternatives, sql` or `)})`)!;
};

const subjectCondition = (
  mapping: AddressMapping,
  current: CurrentAddress,
  revision: SecurityRevision,
) => {
  const id = column(mapping.subject.table, mapping.subject.id);
  const status = column(mapping.subject.table, mapping.subject.status);
  const security = column(mapping.subject.table, mapping.subject.securityRevision);

  return existsSql(
    sql`select 1 from ${mapping.subject.table} where ${id}=${sql.param(current.nativeSubjectId, id)} and ${status}=${sql.param(mapping.subject.d1ActiveStatusValue, status)} and ${security}=${sql.param(revision, security)}`,
  );
};

const authorityRevisionCondition = (mapping: AddressMapping, current: CurrentAddress) => {
  const a = mapping.authorityCredential;
  const subject = column(a.table, a.subjectId);
  const credential = column(a.table, a.credentialId);
  const revision = column(a.table, a.revision);
  const status = column(a.table, a.status);
  const expected = current.revision.credentials;

  const matches = expected.map((item) =>
    existsSql(
      sql`select 1 from ${a.table} where ${subject}=${sql.param(current.nativeSubjectId, subject)} and ${credential}=${sql.param(item.credentialId, credential)} and ${revision}=${sql.param(item.revision, revision)} and ${status}=${sql.param(a.d1ActiveStatusValue, status)}`,
    ),
  );

  return and(
    ...matches,
    sql`(select count(*) from ${a.table} where ${subject}=${sql.param(current.nativeSubjectId, subject)} and ${status}=${sql.param(a.d1ActiveStatusValue, status)})=${expected.length}`,
  )!;
};

const mutationPlan = Effect.fn("Drizzle.mutationPlan")(function* <A>(
  mapping: AddressMapping,
  proofMapping: ProofMapping,
  uncaptured: Parameters<EmailAddressPersistence["Service"]["verifyWithProof"]>[0],
  action: EmailAction,
  prepare: (value: EmailAddressDecision, journal: CommitJournal) => PreparedCommit<A>,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const journal = yield* CurrentCommitJournal;

  if (!validAddress(mapping)) return yield* unavailable();
  const input = yield* snapshotEmailMutation(uncaptured).pipe(Effect.mapError(unavailable));

  const current = yield* validateEmailAuthority(
    mapping,
    { mode: "interactive", locking: false, standaloneGuard: Effect.void },
    input,
    action,
  );

  if (current === undefined) return { receipt: prepare("rejected", journal), statements: [] };

  const existingCommand = awaitRows(
    database
      .select()
      .from(mapping.command.table)
      .where(
        and(
          eq(column(mapping.command.table, mapping.command.moduleId), input.moduleId),
          eq(column(mapping.command.table, mapping.command.commandId), input.commandId),
        ),
      )
      .limit(1),
  );

  if ((yield* existingCommand).length > 0)
    return { receipt: prepare("rejected", journal), statements: [] };
  const requirement = yield* mapping.subject.decodeActionRequirement(current.subject, action);

  const original = yield* assessAuthentication(
    input.authorization.evidence,
    input.authorization.requirement,
  ).pipe(Effect.mapError(unavailable));

  const configured = yield* assessAuthentication(input.authorization.evidence, requirement).pipe(
    Effect.mapError(unavailable),
  );

  if (!original.satisfied || !configured.satisfied)
    return { receipt: prepare("rejected", journal), statements: [] };
  const transitionMillis = yield* readEngineNowMillis(mapping.d1);
  const transitionInstant = mapping.encodeInstant(transitionMillis);

  const targetCredentialId =
    current.targetCredential?.[mapping.credential.credentialId] ??
    (yield* allocate(mapping.allocateCredentialId, mapping.allocateCredentialIdSync));

  const targetIdentifierRevision = yield* allocate(
    mapping.allocateRevision,
    mapping.allocateRevisionSync,
  );

  const targetCredentialRevision = yield* allocate(
    mapping.allocateRevision,
    mapping.allocateRevisionSync,
  );

  const sourceIdentifierRevision = yield* allocate(
    mapping.allocateRevision,
    mapping.allocateRevisionSync,
  );

  const sourceCredentialRevision = yield* allocate(
    mapping.allocateRevision,
    mapping.allocateRevisionSync,
  );

  const confirmsExisting =
    action === "verify-address" && input.captured.targetIdentifierRevision !== undefined;

  const nextRevision = confirmsExisting
    ? input.captured.revision.securityRevision
    : yield* allocate(
        mapping.subject.nextSecurityRevision?.(input.captured.revision.securityRevision) ??
          mapping.allocateRevision,
        mapping.subject.nextSecurityRevisionSync === undefined
          ? mapping.allocateRevisionSync
          : () =>
              mapping.subject.nextSecurityRevisionSync!(input.captured.revision.securityRevision),
      );

  if (
    (!confirmsExisting && nextRevision === input.captured.revision.securityRevision) ||
    (current.targetIdentifier !== undefined &&
      targetIdentifierRevision === current.targetIdentifier[mapping.identifier.bindingRevision]) ||
    (current.targetCredential !== undefined &&
      targetCredentialRevision ===
        current.targetCredential[mapping.credential.credentialRevision]) ||
    (current.source !== undefined &&
      (sourceIdentifierRevision === current.source.snapshot.identifierRevision ||
        sourceCredentialRevision === current.source.snapshot.credentialRevision))
  )
    return yield* unavailable();
  const statements: Statement<any>[] = [];
  const i = mapping.identifier;
  const c = mapping.credential;
  const a = mapping.authorityCredential;
  const sc = current.source;
  const authorityMarker = `effect-auth-email-guard:authority:${input.commandId}`;

  const targetIdentifierPrecondition =
    current.targetIdentifier === undefined
      ? notExistsSql(
          sql`select 1 from ${i.table} where ${column(i.table, i.namespace)}=${sql.param(input.target.namespace, column(i.table, i.namespace))} and ${column(i.table, i.value)}=${sql.param(input.target.value, column(i.table, i.value))}`,
        )
      : existsSql(
          sql`select 1 from ${i.table} where ${column(i.table, i.bindingRevision)}=${sql.param(current.targetIdentifier[i.bindingRevision], column(i.table, i.bindingRevision))} and ${i.d1MutableTargetCondition(
            {
              identifier: input.target,
              nativeSubjectId: current.nativeSubjectId,
            },
          )}`,
        );

  const targetCredentialPrecondition =
    current.targetCredential === undefined
      ? notExistsSql(
          sql`select 1 from ${c.table} where ${column(c.table, c.moduleId)}=${sql.param(input.moduleId, column(c.table, c.moduleId))} and ${column(c.table, c.identifierNamespace)}=${sql.param(input.target.namespace, column(c.table, c.identifierNamespace))} and ${column(c.table, c.identifierValue)}=${sql.param(input.target.value, column(c.table, c.identifierValue))}`,
        )
      : existsSql(
          sql`select 1 from ${c.table} where ${column(c.table, c.moduleId)}=${sql.param(input.moduleId, column(c.table, c.moduleId))} and ${column(c.table, c.credentialId)}=${sql.param(current.targetCredential[c.credentialId], column(c.table, c.credentialId))} and ${column(c.table, c.subjectId)}=${sql.param(current.nativeSubjectId, column(c.table, c.subjectId))} and ${column(c.table, c.credentialRevision)}=${sql.param(current.targetCredential[c.credentialRevision], column(c.table, c.credentialRevision))} and ${column(c.table, c.status)}<>${sql.param(c.d1ActiveStatusValue, column(c.table, c.status))}`,
        );

  const sourcePrecondition =
    action === "verify-address"
      ? sql`true`
      : and(
          existsSql(
            sql`select 1 from ${i.table} where ${i.d1CurrentCondition({
              identifier: sc!.snapshot.identifier,
              nativeSubjectId: current.nativeSubjectId,
              bindingRevision: sc!.snapshot.identifierRevision,
            })}`,
          ),
          existsSql(
            sql`select 1 from ${c.table} where ${column(c.table, c.moduleId)}=${sql.param(input.moduleId, column(c.table, c.moduleId))} and ${column(c.table, c.credentialId)}=${sql.param(sc!.snapshot.credentialId, column(c.table, c.credentialId))} and ${column(c.table, c.subjectId)}=${sql.param(current.nativeSubjectId, column(c.table, c.subjectId))} and ${column(c.table, c.credentialRevision)}=${sql.param(sc!.snapshot.credentialRevision, column(c.table, c.credentialRevision))} and ${column(c.table, c.status)}=${sql.param(c.d1ActiveStatusValue, column(c.table, c.status))}`,
          ),
        )!;

  statements.push(
    yield* assertion(
      and(
        subjectCondition(mapping, current, input.captured.revision.securityRevision),
        authorityRevisionCondition(mapping, current),
        targetIdentifierPrecondition,
        targetCredentialPrecondition,
        sourcePrecondition,
        evidenceCondition(mapping, input.authorization.evidence, input.authorization.requirement),
        evidenceCondition(mapping, input.authorization.evidence, requirement),
      )!,
      authorityMarker,
    ),
  );

  if (action === "change-address") {
    statements.push(
      yield* statement(
        database
          .update(i.table)
          .set(
            i.encodeRetirement({
              source: sc!.snapshot.identifier,
              bindingRevision: sourceIdentifierRevision,
            }),
          )
          .where(
            and(
              eq(column(i.table, i.namespace), sc!.snapshot.identifier.namespace),
              eq(column(i.table, i.value), sc!.snapshot.identifier.value),
              eq(column(i.table, i.subjectId), current.nativeSubjectId),
              eq(column(i.table, i.bindingRevision), sc!.snapshot.identifierRevision),
            ),
          ),
      ),
    );
    statements.push(
      yield* statement(
        database
          .update(c.table)
          .set(
            c.encodeRetirement({
              source: sc!.snapshot.identifier,
              credentialRevision: sourceCredentialRevision,
            }),
          )
          .where(
            and(
              eq(column(c.table, c.moduleId), input.moduleId),
              eq(column(c.table, c.credentialId), sc!.snapshot.credentialId),
              eq(column(c.table, c.subjectId), current.nativeSubjectId),
              eq(column(c.table, c.credentialRevision), sc!.snapshot.credentialRevision),
            ),
          ),
      ),
    );
    statements.push(
      yield* statement(
        database
          .update(a.table)
          .set(a.encodeRetirement(sourceCredentialRevision))
          .where(
            and(
              eq(column(a.table, a.subjectId), current.nativeSubjectId),
              eq(column(a.table, a.credentialId), sc!.snapshot.credentialId),
              eq(column(a.table, a.revision), sc!.snapshot.credentialRevision),
            ),
          ),
      ),
    );
  }
  if (current.targetIdentifier === undefined)
    statements.push(
      yield* statement(
        database.insert(i.table).values(
          driverValues(
            i.encodeVerifiedInsert({
              identifier: input.target,
              subjectId: current.nativeSubjectId,
              verifiedAtMillis: transitionMillis,
              bindingRevision: targetIdentifierRevision,
            }),
            [[i.verifiedAt, transitionInstant]],
          ),
        ),
      ),
    );
  else
    statements.push(
      yield* statement(
        database
          .update(i.table)
          .set(
            driverValues(
              i.encodeVerification({
                verifiedAtMillis: transitionMillis,
                bindingRevision: targetIdentifierRevision,
              }),
              [[i.verifiedAt, transitionInstant]],
            ),
          )
          .where(
            and(
              eq(column(i.table, i.namespace), input.target.namespace),
              eq(column(i.table, i.value), input.target.value),
              eq(column(i.table, i.subjectId), current.nativeSubjectId),
              eq(column(i.table, i.bindingRevision), current.targetIdentifier![i.bindingRevision]),
            ),
          ),
      ),
    );
  if (current.targetCredential === undefined) {
    statements.push(
      yield* statement(
        database.insert(c.table).values(
          c.encodeVerifiedInsert({
            moduleId: input.moduleId,
            subjectId: current.nativeSubjectId,
            credentialId: targetCredentialId,
            identifier: input.target,
            credentialRevision: targetCredentialRevision,
          }),
        ),
      ),
    );
    statements.push(
      yield* statement(
        database.insert(a.table).values(
          a.encodeInsert({
            subjectId: current.nativeSubjectId,
            credentialId: targetCredentialId,
            revision: targetCredentialRevision,
          }),
        ),
      ),
    );
  } else {
    const oldRevision = current.targetCredential[c.credentialRevision];

    statements.push(
      yield* statement(
        database
          .update(c.table)
          .set(
            c.encodeActivation({
              identifier: input.target,
              credentialRevision: targetCredentialRevision,
            }),
          )
          .where(
            and(
              eq(column(c.table, c.moduleId), input.moduleId),
              eq(column(c.table, c.credentialId), targetCredentialId),
              eq(column(c.table, c.subjectId), current.nativeSubjectId),
              eq(column(c.table, c.credentialRevision), oldRevision),
            ),
          ),
      ),
    );
    statements.push(
      yield* statement(
        database
          .update(a.table)
          .set(a.encodeActivation(targetCredentialRevision))
          .where(
            and(
              eq(column(a.table, a.subjectId), current.nativeSubjectId),
              eq(column(a.table, a.credentialId), targetCredentialId),
              eq(column(a.table, a.revision), oldRevision),
            ),
          ),
      ),
    );
  }
  statements.push(
    yield* statement(
      database
        .update(mapping.subject.table)
        .set(updateValues<any>([[mapping.subject.securityRevision, nextRevision]]))
        .where(
          and(
            eq(column(mapping.subject.table, mapping.subject.id), current.nativeSubjectId),
            eq(
              column(mapping.subject.table, mapping.subject.securityRevision),
              input.captured.revision.securityRevision,
            ),
          ),
        ),
    ),
  );
  statements.push(
    yield* statement(
      database.insert(mapping.command.table).values(
        driverValues(
          mapping.command.encodeInsert({
            moduleId: input.moduleId,
            commandId: input.commandId,
            action,
            bindingDigest: input.authorization.challenge.bindingDigest,
            retentionUntilMillis: transitionMillis + mapping.commandRetentionMillis,
          }),
          [
            [
              mapping.command.retentionUntil,
              mapping.encodeInstant(transitionMillis + mapping.commandRetentionMillis),
            ],
          ],
        ),
      ),
    ),
  );

  const targetExists = existsSql(
    sql`select 1 from ${i.table} where ${column(i.table, i.bindingRevision)}=${sql.param(targetIdentifierRevision, column(i.table, i.bindingRevision))} and ${column(i.table, i.verifiedAt)}=${sql.param(transitionInstant, column(i.table, i.verifiedAt))} and ${i.d1CurrentCondition({ identifier: input.target, nativeSubjectId: current.nativeSubjectId, bindingRevision: targetIdentifierRevision })}`,
  );

  const credentialExists = existsSql(
    sql`select 1 from ${c.table} where ${column(c.table, c.moduleId)}=${sql.param(input.moduleId, column(c.table, c.moduleId))} and ${column(c.table, c.credentialId)}=${sql.param(targetCredentialId, column(c.table, c.credentialId))} and ${column(c.table, c.subjectId)}=${sql.param(current.nativeSubjectId, column(c.table, c.subjectId))} and ${column(c.table, c.identifierNamespace)}=${sql.param(input.target.namespace, column(c.table, c.identifierNamespace))} and ${column(c.table, c.identifierValue)}=${sql.param(input.target.value, column(c.table, c.identifierValue))} and ${column(c.table, c.credentialRevision)}=${sql.param(targetCredentialRevision, column(c.table, c.credentialRevision))} and ${column(c.table, c.status)}=${sql.param(c.d1ActiveStatusValue, column(c.table, c.status))}`,
  );

  const authorityExists = existsSql(
    sql`select 1 from ${a.table} where ${column(a.table, a.subjectId)}=${sql.param(current.nativeSubjectId, column(a.table, a.subjectId))} and ${column(a.table, a.credentialId)}=${sql.param(targetCredentialId, column(a.table, a.credentialId))} and ${column(a.table, a.revision)}=${sql.param(targetCredentialRevision, column(a.table, a.revision))} and ${column(a.table, a.status)}=${sql.param(a.d1ActiveStatusValue, column(a.table, a.status))}`,
  );

  const commandExists = existsSql(
    sql`select 1 from ${mapping.command.table} where ${column(mapping.command.table, mapping.command.moduleId)}=${sql.param(input.moduleId, column(mapping.command.table, mapping.command.moduleId))} and ${column(mapping.command.table, mapping.command.commandId)}=${sql.param(input.commandId, column(mapping.command.table, mapping.command.commandId))} and ${column(mapping.command.table, mapping.command.action)}=${sql.param(action, column(mapping.command.table, mapping.command.action))} and ${column(mapping.command.table, mapping.command.bindingDigest)}=${sql.param(input.authorization.challenge.bindingDigest, column(mapping.command.table, mapping.command.bindingDigest))} and ${column(mapping.command.table, mapping.command.retentionUntil)}=${sql.param(mapping.encodeInstant(transitionMillis + mapping.commandRetentionMillis), column(mapping.command.table, mapping.command.retentionUntil))}`,
  );

  const sourceRetired =
    action === "verify-address"
      ? sql`true`
      : and(
          existsSql(
            sql`select 1 from ${i.table} where ${column(i.table, i.namespace)}=${sql.param(sc!.snapshot.identifier.namespace, column(i.table, i.namespace))} and ${column(i.table, i.value)}=${sql.param(sc!.snapshot.identifier.value, column(i.table, i.value))} and ${column(i.table, i.subjectId)}=${sql.param(current.nativeSubjectId, column(i.table, i.subjectId))} and ${column(i.table, i.bindingRevision)}=${sql.param(sourceIdentifierRevision, column(i.table, i.bindingRevision))} and not (${i.d1CurrentCondition({ identifier: sc!.snapshot.identifier, nativeSubjectId: current.nativeSubjectId, bindingRevision: sourceIdentifierRevision })})`,
          ),
          existsSql(
            sql`select 1 from ${c.table} where ${column(c.table, c.moduleId)}=${sql.param(input.moduleId, column(c.table, c.moduleId))} and ${column(c.table, c.credentialId)}=${sql.param(sc!.snapshot.credentialId, column(c.table, c.credentialId))} and ${column(c.table, c.subjectId)}=${sql.param(current.nativeSubjectId, column(c.table, c.subjectId))} and ${column(c.table, c.identifierNamespace)}=${sql.param(sc!.snapshot.identifier.namespace, column(c.table, c.identifierNamespace))} and ${column(c.table, c.identifierValue)}=${sql.param(sc!.snapshot.identifier.value, column(c.table, c.identifierValue))} and ${column(c.table, c.credentialRevision)}=${sql.param(sourceCredentialRevision, column(c.table, c.credentialRevision))} and ${column(c.table, c.status)}<>${sql.param(c.d1ActiveStatusValue, column(c.table, c.status))}`,
          ),
          existsSql(
            sql`select 1 from ${a.table} where ${column(a.table, a.subjectId)}=${sql.param(current.nativeSubjectId, column(a.table, a.subjectId))} and ${column(a.table, a.credentialId)}=${sql.param(sc!.snapshot.credentialId, column(a.table, a.credentialId))} and ${column(a.table, a.revision)}=${sql.param(sourceCredentialRevision, column(a.table, a.revision))} and ${column(a.table, a.status)}<>${sql.param(a.d1ActiveStatusValue, column(a.table, a.status))}`,
          ),
        )!;

  const applied = and(
    subjectCondition(mapping, current, nextRevision),
    targetExists,
    credentialExists,
    authorityExists,
    commandExists,
    sourceRetired,
    evidenceCondition(mapping, input.authorization.evidence, input.authorization.requirement),
    evidenceCondition(mapping, input.authorization.evidence, requirement),
  )!;

  const compiled = yield* compileD1ProofCompletionPlan(
    proofMapping,
    input.completion,
    { statements, appliedCondition: applied },
    (decision) => decision,
  );

  const marker = `effect-auth-proof-guard:protected:${input.completion.input.continuationId}`;

  return {
    receipt: prepare(compiled.statements.length === 0 ? "rejected" : "changed", journal),
    statements: compiled.statements,
    retryable: (cause: unknown) =>
      guardFailure(cause, marker) ||
      guardFailure(cause, authorityMarker) ||
      isMappedConstraintConflict(mapping.isCommandConflict, cause) ||
      isMappedConstraintConflict(mapping.isIdentifierConflict, cause) ||
      isMappedConstraintConflict(mapping.isCredentialConflict, cause),
  };
});

const awaitRows = <A>(
  effect: Effect.Effect<A, PersistenceMappingError | EffectDrizzleQueryError>,
) => effect;

const probeCompletion = Effect.fn("DrizzleD1.probeCompletion")(function* (
  proofMapping: ProofMapping,
  input: ProofCompletionInput,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const plan: ProofCompletionPlan = {
    input,
    prepare: (decision, journal, project) => journal.prepare(project(decision)),
  };

  const marker = `effect-auth-proof-guard:protected:${input.continuationId}`;

  const once = coordinateCommit(
    () =>
      Effect.gen(function* () {
        const compiled = yield* compileD1ProofCompletionPlan(
          proofMapping,
          plan,
          { statements: [], appliedCondition: sql`false` },
          () => false,
        );

        if (compiled.statements.length === 0) return false;
        yield* database.$client.batch(compiled.statements);

        return false;
      }),
    { mode: "batch" },
  );

  return yield* once.pipe(
    Effect.as(false),
    Effect.catchCause((cause) =>
      guardFailure(cause, marker) ? Effect.succeed(true) : Effect.failCause(cause),
    ),
  );
});

const makeAddressPlans = (mapping: AddressMapping, proofMapping: ProofMapping) => ({
  target: (input: Parameters<EmailAddressPersistence["Service"]["target"]>[0]) =>
    currentAddress(mapping, input, false).pipe(
      Effect.flatMap((current) =>
        current === undefined
          ? Effect.fail(unavailable())
          : Effect.succeed({
              revision: current.revision,
              eligible: current.eligible,
              ...(current.targetIdentifierRevision === undefined
                ? {}
                : { targetIdentifierRevision: current.targetIdentifierRevision }),
              ...(current.source === undefined ? {} : { source: current.source.snapshot }),
            }),
      ),
    ),
  checkCompletion: (
    input: Parameters<EmailAddressPersistence["Service"]["checkCompletion"]>[0],
  ) => {
    if (input.binding._tag !== "IdentifierChange") return Effect.succeed(false);
    const binding = input.binding;

    const action: EmailAction | undefined =
      input.moduleId.endsWith("/verify-address") && input.purpose === "email-address-verification"
        ? "verify-address"
        : input.moduleId.endsWith("/change-address") && input.purpose === "email-address-change"
          ? "change-address"
          : undefined;

    if (action === undefined) return Effect.succeed(false);
    const moduleId = input.moduleId.slice(0, -`/${action}`.length);

    return currentAddress(
      mapping,
      {
        moduleId,
        subjectId: binding.revision.subjectId,
        target: binding.identifier,
      },
      false,
    ).pipe(
      Effect.flatMap((current) =>
        current !== undefined && sameEmailRevision(current.revision, binding.revision)
          ? probeCompletion(proofMapping, input)
          : Effect.succeed(false),
      ),
    );
  },
  verifyWithProof: <A>(
    input: Parameters<EmailAddressPersistence["Service"]["verifyWithProof"]>[0],
    prepare: PlanPrepare<EmailAddressPersistence["Service"]["verifyWithProof"], A>,
  ) => mutationPlan(mapping, proofMapping, input, "verify-address", prepare),
  changeWithProof: <A>(
    input: Parameters<EmailAddressPersistence["Service"]["changeWithProof"]>[0],
    prepare: PlanPrepare<EmailAddressPersistence["Service"]["changeWithProof"], A>,
  ) => mutationPlan(mapping, proofMapping, input, "change-address", prepare),
  cleanup: <A>(
    input: Parameters<EmailAddressPersistence["Service"]["cleanup"]>[0],
    prepare: PlanPrepare<EmailAddressPersistence["Service"]["cleanup"], A>,
  ) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      const journal = yield* CurrentCommitJournal;

      const module = column(mapping.command.table, mapping.command.moduleId);
      const id = column(mapping.command.table, mapping.command.commandId);
      const retention = column(mapping.command.table, mapping.command.retentionUntil);

      const rows = yield* awaitRows(
        database
          .select({ commandId: id })
          .from(mapping.command.table)
          .where(and(eq(module, input.moduleId), lte(retention, mapping.d1.engineNow)))
          .limit(input.limit + 1),
      );

      const selected = rows.slice(0, input.limit);
      const marker = `effect-auth-email-guard:cleanup:${input.moduleId}`;
      const selectedIds = selected.map((row: any) => row.commandId);

      const selectedWhere = and(
        eq(module, input.moduleId),
        inArray(id, selectedIds),
        lte(retention, mapping.d1.engineNow),
      );

      const statements =
        selected.length === 0
          ? []
          : [
              yield* assertion(
                sql`(select count(*) from ${mapping.command.table} where ${selectedWhere})=${selected.length}`,
                marker,
              ),
              yield* statement(database.delete(mapping.command.table).where(selectedWhere)),
            ];

      return {
        receipt: prepare({ removed: selected.length, hasMore: rows.length > input.limit }, journal),
        statements,
        retryable: (cause: unknown) => guardFailure(cause, marker),
      };
    }),
});

const registrationRows = Effect.fn("Drizzle.registrationRows")(function* <Registration>(
  mapping: RegistrationMapping<Registration>,
  moduleId: string,
  commandId: string,
) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* awaitRows(
    database
      .select()
      .from(mapping.registration.table)
      .where(
        and(
          eq(column(mapping.registration.table, mapping.registration.moduleId), moduleId),
          eq(column(mapping.registration.table, mapping.registration.commandId), commandId),
        ),
      )
      .limit(1),
  );
});

const sameIdentifier = (left: LoginIdentifier, right: LoginIdentifier) =>
  left.namespace === right.namespace && left.value === right.value;

const registrationCompletionMatches = <Registration>(
  mapping: RegistrationMapping<Registration>,
  input: {
    readonly moduleId: string;
    readonly identifier: LoginIdentifier;
    readonly completion: ProofCompletionPlan;
  },
) =>
  input.completion.input.moduleId === `${input.moduleId}/registration` &&
  input.completion.input.purpose === "email-code-registration" &&
  input.completion.input.binding._tag === "Identifier" &&
  sameIdentifier(input.completion.input.binding.identifier, input.identifier) &&
  mapping.constraints.request === requiredEmailRegistrationConstraints.request &&
  mapping.constraints.pendingReference === requiredEmailRegistrationConstraints.pendingReference &&
  (mapping.mode === "pending" ||
    Object.entries(requiredEmailRegistrationConstraints).every(
      ([key, value]) =>
        mapping.constraints[key as keyof typeof requiredEmailRegistrationConstraints] === value,
    ));

const registrationPlan = Effect.fn("Drizzle.registrationPlan")(function* <Registration, A>(
  mapping: RegistrationMapping<Registration> & { readonly d1: AddressMapping["d1"] },
  proofMapping: ProofMapping,
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
  prepare: (value: EmailRegistrationDecision, journal: CommitJournal) => PreparedCommit<A>,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const journal = yield* CurrentCommitJournal;

  const existing = (yield* registrationRows(mapping, input.moduleId, input.commandId))[0];

  if (existing !== undefined) {
    const decision =
      existing[mapping.registration.fingerprint] !== input.fingerprint
        ? ({ _tag: "Rejected" } as const)
        : yield* mapping.registration.decodeReplay(existing);

    return { receipt: prepare(decision, journal), statements: [] };
  }
  if (
    !registrationCompletionMatches(mapping, input) ||
    !inspected.eligible ||
    inspected.fingerprint !== input.fingerprint ||
    (mapping.mode === "atomic" &&
      (mapping.provisioning.idMode === "generated" ||
        mapping.subject.d1ActiveStatusValue === undefined ||
        mapping.identifier.d1CurrentCondition === undefined ||
        mapping.credential.d1ActiveStatusValue === undefined ||
        mapping.authorityCredential.d1ActiveStatusValue === undefined))
  )
    return { receipt: prepare({ _tag: "Rejected" }, journal), statements: [] };

  const target =
    mapping.mode === "atomic"
      ? yield* readEmailRegistrationTarget(mapping, input.identifier, false)
      : undefined;

  if (target?._tag === "Rejected")
    return { receipt: prepare({ _tag: "Rejected" }, journal), statements: [] };
  if (
    target?._tag === "Reserved" &&
    (allocated.displacedSecurityRevision === undefined ||
      allocated.displacedSecurityRevision === target.securityRevision ||
      allocated.identifierRevision === target.bindingRevision)
  )
    return yield* unavailable();

  const intent = {
    moduleId: input.moduleId,
    commandId: input.commandId,
    identifier: input.identifier,
    registration: input.registration,
    fingerprint: input.fingerprint,
    completion: {
      moduleId: input.completion.input.moduleId,
      purpose: input.completion.input.purpose,
      continuationId: input.completion.input.continuationId,
      binding: input.completion.input.binding,
    },
  };

  const transitionMillis = yield* readEngineNowMillis(mapping.d1);
  const retentionInstant = mapping.encodeInstant(transitionMillis + mapping.retentionMillis);
  const statements: Statement<any>[] = [];
  let applied: SQL;
  let desired: EmailRegistrationDecision;
  const registrationModule = column(mapping.registration.table, mapping.registration.moduleId);
  const registrationCommand = column(mapping.registration.table, mapping.registration.commandId);

  const registrationFingerprint = column(
    mapping.registration.table,
    mapping.registration.fingerprint,
  );

  const registrationState = column(mapping.registration.table, mapping.registration.state);

  if (mapping.mode === "pending") {
    if (allocated.pendingReference === undefined)
      return { receipt: prepare({ _tag: "Rejected" }, journal), statements: [] };
    desired = { _tag: "ProvisioningPending", reference: allocated.pendingReference };
    statements.push(
      yield* statement(
        database.insert(mapping.registration.table).values(
          driverValues(
            mapping.registration.encodeInsert(intent, {
              state: "pending",
              pendingReference: allocated.pendingReference,
              retentionUntilMillis: transitionMillis + mapping.retentionMillis,
            }),
            [[mapping.registration.retentionUntil, retentionInstant]],
          ),
        ),
      ),
    );
    applied = existsSql(
      sql`select 1 from ${mapping.registration.table} where ${registrationModule}=${sql.param(input.moduleId, registrationModule)} and ${registrationCommand}=${sql.param(input.commandId, registrationCommand)} and ${registrationFingerprint}=${sql.param(input.fingerprint, registrationFingerprint)} and ${registrationState}='pending' and ${column(mapping.registration.table, mapping.registration.pendingReference)}=${sql.param(allocated.pendingReference, column(mapping.registration.table, mapping.registration.pendingReference))} and ${column(mapping.registration.table, mapping.registration.subjectId)} is null and ${column(mapping.registration.table, mapping.registration.retentionUntil)}=${sql.param(retentionInstant, column(mapping.registration.table, mapping.registration.retentionUntil))}`,
    );
  } else {
    if (
      allocated.nativeSubjectId === undefined ||
      allocated.credentialId === undefined ||
      allocated.securityRevision === undefined ||
      allocated.identifierRevision === undefined ||
      allocated.credentialRevision === undefined
    )
      return { receipt: prepare({ _tag: "Rejected" }, journal), statements: [] };
    const nativeSubjectId = allocated.nativeSubjectId;

    desired = { _tag: "Registered" };
    const i = mapping.identifier;
    const s = mapping.subject;
    const marker = `effect-auth-proof-guard:protected:${input.completion.input.continuationId}`;

    if (target?._tag === "Reserved") {
      // The planning reads hold no locks. Guard both ownership and the displaced
      // subject revision before any provisioning or invalidation can commit.
      statements.push(
        yield* assertion(
          and(
            existsSql(sql`select 1 from ${i.table} where
          ${column(i.table, i.namespace)}=${sql.param(input.identifier.namespace, column(i.table, i.namespace))}
          and ${column(i.table, i.value)}=${sql.param(input.identifier.value, column(i.table, i.value))}
          and ${column(i.table, i.subjectId)}=${sql.param(target.nativeSubjectId, column(i.table, i.subjectId))}
          and ${column(i.table, i.bindingRevision)}=${sql.param(target.bindingRevision, column(i.table, i.bindingRevision))}
          and ${column(i.table, i.verifiedAt)} is null`),
            existsSql(sql`select 1 from ${s.table} where
          ${column(s.table, s.id)}=${sql.param(target.nativeSubjectId, column(s.table, s.id))}
          and ${column(s.table, s.securityRevision)}=${sql.param(target.securityRevision, column(s.table, s.securityRevision))}`),
          )!,
          marker,
        ),
      );
    }
    statements.push(
      yield* statement(
        database.insert(mapping.subject.table).values(
          mapping.provisioning.encodeSubjectInsert(intent, {
            nativeSubjectId,
            securityRevision: allocated.securityRevision,
          }),
        ),
      ),
      ...(target?._tag === "Reserved"
        ? [
            yield* statement(
              database
                .update(i.table)
                .set(
                  updateValues([
                    [i.subjectId, nativeSubjectId],
                    [i.verifiedAt, mapping.encodeInstant(transitionMillis)],
                    [i.bindingRevision, allocated.identifierRevision],
                  ]),
                )
                .where(
                  and(
                    eq(column(i.table, i.namespace), input.identifier.namespace),
                    eq(column(i.table, i.value), input.identifier.value),
                    eq(column(i.table, i.subjectId), target.nativeSubjectId),
                    eq(column(i.table, i.bindingRevision), target.bindingRevision),
                    sql`${column(i.table, i.verifiedAt)} is null`,
                  ),
                ),
            ),
            yield* statement(
              database
                .update(s.table)
                .set(updateValues([[s.securityRevision, allocated.displacedSecurityRevision]]))
                .where(
                  and(
                    eq(column(s.table, s.id), target.nativeSubjectId),
                    eq(column(s.table, s.securityRevision), target.securityRevision),
                  ),
                ),
            ),
          ]
        : [
            yield* statement(
              database.insert(i.table).values(
                driverValues(
                  i.encodeVerifiedInsert({
                    identifier: input.identifier,
                    subjectId: nativeSubjectId,
                    verifiedAtMillis: transitionMillis,
                    bindingRevision: allocated.identifierRevision,
                  }),
                  [[i.verifiedAt, mapping.encodeInstant(transitionMillis)]],
                ),
              ),
            ),
          ]),
      yield* statement(
        database.insert(mapping.credential.table).values(
          mapping.credential.encodeVerifiedInsert({
            moduleId: input.moduleId,
            subjectId: nativeSubjectId,
            credentialId: allocated.credentialId,
            identifier: input.identifier,
            credentialRevision: allocated.credentialRevision,
          }),
        ),
      ),
      yield* statement(
        database.insert(mapping.authorityCredential.table).values(
          mapping.authorityCredential.encodeInsert({
            subjectId: nativeSubjectId,
            credentialId: allocated.credentialId,
            revision: allocated.credentialRevision,
          }),
        ),
      ),
      yield* statement(
        database.insert(mapping.registration.table).values(
          driverValues(
            mapping.registration.encodeInsert(intent, {
              state: "registered",
              nativeSubjectId,
              retentionUntilMillis: transitionMillis + mapping.retentionMillis,
            }),
            [[mapping.registration.retentionUntil, retentionInstant]],
          ),
        ),
      ),
    );
    const sId = column(mapping.subject.table, mapping.subject.id);
    const sStatus = column(mapping.subject.table, mapping.subject.status);
    const sRevision = column(mapping.subject.table, mapping.subject.securityRevision);
    const iNamespace = column(mapping.identifier.table, mapping.identifier.namespace);
    const iValue = column(mapping.identifier.table, mapping.identifier.value);
    const iSubject = column(mapping.identifier.table, mapping.identifier.subjectId);
    const iVerifiedAt = column(mapping.identifier.table, mapping.identifier.verifiedAt);
    const iRevision = column(mapping.identifier.table, mapping.identifier.bindingRevision);
    const cModule = column(mapping.credential.table, mapping.credential.moduleId);
    const cSubject = column(mapping.credential.table, mapping.credential.subjectId);
    const cId = column(mapping.credential.table, mapping.credential.credentialId);
    const cNamespace = column(mapping.credential.table, mapping.credential.identifierNamespace);
    const cValue = column(mapping.credential.table, mapping.credential.identifierValue);
    const cRevision = column(mapping.credential.table, mapping.credential.credentialRevision);

    const aSubject = column(
      mapping.authorityCredential.table,
      mapping.authorityCredential.subjectId,
    );

    const aId = column(mapping.authorityCredential.table, mapping.authorityCredential.credentialId);

    const aRevision = column(
      mapping.authorityCredential.table,
      mapping.authorityCredential.revision,
    );

    applied = and(
      target?._tag === "Reserved"
        ? existsSql(sql`select 1 from ${s.table} where
            ${sId}=${sql.param(target.nativeSubjectId, sId)}
            and ${sRevision}=${sql.param(allocated.displacedSecurityRevision, sRevision)}`)
        : sql`true`,
      existsSql(
        sql`select 1 from ${mapping.subject.table} where ${sId}=${sql.param(nativeSubjectId, sId)} and ${sStatus}=${sql.param(mapping.subject.d1ActiveStatusValue, sStatus)} and ${sRevision}=${sql.param(allocated.securityRevision, sRevision)}`,
      ),
      existsSql(
        sql`select 1 from ${mapping.identifier.table} where ${iNamespace}=${sql.param(input.identifier.namespace, iNamespace)} and ${iValue}=${sql.param(input.identifier.value, iValue)} and ${iSubject}=${sql.param(nativeSubjectId, iSubject)} and ${iVerifiedAt}=${sql.param(mapping.encodeInstant(transitionMillis), iVerifiedAt)} and ${iRevision}=${sql.param(allocated.identifierRevision, iRevision)} and ${mapping.identifier.d1CurrentCondition!({ identifier: input.identifier, nativeSubjectId, bindingRevision: allocated.identifierRevision })}`,
      ),
      existsSql(
        sql`select 1 from ${mapping.credential.table} where ${cModule}=${sql.param(input.moduleId, cModule)} and ${cSubject}=${sql.param(nativeSubjectId, cSubject)} and ${cId}=${sql.param(allocated.credentialId, cId)} and ${cNamespace}=${sql.param(input.identifier.namespace, cNamespace)} and ${cValue}=${sql.param(input.identifier.value, cValue)} and ${cRevision}=${sql.param(allocated.credentialRevision, cRevision)} and ${column(mapping.credential.table, mapping.credential.status)}=${sql.param(mapping.credential.d1ActiveStatusValue, column(mapping.credential.table, mapping.credential.status))}`,
      ),
      existsSql(
        sql`select 1 from ${mapping.authorityCredential.table} where ${aSubject}=${sql.param(nativeSubjectId, aSubject)} and ${aId}=${sql.param(allocated.credentialId, aId)} and ${aRevision}=${sql.param(allocated.credentialRevision, aRevision)} and ${column(mapping.authorityCredential.table, mapping.authorityCredential.status)}=${sql.param(mapping.authorityCredential.d1ActiveStatusValue, column(mapping.authorityCredential.table, mapping.authorityCredential.status))}`,
      ),
      existsSql(
        sql`select 1 from ${mapping.registration.table} where ${registrationModule}=${sql.param(input.moduleId, registrationModule)} and ${registrationCommand}=${sql.param(input.commandId, registrationCommand)} and ${registrationFingerprint}=${sql.param(input.fingerprint, registrationFingerprint)} and ${registrationState}='registered' and ${column(mapping.registration.table, mapping.registration.subjectId)}=${sql.param(nativeSubjectId, column(mapping.registration.table, mapping.registration.subjectId))} and ${column(mapping.registration.table, mapping.registration.pendingReference)} is null and ${column(mapping.registration.table, mapping.registration.retentionUntil)}=${sql.param(retentionInstant, column(mapping.registration.table, mapping.registration.retentionUntil))}`,
      ),
    )!;
  }
  let receipt: PreparedCommit<A> | undefined;

  const compiled = yield* compileD1ProofCompletionPlan(
    proofMapping,
    input.completion,
    { statements, appliedCondition: applied },
    (completion) => {
      receipt = prepare(completion === "completed" ? desired : { _tag: "Rejected" }, journal);

      return completion;
    },
  );

  const marker = `effect-auth-proof-guard:protected:${input.completion.input.continuationId}`;

  return {
    receipt: receipt ?? prepare({ _tag: "Rejected" }, journal),
    statements: compiled.statements,
    retryable: (cause: unknown) =>
      guardFailure(cause, marker) ||
      isMappedConstraintConflict(mapping.isRequestConflict, cause) ||
      (mapping.mode === "atomic" &&
        (isMappedConstraintConflict(mapping.isIdentifierConflict, cause) ||
          isMappedConstraintConflict(mapping.isCredentialConflict, cause))),
  };
});

const makeRegistrationPlans = <Registration>(
  mapping: RegistrationMapping<Registration> & { readonly d1: AddressMapping["d1"] },
  proofMapping: ProofMapping,
) => ({
  inspect: (input: Parameters<EmailRegistrationAuthority<Registration>["inspect"]>[0]) =>
    mapping.inspect(input),
  registerWithProof: <A>(
    uncaptured: Parameters<EmailRegistrationAuthority<Registration>["registerWithProof"]>[0],
    prepare: PlanPrepare<EmailRegistrationAuthority<Registration>["registerWithProof"], A>,
  ) =>
    Effect.gen(function* () {
      const registration = yield* mapping.snapshotRegistration(uncaptured.registration);
      const inspectionRegistration = yield* mapping.snapshotRegistration(uncaptured.registration);

      const input = Object.freeze({
        ...uncaptured,
        identifier: Object.freeze({ ...uncaptured.identifier }),
        registration,
      });

      const inspected = yield* mapping.inspect({
        identifier: input.identifier,
        registration: inspectionRegistration,
      });

      const atomic = mapping.mode === "atomic";

      const credentialId = atomic
        ? yield* allocate(mapping.allocateCredentialId, mapping.allocateCredentialIdSync)
        : undefined;

      const securityRevision = atomic
        ? yield* allocate(mapping.allocateRevision, mapping.allocateRevisionSync)
        : undefined;

      const displacedSecurityRevision = atomic
        ? yield* allocate(mapping.allocateRevision, mapping.allocateRevisionSync)
        : undefined;

      const identifierRevision = atomic
        ? yield* allocate(mapping.allocateRevision, mapping.allocateRevisionSync)
        : undefined;

      const credentialRevision = atomic
        ? yield* allocate(mapping.allocateRevision, mapping.allocateRevisionSync)
        : undefined;

      const nativeSubjectId =
        atomic && mapping.provisioning.idMode !== "generated"
          ? yield* allocate(
              mapping.provisioning.allocateSubjectId,
              mapping.provisioning.allocateSubjectIdSync,
            )
          : undefined;

      const pendingReference =
        mapping.mode === "pending"
          ? yield* allocate(mapping.allocatePendingReference, mapping.allocatePendingReferenceSync)
          : undefined;

      return yield* registrationPlan(
        mapping,
        proofMapping,
        input,
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
});

export const makeD1EmailSignInServices = <
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  NativeId,
>(
  mapping: EmailSignInMapping<S, I, C, NativeId>,
) =>
  Effect.flatMap(nativeDatabase(DatabaseService), (database) =>
    validateDrizzleStorage(mapping).pipe(
      Effect.provideService(NativeDatabase, database),
      Effect.mapError(unavailable),
      Effect.as({
        emailSignInTargets: EmailSignInTargets.of({
          lookup: (input) => {
            if (!validEmailSignInConstraints(mapping as any)) return Effect.fail(unavailable());

            return emailLookupRows(mapping as any, input.moduleId, input.identifier).pipe(
              Effect.flatMap((rows) => {
                const row = rows[0];

                if (row === undefined) return Effect.succeed(Option.none());

                return decodeEmailSnapshot(
                  mapping as any,
                  input.moduleId,
                  input.identifier,
                  row,
                ).pipe(
                  Effect.map((snapshot) =>
                    snapshot === undefined ? Option.none() : Option.some(snapshot),
                  ),
                );
              }),
              Effect.provideService(CurrentD1PlanningDatabase, database),
              translateFailure,
            );
          },
        }),
      }),
    ),
  );

export const makeD1EmailAddressServices = Effect.fnUntraced(function* <
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  M extends AnySQLiteTable,
  NativeId,
  PRq extends AnySQLiteTable,
  PS extends AnySQLiteTable,
  PG extends AnySQLiteTable,
  PCn extends AnySQLiteTable,
  PRs extends AnySQLiteTable,
  PAev extends AnySQLiteTable,
  PF extends AnySQLiteTable,
  PC extends AnySQLiteTable,
  PSub extends AnySQLiteTable,
  PI extends AnySQLiteTable,
  PCr extends AnySQLiteTable,
  PNativeId,
>(
  mapping: D1EmailAddressMapping<S, I, C, AC, M, NativeId>,
  proofMapping: D1ProofPersistenceMapping<
    PRq,
    PS,
    PG,
    PCn,
    PRs,
    PAev,
    PF,
    PC,
    PSub,
    PI,
    PCr,
    PNativeId
  >,
) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage({ ...mapping, proof: proofMapping }).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(unavailable),
  );

  const hooks = yield* LifecycleHooks;

  const plans = makeAddressPlans(
    mapping as unknown as AddressMapping,
    proofMapping as unknown as ProofMapping,
  );

  const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
    Effect.gen(function* () {
      if (yield* hasCommitScope) return yield* unavailable();

      return yield* executeStandalone(plan, 2);
    }).pipe(
      Effect.provideService(CurrentD1PlanningDatabase, database),
      Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
      Effect.provideService(LifecycleHooks, hooks),
    );

  const service: EmailAddressPersistence["Service"] = {
    target: (input) =>
      plans
        .target(input)
        .pipe(
          Effect.provideService(CurrentD1PlanningDatabase, database),
          Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    checkCompletion: (input) =>
      plans
        .checkCompletion(input)
        .pipe(
          Effect.provideService(CurrentD1PlanningDatabase, database),
          Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    verifyWithProof: (input, prepare) =>
      run(plans.verifyWithProof(input, prepare)).pipe(translateFailure),
    changeWithProof: (input, prepare) =>
      run(plans.changeWithProof(input, prepare)).pipe(translateFailure),
    cleanup: (input, prepare) => run(plans.cleanup(input, prepare)).pipe(translateFailure),
  };

  return { emailAddressPersistence: service };
});

export const makeD1EmailRegistrationServices = Effect.fnUntraced(function* <
  Registration,
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  Rq extends AnySQLiteTable,
  NativeId,
  PRq extends AnySQLiteTable,
  PS extends AnySQLiteTable,
  PG extends AnySQLiteTable,
  PCn extends AnySQLiteTable,
  PRs extends AnySQLiteTable,
  PAev extends AnySQLiteTable,
  PF extends AnySQLiteTable,
  PC extends AnySQLiteTable,
  PSub extends AnySQLiteTable,
  PI extends AnySQLiteTable,
  PCr extends AnySQLiteTable,
  PNativeId,
>(
  mapping: D1EmailRegistrationMapping<Registration, S, I, C, AC, Rq, NativeId>,
  proofMapping: D1ProofPersistenceMapping<
    PRq,
    PS,
    PG,
    PCn,
    PRs,
    PAev,
    PF,
    PC,
    PSub,
    PI,
    PCr,
    PNativeId
  >,
) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage({ ...mapping, proof: proofMapping }).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(unavailable),
  );

  const hooks = yield* LifecycleHooks;

  const plans = makeRegistrationPlans(
    mapping as unknown as RegistrationMapping<Registration> & {
      readonly d1: AddressMapping["d1"];
    },
    proofMapping as unknown as ProofMapping,
  );

  const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
    Effect.gen(function* () {
      if (yield* hasCommitScope) return yield* unavailable();

      return yield* executeStandalone(plan, 2);
    }).pipe(
      Effect.provideService(CurrentD1PlanningDatabase, database),
      Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
      Effect.provideService(LifecycleHooks, hooks),
    );

  const service: EmailRegistrationAuthority<Registration> = {
    inspect: (input) =>
      plans
        .inspect(input)
        .pipe(
          Effect.provideService(CurrentD1PlanningDatabase, database),
          Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    registerWithProof: (input, prepare) =>
      run(plans.registerWithProof(input, prepare)).pipe(translateFailure),
  };

  return { registrationAuthority: service };
});

type CoordinatorError<E> = E | EmailUnavailable | HookConfigurationError;

export function coordinateD1EmailAddress<
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  M extends AnySQLiteTable,
  NativeId,
  PRq extends AnySQLiteTable,
  PS extends AnySQLiteTable,
  PG extends AnySQLiteTable,
  PCn extends AnySQLiteTable,
  PRs extends AnySQLiteTable,
  PAev extends AnySQLiteTable,
  PF extends AnySQLiteTable,
  PC extends AnySQLiteTable,
  PSub extends AnySQLiteTable,
  PI extends AnySQLiteTable,
  PCr extends AnySQLiteTable,
  PNativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1EmailAddressMapping<S, I, C, AC, M, NativeId>;
    readonly proofMapping: D1ProofPersistenceMapping<
      PRq,
      PS,
      PG,
      PCn,
      PRs,
      PAev,
      PF,
      PC,
      PSub,
      PI,
      PCr,
      PNativeId
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  CoordinatorError<E> | DatabaseError,
  Exclude<R, EmailAddressPersistence | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    Effect.gen(function* () {
      yield* validateDrizzleStorage({
        ...options.mapping,
        proof: options.proofMapping,
      }).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;

      if (yield* hasCommitScope) return yield* unavailable();

      const result = yield* coordinateCommit(
        () =>
          Effect.gen(function* () {
            const statements: Statement<any>[] = [];
            let mutation: Planned<any> | undefined;

            const nativeCollector = D1BatchStatements.of({
              append: (statement) => Effect.sync(() => statements.push(statement)),
            });

            const owner = yield* makeD1Owner(unavailable()).pipe(
              Effect.provideService(D1BatchStatements, nativeCollector),
            );

            const plans = makeAddressPlans(
              options.mapping as unknown as AddressMapping,
              options.proofMapping as unknown as ProofMapping,
            );

            const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
              coordinateCommit(
                () =>
                  Effect.gen(function* () {
                    const journal = yield* CurrentCommitJournal;
                    const planned = yield* plan;

                    yield* owner.check;
                    if (mutation !== undefined) return yield* unavailable();
                    const guarded = { ...planned, journalGuard: journal.prepare(undefined) };

                    mutation = guarded;
                    statements.push(...guarded.statements);

                    return guarded.receipt;
                  }),
                { mode: "batch" },
              ).pipe(
                Effect.map((result) => result.value),
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
                Effect.provideService(LifecycleHooks, hooks),
              );

            const service: EmailAddressPersistence["Service"] = {
              target: (input) =>
                owner.run(
                  plans
                    .target(input)
                    .pipe(
                      Effect.provideService(CurrentD1PlanningDatabase, database),
                      Effect.provideService(
                        CurrentEmailSql,
                        database as unknown as EmailSqlDatabase,
                      ),
                      Effect.provideService(LifecycleHooks, hooks),
                      translateFailure,
                    ),
                ),
              checkCompletion: (input) =>
                owner.run(
                  plans
                    .checkCompletion(input)
                    .pipe(
                      Effect.provideService(CurrentD1PlanningDatabase, database),
                      Effect.provideService(
                        CurrentEmailSql,
                        database as unknown as EmailSqlDatabase,
                      ),
                      Effect.provideService(LifecycleHooks, hooks),
                      translateFailure,
                    ),
                ),
              verifyWithProof: (input, prepare) =>
                owner.run(run(plans.verifyWithProof(input, prepare)).pipe(translateFailure)),
              changeWithProof: (input, prepare) =>
                owner.run(run(plans.changeWithProof(input, prepare)).pipe(translateFailure)),
              cleanup: (input, prepare) =>
                owner.run(run(plans.cleanup(input, prepare)).pipe(translateFailure)),
            };

            const provided = Context.make(EmailAddressPersistence, service).pipe(
              Context.add(D1BatchStatements, owner.collector),
            );

            const value = yield* owner.close(Effect.provideContext(body, provided));

            if (mutation?.journalGuard !== undefined) {
              const status = yield* Effect.result(mutation.journalGuard.read);

              if (status._tag === "Success" || status.failure._tag !== "CommitPending")
                return yield* unavailable();
            }
            yield* database.$client.batch(statements).pipe(
              Effect.catchCause((cause) =>
                Effect.failCause(
                  Cause.map(cause, (error) =>
                    everyFailureMatches(cause, mutation?.retryable) ? unavailable() : error,
                  ),
                ),
              ),
              translateFailure,
            );

            return value;
          }),
        { mode: "batch" },
      ).pipe(Effect.provideService(LifecycleHooks, hooks));

      return result.value;
    }).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1EmailRegistration<
  TargetId,
  Registration,
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  Rq extends AnySQLiteTable,
  NativeId,
  PRq extends AnySQLiteTable,
  PS extends AnySQLiteTable,
  PG extends AnySQLiteTable,
  PCn extends AnySQLiteTable,
  PRs extends AnySQLiteTable,
  PAev extends AnySQLiteTable,
  PF extends AnySQLiteTable,
  PC extends AnySQLiteTable,
  PSub extends AnySQLiteTable,
  PI extends AnySQLiteTable,
  PCr extends AnySQLiteTable,
  PNativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1EmailRegistrationMapping<NoInfer<Registration>, S, I, C, AC, Rq, NativeId>;
    readonly proofMapping: D1ProofPersistenceMapping<
      PRq,
      PS,
      PG,
      PCn,
      PRs,
      PAev,
      PF,
      PC,
      PSub,
      PI,
      PCr,
      PNativeId
    >;
    readonly target: SuppliedService<TargetId, EmailRegistrationAuthority<Registration>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  CoordinatorError<E> | DatabaseError,
  Exclude<R, TargetId | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    Effect.gen(function* () {
      yield* validateDrizzleStorage({
        ...options.mapping,
        proof: options.proofMapping,
      }).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;

      if (yield* hasCommitScope) return yield* unavailable();

      const result = yield* coordinateCommit(
        () =>
          Effect.gen(function* () {
            const statements: Statement<any>[] = [];
            let mutation: Planned<any> | undefined;

            const nativeCollector = D1BatchStatements.of({
              append: (statement) => Effect.sync(() => statements.push(statement)),
            });

            const owner = yield* makeD1Owner(unavailable()).pipe(
              Effect.provideService(D1BatchStatements, nativeCollector),
            );

            const plans = makeRegistrationPlans(
              options.mapping as unknown as RegistrationMapping<Registration> & {
                readonly d1: AddressMapping["d1"];
              },
              options.proofMapping as unknown as ProofMapping,
            );

            const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
              coordinateCommit(
                () =>
                  Effect.gen(function* () {
                    const journal = yield* CurrentCommitJournal;
                    const planned = yield* plan;

                    yield* owner.check;
                    if (mutation !== undefined) return yield* unavailable();
                    const guarded = { ...planned, journalGuard: journal.prepare(undefined) };

                    mutation = guarded;
                    statements.push(...guarded.statements);

                    return guarded.receipt;
                  }),
                { mode: "batch" },
              ).pipe(
                Effect.map((result) => result.value),
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(CurrentEmailSql, database as unknown as EmailSqlDatabase),
                Effect.provideService(LifecycleHooks, hooks),
              );

            const service: EmailRegistrationAuthority<Registration> = {
              inspect: (input) =>
                owner.run(
                  plans
                    .inspect(input)
                    .pipe(
                      Effect.provideService(CurrentD1PlanningDatabase, database),
                      Effect.provideService(
                        CurrentEmailSql,
                        database as unknown as EmailSqlDatabase,
                      ),
                      Effect.provideService(LifecycleHooks, hooks),
                      translateFailure,
                    ),
                ),
              registerWithProof: (input, prepare) =>
                owner.run(run(plans.registerWithProof(input, prepare)).pipe(translateFailure)),
            };

            const provided = Context.make(options.target, service).pipe(
              Context.add(D1BatchStatements, owner.collector),
            );

            const value = yield* owner.close(Effect.provideContext(body, provided));

            if (mutation?.journalGuard !== undefined) {
              const status = yield* Effect.result(mutation.journalGuard.read);

              if (status._tag === "Success" || status.failure._tag !== "CommitPending")
                return yield* unavailable();
            }
            yield* database.$client.batch(statements).pipe(
              Effect.catchCause((cause) =>
                Effect.failCause(
                  Cause.map(cause, (error) =>
                    everyFailureMatches(cause, mutation?.retryable) ? unavailable() : error,
                  ),
                ),
              ),
              translateFailure,
            );

            return value;
          }),
        { mode: "batch" },
      ).pipe(Effect.provideService(LifecycleHooks, hooks));

      return result.value;
    }).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

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

const executeStandalone = <A, E, R>(
  plan: Effect.Effect<Planned<A>, E, R>,
  retries = 2,
): Effect.Effect<
  A,
  E | import("@yielded/auth/Hooks").HookConfigurationError | import("effect/sql/SqlError").SqlError,
  Exclude<R, CurrentCommitJournal> | CurrentD1PlanningDatabase | LifecycleHooks
> =>
  Effect.suspend(() => {
    let retryable: ((cause: unknown) => boolean) | undefined;

    const once = coordinateCommit(
      () =>
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const planned = yield* plan;

          retryable = planned.retryable;
          yield* database.$client.batch(planned.statements);

          return planned.receipt;
        }),
      { mode: "batch" },
    ).pipe(Effect.map((result) => result.value));

    return once.pipe(
      Effect.catchCause((cause) =>
        retries > 0 && everyFailureMatches(cause, retryable)
          ? executeStandalone(plan, retries - 1)
          : Effect.failCause(cause),
      ),
    );
  });
