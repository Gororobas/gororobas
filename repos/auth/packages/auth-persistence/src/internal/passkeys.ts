import { digest } from "@yielded/auth-crypto";
import {
  PasskeyCredentials,
  PasskeyCredential,
  PasskeyEnrollmentContext,
  PasskeyManagementPersistence,
  PasskeyManagementPolicy,
  PasskeyMethodPolicy,
  PasskeyPersistence,
  PasskeyProfile,
  PasskeyRequirement,
  PasskeyUnavailable,
} from "@yielded/auth/Passkey";
import { Context, Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import {
  PersistenceConfigurationError,
  type MappingInput,
  type PasskeyFeature,
} from "./configuration";
import { PersistenceMappingError } from "./mapping-error";
import {
  requiredPasskeyCredentialConstraints,
  requiredPasskeyPersistenceConstraints,
  type PasskeyCredentialMapping,
  type PasskeyPersistenceMapping,
} from "./models/passkey-model";
import {
  requiredPasskeyManagementConstraints,
  type PasskeyManagementMapping,
} from "./models/passkey-write-model";
import { makePasskeyKernel } from "./passkey-kernel";
import type { PasskeyTargetConfiguration } from "./passkey/target";
import type { Backend } from "./persistence";
import { CurrentProofSql } from "./proof-kernel";
import type { SqlExpression as SQL, QueryOperations, TableModel } from "./query-operations";
import { requireStandalone } from "./standalone";
import { storageTables, type StorageRole } from "./storage-tables";

const profileJson = Schema.fromJsonString(PasskeyProfile);
const policyJson = Schema.fromJsonString(PasskeyMethodPolicy);

const seedJson = Schema.fromJsonString(
  Schema.Struct({
    policy: PasskeyMethodPolicy,
    management: Schema.optionalKey(PasskeyManagementPolicy),
  }),
);

const ModuleRow = Schema.Struct({
  active: Schema.Boolean,
  policy: Schema.String,
  policyRevision: Schema.String,
});

const credentialData = PasskeyCredential.mapFields(
  ({ revision: _revision, active: _active, ...fields }) => fields,
);

const unavailable = () => PasskeyUnavailable.make({});
const configurationError = (reason: string) => PersistenceConfigurationError.make({ reason });

type ReadMapping = PasskeyCredentialMapping<
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  unknown
>;
type BaseMapping = PasskeyPersistenceMapping<
  ReadMapping,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  unknown
>;
type ManagementMapping = PasskeyManagementMapping<
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  TableModel,
  unknown
>;

/** Share the same passkey algorithms across raw SQL and Drizzle compilers. */
export const makeComposedPasskeys = (
  operations: QueryOperations,
): Backend<object, never>["passkeys"] => {
  const { and, eq, getTableColumns, inArray, or, sql } = operations;
  const { target, writeTarget } = makePasskeyKernel(operations);

  const {
    makeTargetPasskeyCredentials,
    makeTargetPasskeyEnrollmentContext,
    makeTargetPasskeyPersistence,
  } = target;

  const { makeTargetPasskeyManagement } = writeTarget;

  const mappings = (
    storage: MappingInput,
    namespace: string,
    dialect: "pg" | "sqlite",
    passwordModules: ReadonlyArray<string>,
    signInProfiles: ReadonlyArray<PasskeyProfile>,
  ) => {
    const table = (role: StorageRole) => {
      const value = storage.tables[role];

      if (value === undefined) throw configurationError(`Missing ${role} mapping`);

      // Backend validation owns the foreign table shape. Row values are decoded below.
      return value;
    };

    const mapped = <Role extends StorageRole>(role: Role) => ({
      table: table(role),
      ...(Object.fromEntries(Object.keys(storageTables[role].columns).map((key) => [key, key])) as {
        readonly [Key in keyof (typeof storageTables)[Role]["columns"]]: Key;
      }),
    });

    const column = (role: StorageRole, key: string) => getTableColumns(table(role))[key];
    const s = storage.subjects;
    const subject = s.table;
    const sc = getTableColumns(subject);
    const active = (value: unknown) => value === true;
    const owned = (value: unknown) => value === "owned";

    const read: ReadMapping = {
      subject: {
        table: subject,
        id: s.id,
        status: s.status,
        securityRevision: s.securityRevision,
        decodeId: (row) => row[s.id],
        isActiveStatus: (value) => Object.is(value, s.activeValue),
        activeCondition: eq(sc[s.status], s.activeValue),
      },
      credential: {
        ...mapped("passkeyCredentials"),
        status: "active",
        decode: (row) =>
          Schema.decodeUnknownSync(credentialData)({
            ...row,
            profile: Schema.decodeUnknownSync(profileJson)(row.profile),
          }),
        decodeSubjectId: (row) => row.subjectId,
        isActiveStatus: active,
        activeCondition: eq(column("passkeyCredentials", "active"), true),
      },
      authority: {
        ...mapped("credentials"),
        status: "active",
        isActiveStatus: active,
        activeCondition: eq(column("credentials", "active"), true),
      },
      credentialOwnership: {
        ...mapped("passkeyOwnership"),
        isOwnedState: owned,
        ownedCondition: eq(column("passkeyOwnership", "state"), "owned"),
        decodeSubjectId: (row) => row.subjectId,
      },
      handleOwnership: {
        ...mapped("passkeyHandles"),
        isOwnedState: owned,
        ownedCondition: eq(column("passkeyHandles", "state"), "owned"),
        decodeSubjectId: (row) => row.subjectId,
      },
      subjectIds: { toNative: s.toNativeSync, toSubject: s.toSubjectSync, equals: Object.is },
      constraints: requiredPasskeyCredentialConstraints,
    };

    const base = (feature: PasskeyFeature): BaseMapping => ({
      moduleId: feature.moduleId,
      authorityScope: namespace,
      read,
      module: {
        ...mapped("passkeyModules"),
        status: "active",
        policyColumns: ["policy", "policyRevision"],
        isActiveStatus: active,
        activeCondition: eq(column("passkeyModules", "active"), true),
        decodeMethodPolicy: (row) => Schema.decodeUnknownSync(policyJson)(row.policy),
      },
      flow: {
        ...mapped("passkeyFlows"),
        states: {
          Pending: "Pending",
          Claimed: "Claimed",
          Verified: "Verified",
          Rejected: "Rejected",
          Ambiguous: "Ambiguous",
          RegistrationAccepted: "RegistrationAccepted",
          ProvisioningPending: "ProvisioningPending",
        },
        encodeInsert: () => ({}),
      },
      admission: mapped("passkeyAdmissions"),
      charge: { ...mapped("passkeyCharges"), encodeInsert: () => ({}) },
      clock: {
        encodeInstant: storage.encodeInstant,
        decodeInstant: storage.decodeInstantSync,
        engineNowMillis:
          dialect === "pg"
            ? sql`cast(extract(epoch from clock_timestamp()) * 1000 as bigint)`
            : sql`cast(round((julianday('now') - 2440587.5) * 86400000) as integer)`,
        toMillis: (expression) => expression,
        fromMillis: (expression) => expression,
      },
      telemetry: { lastUsedAt: "lastUsedAt", encodeBackupState: (value) => value },
      constraints: requiredPasskeyPersistenceConstraints,
    });

    const management = (feature: PasskeyFeature): ManagementMapping => {
      const policy = feature.managementPolicy;

      if (policy === undefined)
        throw configurationError(`Missing passkey management policy for ${feature.moduleId}`);
      const c = getTableColumns(table("passkeyCredentials"));
      const f = getTableColumns(table("credentials"));

      const metadata = (subjectId: unknown) =>
        sql`exists(select 1 from ${subject} where ${sc[s.id]} = ${subjectId} and ${sc[s.status]} = ${s.activeValue})`;

      return {
        ...base(feature),
        write: {
          credential: {
            name: "name",
            createdAt: "createdAt",
            encodeInsert: ({ credential, subjectId, summary, marker }) => ({
              credentialId: credential.credentialId,
              subjectId,
              rpId: credential.rpId,
              protocolCredentialId: credential.protocolCredentialId,
              userHandle: credential.userHandle,
              credentialKey: "",
              handleKey: "",
              publicKey: credential.publicKey,
              algorithm: credential.algorithm,
              profile: Schema.encodeSync(profileJson)(credential.profile),
              credentialRevision: marker,
              active: true,
              primarySignIn: credential.primarySignIn,
              enrollmentUserVerified: credential.enrollmentUserVerified,
              backupEligible: credential.backupEligible,
              backupState: credential.backupState,
              counter: credential.counter,
              maximumCounter: credential.maximumCounter,
              name: summary.name,
              createdAt: storage.encodeInstant(summary.createdAtMillis),
            }),
            encodePrimarySignIn: (value) => value,
            encodeEnrollmentUserVerified: (value) => value,
            encodeBackupEligible: (value) => value,
            activeStatus: true,
            removedStatus: false,
          },
          authority: {
            encodeInsert: ({ subjectId, credential, marker }) => ({
              subjectId,
              credentialId: credential.credentialId,
              revision: marker,
              active: true,
            }),
            activeStatus: true,
            removedStatus: false,
          },
          credentialOwnership: {
            encodeInsert: ({ credential, marker }) => ({
              credentialKey: "",
              rpId: credential.rpId,
              protocolCredentialId: credential.protocolCredentialId,
              state: "owned",
              version: marker,
            }),
            ownedState: "owned",
            removedState: "removed",
          },
          handleOwnership: {
            encodeInsert: ({ subjectId, rpId, userHandle, marker }) => ({
              subjectId,
              rpId,
              userHandle,
              handleKey: "",
              state: "owned",
              version: marker,
            }),
            ownedState: "owned",
          },
          policy: {
            subjectColumns: Object.keys(sc),
            management: () => policy,
            requirement: s.actionRequirements,
            metadata,
            action: metadata,
            remainingSignIn: (subjectId, excluded, row) =>
              Effect.gen(function* () {
                const requirement = yield* Schema.decodeUnknownEffect(PasskeyRequirement)(
                  yield* s.requirements(row),
                );

                const alternatives: SQL[] = [];

                // Only retain complete sign-in paths enabled by this Auth definition.
                // More involved combinations require an explicit application's predicate.
                if (
                  requirement.alternatives.some(
                    (alternative) =>
                      alternative.minimumCredentials === 1 &&
                      alternative.factors.every((factor) => factor === "possession"),
                  )
                ) {
                  const profiles = signInProfiles.map((profile) =>
                    Schema.encodeSync(profileJson)(profile),
                  );

                  alternatives.push(sql`exists(
                  select 1 from ${table("passkeyCredentials")} join ${table("credentials")}
                  on ${f.credentialId} = ${c.credentialId} and ${f.subjectId} = ${c.subjectId}
                    and ${f.revision} = ${c.credentialRevision} and ${f.active} = ${true}
                  where ${c.subjectId} = ${subjectId} and ${c.credentialId} <> ${excluded}
                    and ${c.active} = ${true} and ${c.primarySignIn} = ${true}
                    and ${c.enrollmentUserVerified} = ${true} and ${inArray(c.profile, profiles)}
                )`);
                }
                if (
                  passwordModules.length > 0 &&
                  requirement.alternatives.some(
                    (alternative) =>
                      alternative.minimumCredentials === 1 &&
                      !alternative.userVerified &&
                      !alternative.phishingResistant &&
                      alternative.factors.every((factor) => factor === "knowledge"),
                  )
                ) {
                  const p = getTableColumns(table("passwords"));
                  const i = getTableColumns(table("identifiers"));

                  alternatives.push(sql`exists(
                  select 1 from ${table("passwords")} join ${table("credentials")}
                  on ${f.credentialId} = ${p.credentialId} and ${f.subjectId} = ${p.subjectId}
                    and ${f.revision} = ${p.credentialRevision} and ${f.active} = ${true}
                  join ${table("identifiers")} on ${i.subjectId} = ${p.subjectId}
                    and ${i.active} = ${true} and ${i.namespace} = 'email'
                  where ${p.subjectId} = ${subjectId} and ${p.credentialId} <> ${excluded}
                    and ${inArray(p.moduleId, passwordModules)}
                )`);
                }

                return or(...alternatives) ?? sql`false`;
              }).pipe(
                Effect.mapError((cause) =>
                  PersistenceMappingError.make({ operation: "mapping", cause }),
                ),
              ),
          },
        },
        command: { ...mapped("passkeyCommands"), encodeInsert: (input) => ({ ...input }) },
        managementConstraints: requiredPasskeyManagementConstraints,
        invalidation: {
          window: {
            trigger: "credential-change",
            existingSessions: "immediate",
            maximumExposureMillis: 0,
            oldAuthenticationEvidence: "rejected",
          },
          mutations: [],
          postcondition: ({ subjectId, securityRevision }) =>
            sql`exists(select 1 from ${subject} where ${sc[s.id]} = ${subjectId} and ${sc[s.securityRevision]} = ${securityRevision})`,
        },
      };
    };

    return { read, base, management, table };
  };

  const make: Backend<object, never>["passkeys"] = Effect.fn("AuthPersistence.passkeys")(
    function* ({ storage, namespace, dialect, features, passwordModules }) {
      const client = yield* SqlClient.SqlClient;

      const policies = yield* Effect.forEach(features, (feature) =>
        Effect.map(feature.policy, (policy) => ({ feature, policy })),
      );

      const m = yield* Effect.try({
        try: () =>
          mappings(
            storage,
            namespace,
            dialect,
            passwordModules,
            policies.flatMap(({ feature, policy }) => (feature.management ? [] : policy.profiles)),
          ),
        catch: () => configurationError("Invalid passkey table mappings"),
      });

      const configuration: PasskeyTargetConfiguration = {
        mode: "interactive",
        dialect,
        locking: dialect === "pg",
        standaloneGuard: () => requireStandalone(unavailable, client.transactionService),
      };

      const native = yield* CurrentProofSql;

      yield* client.withTransaction(
        Effect.gen(function* () {
          if (dialect === "pg")
            yield* client`select pg_advisory_xact_lock(hashtext(${`${namespace}/passkeys`}))`;
          for (const { feature, policy } of policies) {
            const encoded = yield* Schema.encodeEffect(policyJson)(policy);

            const policyRevision = digest(
              yield* Schema.encodeEffect(seedJson)({
                policy,
                ...(feature.managementPolicy === undefined
                  ? {}
                  : { management: feature.managementPolicy }),
              }),
            );

            const module = m.table("passkeyModules");
            const columns = getTableColumns(module);

            yield* native
              .insert(module)
              .values({ moduleId: feature.moduleId, active: true, policy: encoded, policyRevision })
              .onConflictDoNothing();

            const rows = yield* native
              .select()
              .from(module)
              .where(eq(columns.moduleId, feature.moduleId));

            const row = yield* Schema.decodeUnknownEffect(ModuleRow)(rows[0]);

            if (!row.active)
              return yield* configurationError(`Passkey module ${feature.moduleId} is disabled`);
            if (row.policyRevision !== policyRevision) {
              const previous = yield* Schema.decodeEffect(policyJson)(row.policy);

              if (policy.generation <= previous.generation)
                return yield* configurationError(
                  `Increase the passkey policy generation to change ${feature.moduleId}`,
                );
              yield* native
                .update(module)
                .set({ policy: encoded, policyRevision })
                .where(
                  and(
                    eq(columns.moduleId, feature.moduleId),
                    eq(columns.policyRevision, row.policyRevision),
                    eq(columns.active, true),
                  ),
                );

              const updated = yield* native
                .select()
                .from(module)
                .where(eq(columns.moduleId, feature.moduleId));

              const applied = yield* Schema.decodeUnknownEffect(ModuleRow)(updated[0]);

              if (!applied.active || applied.policyRevision !== policyRevision)
                return yield* configurationError(
                  `Passkey policy changed while configuring ${feature.moduleId}`,
                );
            }
            yield* native
              .insert(m.table("passkeyAdmissions"))
              .values({
                authorityScope: namespace,
                moduleId: feature.moduleId,
                version: policyRevision,
                ownerMarker: policyRevision,
              })
              .onConflictDoNothing();
          }
        }),
      );

      const credential = yield* makeTargetPasskeyCredentials<ReadMapping, never>(
        m.read,
        configuration,
      );

      const persistence = new Map<string, PasskeyPersistence["Service"]>();
      const managers = new Map<string, PasskeyManagementPersistence["Service"]>();
      const enrollment = new Map<string, PasskeyEnrollmentContext["Service"]>();

      for (const feature of features) {
        if (feature.management) {
          const mapping = yield* Effect.try({
            try: () => m.management(feature),
            catch: () =>
              configurationError(`Invalid passkey management mapping for ${feature.moduleId}`),
          });

          const services = yield* makeTargetPasskeyManagement<ManagementMapping, never>(
            mapping,
            configuration,
          );

          persistence.set(feature.moduleId, services.passkeyPersistence);
          managers.set(feature.moduleId, services.passkeyManagementPersistence);
          enrollment.set(
            feature.moduleId,
            (yield* makeTargetPasskeyEnrollmentContext<ManagementMapping, never>(
              mapping,
              configuration,
            )).passkeyEnrollmentContext,
          );
        } else {
          persistence.set(
            feature.moduleId,
            (yield* makeTargetPasskeyPersistence<BaseMapping, never>(
              m.base(feature),
              configuration,
            )).passkeyPersistence,
          );
        }
      }

      const service = <A>(services: ReadonlyMap<string, A>, moduleId: string) => {
        const value = services.get(moduleId);

        return value === undefined ? Effect.fail(unavailable()) : Effect.succeed(value);
      };

      let context: Context.Context<never> = Context.make(
        PasskeyCredentials,
        credential.passkeyCredentials,
      ).pipe(
        Context.add(PasskeyPersistence, {
          issue: (input, prepare) =>
            Effect.flatMap(service(persistence, input.ceremony.moduleId), (s) =>
              s.issue(input, prepare),
            ),
          context: (input) =>
            Effect.flatMap(service(persistence, input.moduleId), (s) => s.context(input)),
          claim: (input, prepare) =>
            Effect.flatMap(service(persistence, input.ceremony.moduleId), (s) =>
              s.claim(input, prepare),
            ),
          settle: (input, prepare) =>
            Effect.flatMap(service(persistence, input.claim.ceremony.moduleId), (s) =>
              s.settle(input, prepare),
            ),
          cleanup: (input, prepare) =>
            Effect.flatMap(service(persistence, input.moduleId), (s) => s.cleanup(input, prepare)),
        }),
      );

      if (managers.size > 0)
        context = context.pipe(
          Context.add(PasskeyEnrollmentContext, {
            capture: (input) =>
              Effect.flatMap(service(enrollment, input.moduleId), (s) => s.capture(input)),
          }),
          Context.add(PasskeyManagementPersistence, {
            issueEnrollment: (input, prepare) =>
              Effect.flatMap(service(managers, input.ceremony.moduleId), (s) =>
                s.issueEnrollment(input, prepare),
              ),
            completeEnrollment: (input, prepare) =>
              Effect.flatMap(service(managers, input.claim.ceremony.moduleId), (s) =>
                s.completeEnrollment(input, prepare),
              ),
            list: (input) =>
              Effect.flatMap(service(managers, input.moduleId), (s) => s.list(input)),
            inspectRemove: (input) =>
              Effect.flatMap(service(managers, input.moduleId), (s) => s.inspectRemove(input)),
            rename: (input, prepare) =>
              Effect.flatMap(service(managers, input.moduleId), (s) => s.rename(input, prepare)),
            remove: (input, prepare) =>
              Effect.flatMap(service(managers, input.moduleId), (s) => s.remove(input, prepare)),
          }),
        );

      return context;
    },
    Effect.mapError((error) =>
      Schema.is(PersistenceConfigurationError)(error)
        ? error
        : configurationError("Unable to configure passkey persistence"),
    ),
  );

  return make;
};
