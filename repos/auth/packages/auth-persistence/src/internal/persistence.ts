import { digest, randomId } from "@yielded/auth-crypto";
import { EmailAddressPersistence, EmailUnavailable } from "@yielded/auth/Email";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import type { PasskeyConfig } from "@yielded/auth/Passkey";
import { PasswordPersistence, PasswordUnavailable } from "@yielded/auth/Password";
import { hooksLayer } from "@yielded/auth/Persistence";
import { PhoneAdmission, PhoneSignInTargets, PhoneOtpUnavailable } from "@yielded/auth/PhoneOtp";
import { ProofPersistence, ProofUnavailable } from "@yielded/auth/Proofs";
import { AuthenticationAuthority, SessionUnavailable } from "@yielded/auth/Sessions";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import {
  PersistenceConfigurationError,
  type ClaimsCodec,
  type ConfigId,
  type Definition,
  type PersistenceApi,
  type Ports,
  type Roles,
  type Provisioning,
  type ProvisioningRequirement,
  type StorageLayout,
  type SubjectMapping,
  type SubjectOptions,
  type PasskeyFeature,
  type PasskeyRequirement,
  type MappingInput,
} from "./configuration";
import { makeEmailKernel, CurrentEmailSql, type EmailSqlDatabase } from "./email-kernel";
import { PersistenceMappingError } from "./mapping-error";
import {
  makePasswordKernel,
  CurrentPasswordSql,
  type PasswordSqlDatabase,
} from "./password-kernel";
import { makePhoneKernel, CurrentPhoneTransaction } from "./phone-kernel";
import {
  makeProofKernel,
  CurrentProofSql,
  type ProofSqlDatabase,
  type ProofSqlQuery,
} from "./proof-kernel";
import type { QueryOperations } from "./query-operations";
import { makeRegistrationAuthority } from "./registration";
import { makeSessionKernel, CurrentSessionSql, type SessionSqlDatabase } from "./session-kernel";
import { requireStandalone } from "./standalone";
import { makeMappings } from "./storage-mapping";
import {
  tableDefinition,
  storageTables,
  type StorageRole,
  type StorageTable,
} from "./storage-tables";
import { validateStorage } from "./storage-validation";
import { makeTransactionExecutionKernel } from "./transaction-execution-kernel";
import {
  makeTransactionKernel,
  NativeDatabase,
  type TransactionNativeDatabase,
} from "./transaction-kernel";

export interface Backend<T extends object, R> {
  readonly makeTable: (definition: StorageTable) => T;
  readonly describe: (table: T) => StorageTable;
  readonly acquire: Effect.Effect<object, PersistenceConfigurationError, R | SqlClient.SqlClient>;
  readonly operations: QueryOperations;
  readonly passkeys: (input: {
    readonly storage: MappingInput;
    readonly namespace: string;
    readonly dialect: "pg" | "sqlite";
    readonly features: ReadonlyArray<PasskeyFeature>;
    readonly passwordModules: ReadonlyArray<string>;
  }) => Effect.Effect<
    Context.Context<never>,
    PersistenceConfigurationError,
    PasskeyConfig | LifecycleHooks | SqlClient.SqlClient | NativeDatabase | CurrentProofSql
  >;
}

const configError = (reason: string) => PersistenceConfigurationError.make({ reason });

const mappingError = (cause: unknown) =>
  PersistenceMappingError.make({ operation: "mapping", cause });

const timestampKeys = new Set([
  "verifiedAt",
  "createdAt",
  "lastIssueAt",
  "issuedAt",
  "expiresAt",
  "absoluteExpiresAt",
  "retentionUntil",
  "claimDeadline",
  "retryAt",
  "admittedAt",
  "deadline",
  "occurredAt",
  "dedupUntil",
]);

export const createPersistence = <T extends object, R>(
  backend: Backend<T, R>,
): PersistenceApi<T, R> => {
  const proofKernel = makeProofKernel(backend.operations);
  const passwordKernel = makePasswordKernel(backend.operations, proofKernel);
  const emailKernel = makeEmailKernel(backend.operations, proofKernel);
  const sessionKernel = makeSessionKernel(backend.operations);
  const transactionKernel = makeTransactionKernel(backend.operations);
  const executionKernel = makeTransactionExecutionKernel(transactionKernel);
  const phoneKernel = makePhoneKernel(backend.operations, transactionKernel);

  const make = <C extends ClaimsCodec, const Id extends string, const A extends Definition<C, Id>>(
    auth: A & Definition<C, Id>,
  ) => {
    const features = Object.values(auth.strategies).map((strategy) => strategy.persistence);
    const phone = features.some((feature) => feature?.kind === "phone");
    const password = features.some((feature) => feature?.kind === "password");

    const passkeys = features.filter(
      (feature): feature is PasskeyFeature => feature?.kind === "passkey",
    );

    const management = features.some(
      (feature) => feature?.kind === "password" && feature.management,
    );

    const email = features.some((feature) => feature?.kind === "email" && feature.addresses);
    const proofs = phone || management || email;

    const roles: StorageRole[] = ["identifiers", "credentials", "sessions", "sessionFlows"];

    if (password)
      roles.push(
        "passwords",
        "passwordAttempts",
        "passwordScopes",
        "passwordCharges",
        "passwordCommands",
      );
    if (management) roles.push("passwordRegistrations");
    if (email) roles.push("emailCredentials", "emailCommands");
    if (phone) roles.push("phoneState");
    if (passkeys.length > 0)
      roles.push(
        "passkeyCredentials",
        "passkeyOwnership",
        "passkeyHandles",
        "passkeyModules",
        "passkeyFlows",
        "passkeyAdmissions",
        "passkeyCharges",
      );
    if (passkeys.some((feature) => feature.management)) roles.push("passkeyCommands");
    if (proofs)
      roles.push(
        "proofRequests",
        "proofSeries",
        "proofGenerations",
        "proofContinuations",
        "proofScopes",
        "proofAbuse",
        "proofFailures",
        "proofCommands",
      );

    const ConfigKey = Context.Service<
      ConfigId<A["namespace"]>,
      StorageLayout<T, Roles<C, Id, A>>
    >()(`@yielded/auth-persistence/${auth.namespace}/Config`);

    const Config = Object.assign(ConfigKey, {
      layer: (value: StorageLayout<T, Roles<C, Id, A>>) => Layer.succeed(ConfigKey, value),
    });

    const ProvisioningKey = Context.Service<ProvisioningRequirement<A>, Provisioning<A>>()(
      `@yielded/auth-persistence/${auth.namespace}/Provisioning`,
    );

    const layout = <N, Instant>(
      options: {
        readonly subjects: SubjectOptions<T, N>;
        readonly tables?: Partial<Record<StorageRole, T>>;
        readonly prefix?: string;
        readonly timestamps?: {
          readonly type: "text" | "integer";
          readonly codec: Schema.Codec<number, Instant>;
        };
      },
      managed: boolean,
    ): StorageLayout<T, Roles<C, Id, A>> => {
      const subject = options.subjects;

      if (passkeys.length > 0 && options.timestamps !== undefined)
        throw configError(
          "Composed passkey storage uses integer milliseconds; use an explicit passkey adapter for a custom timestamp representation",
        );
      const description = backend.describe(subject.table);
      const idColumn = description.columns[subject.id];

      for (const key of [subject.id, subject.status, subject.securityRevision]) {
        if (description.columns[key] === undefined)
          throw configError(`Missing subject column ${key}`);
      }
      if (subject.activeValue === undefined)
        throw configError("An explicit active subject value is required");

      if (idColumn === undefined || idColumn.type === "boolean")
        throw configError("Subject ID must map a text or integer column");

      const prefix =
        options.prefix ?? `auth_${digest(auth.namespace).slice(0, 12).replaceAll("-", "_")}`;

      const schema: Partial<Record<StorageRole, T>> = { ...options.tables };

      for (const role of roles) {
        if (schema[role] === undefined && managed) {
          const definition = tableDefinition(role, `${prefix}_${role}`, idColumn.type);

          const adjusted =
            options.timestamps === undefined
              ? definition
              : {
                  ...definition,
                  columns: Object.fromEntries(
                    Object.entries(definition.columns).map(([key, column]) => [
                      key,
                      timestampKeys.has(key)
                        ? { ...column, type: options.timestamps?.type ?? column.type }
                        : column,
                    ]),
                  ),
                };

          schema[role] = backend.makeTable(adjusted);
        }
      }
      for (const role of roles) {
        if (schema[role] === undefined) throw configError(`Missing ${role} table`);
      }
      const instantCodec = options.timestamps?.codec;

      const decodeInstant =
        instantCodec === undefined
          ? Schema.decodeUnknownEffect(Schema.Int)
          : Schema.decodeUnknownEffect(instantCodec);

      const decodeInstantSync =
        instantCodec === undefined
          ? Schema.decodeUnknownSync(Schema.Int)
          : Schema.decodeUnknownSync(instantCodec);

      const subjects: SubjectMapping = {
        table: subject.table,
        id: subject.id,
        status: subject.status,
        securityRevision: subject.securityRevision,
        activeValue: subject.activeValue,
        requirements: subject.requirements,
        actionRequirements: subject.actionRequirements ?? subject.requirements,
        toSubject: (id) =>
          Schema.decodeUnknownEffect(subject.idCodec)(id).pipe(Effect.mapError(mappingError)),
        toNative: (id) =>
          Schema.encodeEffect(subject.idCodec)(id).pipe(Effect.mapError(mappingError)),
        toSubjectSync: Schema.decodeUnknownSync(subject.idCodec),
        toNativeSync: Schema.encodeSync(subject.idCodec),
      };

      return Object.freeze({
        namespace: auth.namespace,
        schema: Object.freeze(schema) as Readonly<Record<Roles<C, Id, A>, T>>,
        tables: schema,
        subjects,
        encodeInstant:
          instantCodec === undefined ? (millis: number) => millis : Schema.encodeSync(instantCodec),
        decodeInstant: (value: unknown) => decodeInstant(value).pipe(Effect.mapError(mappingError)),
        decodeInstantSync,
      });
    };

    const services = Layer.effectContext(
      Effect.gen(function* () {
        const storage = yield* ConfigKey;
        const hooks = yield* LifecycleHooks;
        const client = yield* SqlClient.SqlClient;
        const database = yield* backend.acquire;

        const dialect = client.onDialectOrElse({
          pg: () => "pg" as const,
          sqlite: () => "sqlite" as const,
          orElse: () => undefined,
        });

        if (dialect === undefined)
          return yield* configError("Use an explicit adapter for this SQL dialect");
        if (auth.sessionMode !== "stateful")
          return yield* configError("The composed layer currently requires stateful sessions");
        if (
          features.some(
            (feature) =>
              feature === undefined ||
              ("lifecycle" in feature && feature.lifecycle) ||
              (feature.kind === "email" && !feature.addresses),
          )
        )
          return yield* configError(
            "Use explicit services for strategies without composed persistence support",
          );
        if (storage.namespace !== auth.namespace)
          return yield* configError(
            "Persistence configuration belongs to a different Auth definition",
          );
        for (const role of roles) {
          const table = (storage.schema as Partial<Record<StorageRole, T>>)[role];

          if (table === undefined) return yield* configError(`Missing ${role} table`);
          const description = backend.describe(table);
          const columns = description.columns;

          for (const name of Object.keys(storageTables[role].columns)) {
            if (columns[name] === undefined)
              return yield* configError(`Missing ${role}.${name} column`);
          }
          yield* validateStorage(dialect, description, storageTables[role].unique);
        }
        yield* validateStorage(dialect, backend.describe(storage.subjects.table as T), [
          [storage.subjects.id],
        ]);
        const mappings = makeMappings(storage);

        const standalone = <E>(error: () => E) =>
          requireStandalone(error, client.transactionService);

        // Backend validation owns the foreign query-builder shape, never the decoded rows.
        const native = database as ProofSqlDatabase &
          PasswordSqlDatabase &
          EmailSqlDatabase &
          SessionSqlDatabase &
          TransactionNativeDatabase;

        const options = {
          mode: "interactive" as const,
          locking: dialect === "pg",
          standaloneGuard: standalone(() => SessionUnavailable.make({})),
        };

        const sessionMapping = mappings.sessions(auth.claims);

        const sessionServices = yield* sessionKernel
          .makeSqlStatefulSessions(sessionMapping, options)
          .pipe(
            Effect.provideService(CurrentSessionSql, native),
            Effect.provideService(NativeDatabase, native),
          );

        const authority = yield* sessionKernel
          .makeSqlAuthenticationAuthority<C["Type"]>(
            { ...mappings.authority(), isConstraintConflict: () => false },
            options,
          )
          .pipe(
            Effect.provideService(CurrentSessionSql, native),
            Effect.provideService(NativeDatabase, native),
          );

        let context: Context.Context<never> = Context.make(AuthenticationAuthority, authority).pipe(
          Context.add(
            auth.sessions.StatefulSessionPersistence,
            sessionServices.statefulSessionPersistence,
          ),
          Context.add(auth.sessions.SessionRepository, sessionServices.sessionRepository),
        );

        const proofConfiguration = proofs
          ? {
              mapping: mappings.proofs(),
              configuration: {
                mode: "interactive" as const,
                locking: dialect === "pg",
                standaloneGuard: standalone(() => ProofUnavailable.make({})),
                insertIfAbsent: (query: ProofSqlQuery) => query.onConflictDoNothing(),
              },
            }
          : undefined;

        if (proofConfiguration !== undefined) {
          context = Context.add(
            context,
            ProofPersistence,
            yield* proofKernel
              .makeSqlProofPersistence(proofConfiguration.mapping, proofConfiguration.configuration)
              .pipe(
                Effect.provideService(CurrentProofSql, native),
                Effect.provideService(NativeDatabase, native),
              ),
          );
        }

        if (password) {
          const persistence = yield* passwordKernel
            .makeSqlPasswordPersistence(mappings.passwords(), {
              mode: "interactive",
              locking: dialect === "pg",
              standaloneGuard: standalone(() => PasswordUnavailable.make({})),
              insertIfAbsent: (query) => query.onConflictDoNothing(),
              ...(proofConfiguration === undefined ? {} : { proof: proofConfiguration }),
            })
            .pipe(
              Effect.provideService(CurrentPasswordSql, native),
              Effect.provideService(NativeDatabase, native),
            );

          context = Context.add(context, PasswordPersistence, persistence);
        }
        for (const [name, strategy] of Object.entries(auth.strategies)) {
          if (strategy.persistence?.kind !== "password" || !strategy.persistence.management)
            continue;
          const key = strategy.RegistrationAuthority;

          if (key === undefined)
            return yield* configError(`Missing subject provisioning for ${name}`);

          const registration = yield* makeRegistrationAuthority(
            mappings,
            backend.operations,
            standalone(() => PasswordUnavailable.make({})),
            ProvisioningKey,
            name,
          ).pipe(Effect.provideService(CurrentPasswordSql, native));

          context = Context.add(context, key, registration);
        }
        if (email) {
          context = Context.add(
            context,
            EmailAddressPersistence,
            yield* emailKernel
              .makeSqlEmailAddressPersistence(mappings.emails(), {
                mode: "interactive",
                locking: dialect === "pg",
                standaloneGuard: standalone(() => EmailUnavailable.make({})),
                ...(proofConfiguration === undefined ? {} : { proof: proofConfiguration }),
              })
              .pipe(
                Effect.provideService(CurrentEmailSql, native),
                Effect.provideService(NativeDatabase, native),
              ),
          );
        }
        if (phone) {
          const { column, eq } = backend.operations;

          const mapping = (moduleId: string) => ({
            moduleId,
            subject: {
              table: storage.subjects.table,
              id: storage.subjects.id,
              securityRevision: storage.subjects.securityRevision,
              activeCondition: eq(
                column(storage.subjects.table, storage.subjects.status),
                storage.subjects.activeValue,
              ),
            },
            subjectIds: {
              toNative: storage.subjects.toNativeSync,
              toSubject: storage.subjects.toSubjectSync,
            },
            identifier: {
              table: mappings.table("identifiers"),
              namespace: "namespace",
              value: "value",
              subjectId: "subjectId",
              revision: "revision",
              verifiedAt: "verifiedAt",
              activeCondition: eq(column(mappings.table("identifiers"), "active"), true),
            },
            credential: {
              table: mappings.table("credentials"),
              id: "credentialId",
              subjectId: "subjectId",
              revision: "revision",
              activeCondition: eq(column(mappings.table("credentials"), "active"), true),
            },
            state: {
              table: mappings.table("phoneState"),
              scope: "scope",
              state: "state",
              version: "version",
              encodeInsert: (row: object) => row,
            },
            admission: {
              windowMillis: 60_000,
              networkRequests: 10,
              networkAttempts: 100,
              maximumMessages: 10,
              requestRetentionMillis: 86_400_000,
            },
            engineNowMillis: backend.operations
              .sql`${dialect === "pg" ? backend.operations.sql`cast(extract(epoch from clock_timestamp()) * 1000 as bigint)` : backend.operations.sql`cast(round((julianday('now') - 2440587.5) * 86400000) as integer)`}`,
            encodeInstant: storage.encodeInstant,
          });

          const execution = yield* executionKernel
            .makeTransactionExecution(
              CurrentPhoneTransaction,
              {
                mode: "interactive",
                dialect,
                locking: dialect === "pg",
                standaloneGuard: () => standalone(() => PhoneOtpUnavailable.make({})),
              },
              () => PhoneOtpUnavailable.make({}),
              randomId,
            )
            .pipe(Effect.provideService(NativeDatabase, native));

          const run = <Value, E, Requirements>(
            work: Effect.Effect<Value, E, Requirements>,
            mutation = true,
          ) =>
            execution.admit.pipe(
              Effect.andThen(execution.run(work, mutation)),
              Effect.provideService(LifecycleHooks, hooks),
            );

          const allowed = (moduleId: string) =>
            features.some((feature) => feature?.kind === "phone" && feature.moduleId === moduleId);

          const admission = PhoneAdmission.of({
            admit: (request) =>
              allowed(request.moduleId)
                ? run(phoneKernel.admitPhone(mapping(request.moduleId), request))
                : Effect.fail(PhoneOtpUnavailable.make({})),
            cleanup: (request) =>
              allowed(request.moduleId)
                ? run(phoneKernel.cleanupPhoneAdmission(mapping(request.moduleId), request))
                : Effect.fail(PhoneOtpUnavailable.make({})),
          });

          const targets = PhoneSignInTargets.of({
            lookup: (request) =>
              allowed(request.moduleId)
                ? run(phoneKernel.lookupPhone(mapping(request.moduleId), request), false)
                : Effect.fail(PhoneOtpUnavailable.make({})),
          });

          context = context.pipe(
            Context.add(PhoneAdmission, admission),
            Context.add(PhoneSignInTargets, targets),
          );
        }

        if (passkeys.length > 0) {
          // Auth capability metadata determines whether PasskeyConfig is required.
          const services = backend.passkeys({
            storage,
            namespace: auth.namespace,
            dialect,
            features: passkeys,
            passwordModules: features.flatMap((feature) =>
              feature?.kind === "password" ? [feature.moduleId] : [],
            ),
          }) as Effect.Effect<
            Context.Context<never>,
            PersistenceConfigurationError,
            | PasskeyRequirement<A>
            | LifecycleHooks
            | SqlClient.SqlClient
            | NativeDatabase
            | CurrentProofSql
          >;

          context = Context.merge(
            context,
            yield* services.pipe(
              Effect.provideService(NativeDatabase, native),
              Effect.provideService(CurrentProofSql, native),
            ),
          );
        }

        // The checked capability metadata above determines exactly these service keys.
        return context as Context.Context<Ports<C, Id, A>>;
      }).pipe(
        Effect.mapError((error) =>
          Schema.is(PersistenceConfigurationError)(error)
            ? error
            : configError("Cannot acquire SQL persistence"),
        ),
      ),
    ).pipe(Layer.provide(hooksLayer));

    return {
      Config,
      Provisioning: ProvisioningKey,
      layer: services,
      managed: <N, Instant = number>(options: {
        readonly subjects: SubjectOptions<T, N>;
        readonly tables?: Partial<Record<Roles<C, Id, A>, T>>;
        readonly prefix?: string;
        readonly timestamps?: {
          readonly type: "text" | "integer";
          readonly codec: Schema.Codec<number, Instant>;
        };
      }) => layout(options, true),
      map: <N, Instant = number>(options: {
        readonly subjects: SubjectOptions<T, N>;
        readonly tables: Partial<Record<StorageRole, T>>;
        readonly timestamps?: {
          readonly type: "text" | "integer";
          readonly codec: Schema.Codec<number, Instant>;
        };
      }) => layout(options, false),
    };
  };

  return { make };
};
