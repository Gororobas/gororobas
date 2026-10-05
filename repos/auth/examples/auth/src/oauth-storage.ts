import * as LibsqlClient from "@effect/sql-libsql/LibsqlClient";
import * as Mapping from "@yielded/auth-persistence-drizzle";
import * as Native from "@yielded/auth-persistence-drizzle/Libsql";
import * as OAuth from "@yielded/auth/OAuth";
import { SubjectId } from "@yielded/auth/Schema";
import * as Sessions from "@yielded/auth/Sessions";
import { and, eq, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { SqlClient } from "effect/sql";

export interface StorageOptions {
  readonly moduleId: string;
  readonly provider: string;
  readonly issuer: string;
  readonly externalSubject: string;
  readonly subjectId: string;
  readonly filename: string;
  /** Override only with a clock using the same integer-millisecond representation. */
  readonly clock?: Mapping.OAuthClock;
}

const subjects = sqliteTable("oauth_subject", {
  id: text().primaryKey(),
  status: text().notNull(),
  securityRevision: text().notNull(),
});

const credentials = sqliteTable(
  "oauth_authority_credential",
  {
    subjectId: text().notNull(),
    credentialId: text().notNull(),
    revision: text().notNull(),
    status: text().notNull(),
  },
  (t) => [uniqueIndex("oauth_authority_credential_owner").on(t.subjectId, t.credentialId)],
);

const identities = sqliteTable("oauth_identity", {
  identityKey: text().primaryKey(),
  provider: text().notNull(),
  issuer: text().notNull(),
  externalSubject: text().notNull(),
  state: text().notNull(),
  version: text().notNull(),
  subjectId: text(),
  reservation: text(),
});

const logins = sqliteTable(
  "oauth_login",
  {
    moduleId: text().notNull(),
    credentialId: text().primaryKey(),
    subjectId: text().notNull(),
    identityKey: text().notNull().unique(),
    credentialRevision: text().notNull(),
    status: text().notNull(),
  },
  (t) => [index("oauth_login_owner").on(t.identityKey, t.subjectId)],
);

// The adapter fills protocol columns after each encoder. Its terminal transitions
// erase snapshots and claims; the example never serializes those values itself.
const signInFlows = sqliteTable(
  "oauth_sign_in_flow",
  {
    moduleId: text().notNull(),
    flowId: text().notNull(),
    commandId: text(),
    purpose: text().notNull(),
    generation: integer(),
    state: text(),
    version: text(),
    stateDigest: text(),
    binderVerifier: text(),
    binderExpiresAt: integer(),
    snapshot: text(),
    issuedAt: integer(),
    expiresAt: integer(),
    claimId: text(),
    claimedAt: integer(),
    claimExpiresAt: integer(),
    retentionUntil: integer(),
  },
  (t) => [
    uniqueIndex("oauth_sign_in_flow_id").on(t.moduleId, t.flowId),
    uniqueIndex("oauth_sign_in_flow_command").on(t.moduleId, t.commandId),
    uniqueIndex("oauth_sign_in_flow_state").on(t.stateDigest),
  ],
);

const connectedFlows = sqliteTable(
  "oauth_connected_flow",
  {
    moduleId: text().notNull(),
    flowId: text().notNull(),
    commandId: text(),
    // Sign-in reserves provider work before resolving a local subject.
    subjectId: text(),
    clientKey: text(),
    cohortKey: text(),
    state: text(),
    version: text(),
    stateDigest: text(),
    snapshot: text(),
    claimId: text(),
    claimDigest: text(),
    claimOrder: integer(),
    claimedAt: integer(),
    claimExpiresAt: integer(),
    expiresAt: integer(),
    retentionUntil: integer(),
    work: text(),
    custody: text(),
  },
  (t) => [
    uniqueIndex("oauth_connected_flow_id").on(t.moduleId, t.flowId),
    uniqueIndex("oauth_connected_flow_command").on(t.moduleId, t.commandId),
    uniqueIndex("oauth_connected_flow_state").on(t.stateDigest),
    index("oauth_connected_flow_client").on(t.clientKey),
    index("oauth_connected_flow_cohort").on(t.cohortKey),
  ],
);

const grants = sqliteTable(
  "oauth_connected_grant",
  {
    moduleId: text().notNull(),
    grantId: text().notNull(),
    subjectId: text().notNull(),
    identityKey: text(),
    activeIdentityKey: text(),
    clientKey: text(),
    cohortKey: text(),
    profileKey: text(),
    grantVersion: text(),
    tokenVersion: text(),
    cohortGeneration: text(),
    state: text(),
    version: text(),
    context: text(),
    sealed: text(),
    summary: text(),
    revocationJobId: text(),
    refreshWork: text(),
    refreshClaim: text(),
    refreshClaimExpiresAt: integer(),
    retentionUntil: integer(),
  },
  (t) => [
    uniqueIndex("oauth_connected_grant_id").on(t.moduleId, t.grantId),
    uniqueIndex("oauth_connected_grant_active").on(
      t.moduleId,
      t.subjectId,
      t.profileKey,
      t.activeIdentityKey,
    ),
    index("oauth_connected_grant_identity").on(t.identityKey),
    index("oauth_connected_grant_client").on(t.clientKey),
    index("oauth_connected_grant_cohort").on(t.cohortKey),
  ],
);

const clients = sqliteTable(
  "oauth_connected_client",
  {
    clientKey: text(),
    provider: text().notNull(),
    issuer: text().notNull(),
    clientRegistrationId: text().notNull(),
    counter: integer(),
    version: text(),
  },
  (t) => [uniqueIndex("oauth_connected_client_id").on(t.clientKey)],
);

const cohorts = sqliteTable(
  "oauth_connected_cohort",
  {
    cohortKey: text(),
    clientKey: text().notNull(),
    identityKey: text().notNull(),
    generation: text(),
    cutoff: integer(),
    state: text(),
    version: text(),
  },
  (t) => [
    uniqueIndex("oauth_connected_cohort_id").on(t.cohortKey),
    index("oauth_connected_cohort_identity").on(t.identityKey),
    index("oauth_connected_cohort_client").on(t.clientKey),
  ],
);

const admissions = sqliteTable(
  "oauth_connected_admission",
  {
    admissionId: text().primaryKey(),
    moduleId: text().notNull(),
    grantId: text().notNull(),
    subjectId: text().notNull(),
    identityKey: text(),
    clientKey: text(),
    cohortKey: text(),
    snapshot: text(),
    admittedAt: integer(),
    expiresAt: integer(),
    version: text(),
  },
  (t) => [index("oauth_connected_admission_identity").on(t.identityKey)],
);

const commands = sqliteTable(
  "oauth_connected_command",
  {
    moduleId: text().notNull(),
    commandId: text().notNull(),
    subjectId: text().notNull(),
    grantId: text().notNull(),
    intent: text(),
    decision: text(),
    retentionUntil: integer(),
    version: text(),
  },
  (t) => [uniqueIndex("oauth_connected_command_id").on(t.moduleId, t.commandId)],
);

const revocations = sqliteTable(
  "oauth_connected_revocation",
  {
    jobId: text().primaryKey(),
    moduleId: text().notNull(),
    subjectId: text().notNull(),
    identityKey: text(),
    clientKey: text(),
    cohortKey: text(),
    grantId: text().notNull(),
    snapshot: text(),
    state: text(),
    claimId: text(),
    claimedAt: integer(),
    claimExpiresAt: integer(),
    retentionUntil: integer(),
    version: text(),
  },
  (t) => [
    index("oauth_connected_revocation_identity").on(t.identityKey),
    index("oauth_connected_revocation_client").on(t.clientKey),
    index("oauth_connected_revocation_cohort").on(t.cohortKey),
  ],
);

const requirement = Sessions.AuthenticationRequirement.make({
  maximumAgeMillis: 300_000,
  alternatives: [
    {
      factors: ["possession"],
      minimumCredentials: 1,
      userVerified: false,
      phishingResistant: false,
    },
  ],
});

const policyRevision = Sessions.SecurityRevision.make("owner-v1");

const clock: Mapping.OAuthClock = {
  encodeInstant: (millis) => millis,
  decodeInstant: Schema.decodeUnknownSync(OAuth.OAuthInstant),
  engineNowMillis: sql`cast(round((julianday('now') - 2440587.5) * 86400000) as integer)`,
};

const order: Mapping.OAuthConnectedOrderCodec = {
  encode: (value) => value,
  decode: Schema.decodeUnknownSync(OAuth.OAuthInstant),
};

const subjectId: Mapping.SubjectIdCodec<string> = {
  toNative: (id) => Effect.succeed(id),
  toSubject: (id) =>
    Schema.decodeEffect(SubjectId)(id).pipe(
      Effect.mapError(() =>
        Mapping.PersistenceMappingError.make({
          operation: "oauth-storage.subject",
          cause: undefined,
        }),
      ),
    ),
  equals: (left, right) => left === right,
};

const subject = {
  table: subjects,
  id: "id",
  status: "status",
  securityRevision: "securityRevision",
  isActiveStatus: (value: unknown) => value === "active",
  activeCondition: eq(subjects.status, "active"),
  decodeActionRequirement: () => requirement,
} satisfies Mapping.OAuthConnectedSubjectTable<typeof subjects>;

const authority = {
  table: credentials,
  subjectId: "subjectId",
  credentialId: "credentialId",
  revision: "revision",
  status: "status",
  isActiveStatus: (value: unknown) => value === "active",
  activeCondition: eq(credentials.status, "active"),
} satisfies Mapping.OAuthAuthorityReadTable<typeof credentials>;

const credential = {
  table: logins,
  moduleId: "moduleId",
  credentialId: "credentialId",
  subjectId: "subjectId",
  identityKey: "identityKey",
  credentialRevision: "credentialRevision",
  status: "status",
  isActiveStatus: (value: unknown) => value === "active",
  activeCondition: eq(logins.status, "active"),
} satisfies Mapping.OAuthCredentialReadTable<typeof logins>;

const signInFlow = {
  table: signInFlows,
  moduleId: "moduleId",
  flowId: "flowId",
  commandId: "commandId",
  purpose: "purpose",
  generation: "generation",
  state: "state",
  version: "version",
  stateDigest: "stateDigest",
  binderVerifier: "binderVerifier",
  binderExpiresAt: "binderExpiresAt",
  snapshot: "snapshot",
  issuedAt: "issuedAt",
  expiresAt: "expiresAt",
  claimId: "claimId",
  claimedAt: "claimedAt",
  claimExpiresAt: "claimExpiresAt",
  retentionUntil: "retentionUntil",
  encodeInsert: (input) => input,
} satisfies Mapping.OAuthFlowTable<typeof signInFlows>;

const ownership = {
  mode: "integrated",
  tuple: {
    table: identities,
    identityKey: "identityKey",
    provider: "provider",
    issuer: "issuer",
    externalSubject: "externalSubject",
    state: "state",
    version: "version",
    subjectId: "subjectId",
    reservation: "reservation",
    // Only startup provisioning may introduce an identity. A verified provider
    // response cannot expand the application's allowlist through connect.
    encodeInsert: () => {
      throw Mapping.PersistenceMappingError.make({
        operation: "oauth-storage.unprovisioned-identity",
        cause: undefined,
      });
    },
  },
} satisfies Mapping.OAuthOwnershipMutation<typeof identities, typeof identities, string>;

const connectedFlow = {
  table: connectedFlows,
  moduleId: "moduleId",
  flowId: "flowId",
  commandId: "commandId",
  subjectId: "subjectId",
  clientKey: "clientKey",
  cohortKey: "cohortKey",
  state: "state",
  version: "version",
  stateDigest: "stateDigest",
  snapshot: "snapshot",
  claimId: "claimId",
  claimDigest: "claimDigest",
  claimOrder: "claimOrder",
  claimedAt: "claimedAt",
  claimExpiresAt: "claimExpiresAt",
  expiresAt: "expiresAt",
  retentionUntil: "retentionUntil",
  work: "work",
  custody: "custody",
  encodeInsert: ({ flow, subjectId }) => ({
    moduleId: flow.context.moduleId,
    flowId: flow.context.flowId,
    subjectId,
  }),
  encodeSignIn: ({ claim }) => ({
    moduleId: claim.flow.context.moduleId,
    flowId: claim.flow.context.flowId,
    subjectId: null,
  }),
} satisfies Mapping.OAuthConnectedFlowTable<typeof connectedFlows, string>;

const grant = {
  table: grants,
  moduleId: "moduleId",
  grantId: "grantId",
  subjectId: "subjectId",
  identityKey: "identityKey",
  activeIdentityKey: "activeIdentityKey",
  clientKey: "clientKey",
  cohortKey: "cohortKey",
  profileKey: "profileKey",
  grantVersion: "grantVersion",
  tokenVersion: "tokenVersion",
  cohortGeneration: "cohortGeneration",
  state: "state",
  version: "version",
  context: "context",
  sealed: "sealed",
  summary: "summary",
  revocationJobId: "revocationJobId",
  refreshWork: "refreshWork",
  refreshClaim: "refreshClaim",
  refreshClaimExpiresAt: "refreshClaimExpiresAt",
  retentionUntil: "retentionUntil",
  encodeInsert: ({ grant, subjectId }) => ({
    moduleId: grant.context.moduleId,
    grantId: grant.context.grantId,
    subjectId,
  }),
} satisfies Mapping.OAuthConnectedGrantTable<typeof grants, string>;

const client = {
  table: clients,
  clientKey: "clientKey",
  provider: "provider",
  issuer: "issuer",
  clientRegistrationId: "clientRegistrationId",
  counter: "counter",
  version: "version",
  encodeInsert: (configuration) => ({
    provider: configuration.provider,
    issuer: configuration.issuer,
    clientRegistrationId: configuration.profile.clientRegistrationId,
  }),
} satisfies Mapping.OAuthConnectedClientRegistrationTable<typeof clients>;

const cohort = {
  table: cohorts,
  cohortKey: "cohortKey",
  clientKey: "clientKey",
  identityKey: "identityKey",
  generation: "generation",
  cutoff: "cutoff",
  state: "state",
  version: "version",
  encodeInsert: (input) => input,
} satisfies Mapping.OAuthConnectedCohortTable<typeof cohorts>;

const admission = {
  table: admissions,
  admissionId: "admissionId",
  moduleId: "moduleId",
  grantId: "grantId",
  subjectId: "subjectId",
  identityKey: "identityKey",
  clientKey: "clientKey",
  cohortKey: "cohortKey",
  snapshot: "snapshot",
  admittedAt: "admittedAt",
  expiresAt: "expiresAt",
  version: "version",
  encodeInsert: ({ admissionId, grant, subjectId }) => ({
    admissionId,
    moduleId: grant.context.moduleId,
    grantId: grant.context.grantId,
    subjectId,
  }),
} satisfies Mapping.OAuthConnectedAdmissionTable<typeof admissions, string>;

const command = {
  table: commands,
  moduleId: "moduleId",
  commandId: "commandId",
  subjectId: "subjectId",
  grantId: "grantId",
  intent: "intent",
  decision: "decision",
  retentionUntil: "retentionUntil",
  version: "version",
  encodeInsert: ({ commandId, grant, subjectId }) => ({
    commandId,
    moduleId: grant.context.moduleId,
    grantId: grant.context.grantId,
    subjectId,
  }),
} satisfies Mapping.OAuthConnectedCommandTable<typeof commands, string>;

const job = {
  table: revocations,
  jobId: "jobId",
  moduleId: "moduleId",
  subjectId: "subjectId",
  identityKey: "identityKey",
  clientKey: "clientKey",
  cohortKey: "cohortKey",
  grantId: "grantId",
  snapshot: "snapshot",
  state: "state",
  claimId: "claimId",
  claimedAt: "claimedAt",
  claimExpiresAt: "claimExpiresAt",
  retentionUntil: "retentionUntil",
  version: "version",
  encodeInsert: ({ job, subjectId }) => ({
    jobId: job.context.jobId,
    moduleId: job.context.token.moduleId,
    grantId: job.context.token.grantId,
    subjectId,
  }),
} satisfies Mapping.OAuthConnectedRevocationJobTable<typeof revocations, string>;

// This example owns a fresh schema, not the removed OAuthApp schema. Applications
// should move these statements to their ordinary migration system.
const migrations = [
  `CREATE TABLE IF NOT EXISTS oauth_subject (
    id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, securityRevision TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS oauth_authority_credential (
    subjectId TEXT NOT NULL, credentialId TEXT NOT NULL, revision TEXT NOT NULL, status TEXT NOT NULL,
    UNIQUE(subjectId, credentialId))`,
  `CREATE TABLE IF NOT EXISTS oauth_identity (
    identityKey TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, issuer TEXT NOT NULL,
    externalSubject TEXT NOT NULL, state TEXT NOT NULL, version TEXT NOT NULL, subjectId TEXT, reservation TEXT)`,
  `CREATE TABLE IF NOT EXISTS oauth_login (
    moduleId TEXT NOT NULL, credentialId TEXT PRIMARY KEY NOT NULL, subjectId TEXT NOT NULL,
    identityKey TEXT NOT NULL UNIQUE, credentialRevision TEXT NOT NULL, status TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS oauth_login_owner ON oauth_login(identityKey, subjectId)`,
  `CREATE TABLE IF NOT EXISTS oauth_sign_in_flow (
    moduleId TEXT NOT NULL, flowId TEXT NOT NULL, commandId TEXT, purpose TEXT NOT NULL,
    generation INTEGER, state TEXT, version TEXT, stateDigest TEXT, binderVerifier TEXT,
    binderExpiresAt INTEGER, snapshot TEXT, issuedAt INTEGER, expiresAt INTEGER,
    claimId TEXT, claimedAt INTEGER, claimExpiresAt INTEGER, retentionUntil INTEGER,
    UNIQUE(moduleId, flowId), UNIQUE(moduleId, commandId), UNIQUE(stateDigest))`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_flow (
    moduleId TEXT NOT NULL, flowId TEXT NOT NULL, commandId TEXT, subjectId TEXT, clientKey TEXT,
    cohortKey TEXT, state TEXT, version TEXT, stateDigest TEXT, snapshot TEXT, claimId TEXT,
    claimDigest TEXT, claimOrder INTEGER, claimedAt INTEGER, claimExpiresAt INTEGER,
    expiresAt INTEGER, retentionUntil INTEGER, work TEXT, custody TEXT,
    UNIQUE(moduleId, flowId), UNIQUE(moduleId, commandId), UNIQUE(stateDigest))`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_flow_client ON oauth_connected_flow(clientKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_flow_cohort ON oauth_connected_flow(cohortKey)`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_grant (
    moduleId TEXT NOT NULL, grantId TEXT NOT NULL, subjectId TEXT NOT NULL, identityKey TEXT,
    activeIdentityKey TEXT, clientKey TEXT, cohortKey TEXT, profileKey TEXT, grantVersion TEXT,
    tokenVersion TEXT, cohortGeneration TEXT, state TEXT, version TEXT, context TEXT, sealed TEXT,
    summary TEXT, revocationJobId TEXT, refreshWork TEXT, refreshClaim TEXT,
    refreshClaimExpiresAt INTEGER, retentionUntil INTEGER, UNIQUE(moduleId, grantId),
    UNIQUE(moduleId, subjectId, profileKey, activeIdentityKey))`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_grant_identity ON oauth_connected_grant(identityKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_grant_client ON oauth_connected_grant(clientKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_grant_cohort ON oauth_connected_grant(cohortKey)`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_client (
    clientKey TEXT UNIQUE, provider TEXT NOT NULL, issuer TEXT NOT NULL,
    clientRegistrationId TEXT NOT NULL, counter INTEGER, version TEXT)`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_cohort (
    cohortKey TEXT UNIQUE, clientKey TEXT NOT NULL, identityKey TEXT NOT NULL,
    generation TEXT, cutoff INTEGER, state TEXT, version TEXT)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_cohort_identity ON oauth_connected_cohort(identityKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_cohort_client ON oauth_connected_cohort(clientKey)`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_admission (
    admissionId TEXT PRIMARY KEY NOT NULL, moduleId TEXT NOT NULL, grantId TEXT NOT NULL,
    subjectId TEXT NOT NULL, identityKey TEXT, clientKey TEXT, cohortKey TEXT, snapshot TEXT,
    admittedAt INTEGER, expiresAt INTEGER, version TEXT)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_admission_identity ON oauth_connected_admission(identityKey)`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_command (
    moduleId TEXT NOT NULL, commandId TEXT NOT NULL, subjectId TEXT NOT NULL, grantId TEXT NOT NULL,
    intent TEXT, decision TEXT, retentionUntil INTEGER, version TEXT, UNIQUE(moduleId, commandId))`,
  `CREATE TABLE IF NOT EXISTS oauth_connected_revocation (
    jobId TEXT PRIMARY KEY NOT NULL, moduleId TEXT NOT NULL, subjectId TEXT NOT NULL,
    identityKey TEXT, clientKey TEXT, cohortKey TEXT, grantId TEXT NOT NULL, snapshot TEXT,
    state TEXT, claimId TEXT, claimedAt INTEGER, claimExpiresAt INTEGER, retentionUntil INTEGER, version TEXT)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_revocation_identity ON oauth_connected_revocation(identityKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_revocation_client ON oauth_connected_revocation(clientKey)`,
  `CREATE INDEX IF NOT EXISTS oauth_connected_revocation_cohort ON oauth_connected_revocation(cohortKey)`,
];

// Canonical adapter identity key: SHA-256 of versioned, length-prefixed UTF-8
// fields. Keep this at the app provisioning boundary until the adapter exports it.
const identityKey = Effect.fn("OAuthStorage.identityKey")(function* (
  identity: typeof OAuth.OAuthExternalIdentity.Type,
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const fields = [
    "effect-auth/oauth-identity-key/v1",
    identity.provider,
    identity.issuer,
    identity.subject,
  ];

  const bytes = fields.map((value) => encoder.encode(value));

  if (bytes.some((value, i) => decoder.decode(value) !== fields[i])) {
    return yield* Mapping.PersistenceMappingError.make({
      operation: "oauth-storage.identity",
      cause: undefined,
    });
  }
  const packed = new Uint8Array(bytes.reduce((size, value) => size + 4 + value.length, 0));
  const view = new DataView(packed.buffer);
  let offset = 0;

  for (const value of bytes) {
    view.setUint32(offset, value.length, false);
    packed.set(value, offset + 4);
    offset += 4 + value.length;
  }

  const digest = yield* Effect.tryPromise({
    try: () => globalThis.crypto.subtle.digest("SHA-256", packed),
    catch: () =>
      Mapping.PersistenceMappingError.make({
        operation: "oauth-storage.identity",
        cause: undefined,
      }),
  });

  return "v1:" + Base64Url.encode(new Uint8Array(digest));
});

/** App-owned allowlist and explicit Drizzle storage for OAuth sign-in and grants.
 * Sessions stay stateless. The single federated factor satisfies completion, so
 * pending authentication is not installed. Existing authority rows are never
 * reactivated or reassigned. Supply LifecycleHooks (empty is suitable here).
 */
export const makeStorage = (options: StorageOptions) => {
  const database = Native.databaseLayer.pipe(
    Layer.provideMerge(LibsqlClient.layer({ url: `file:${options.filename}`, intMode: "number" })),
  );

  return Layer.effectContext(
    Effect.gen(function* () {
      const moduleId = yield* Schema.decodeEffect(OAuth.OAuthModuleId)(options.moduleId);
      const localSubject = yield* Schema.decodeEffect(SubjectId)(options.subjectId);

      const identity = yield* Schema.decodeEffect(OAuth.OAuthExternalIdentity)({
        provider: options.provider,
        issuer: options.issuer,
        subject: options.externalSubject,
      });

      const key = yield* identityKey(identity);
      const credentialId = `oauth:${key}`;
      const sqlClient = yield* SqlClient.SqlClient;
      const db = yield* Native.Database;

      yield* db.transaction(() =>
        Effect.gen(function* () {
          for (const statement of migrations) yield* sqlClient.unsafe(statement);
          yield* db
            .insert(subjects)
            .values({ id: localSubject, status: "active", securityRevision: "initial" })
            .onConflictDoNothing();
          yield* db
            .insert(identities)
            .values({
              identityKey: key,
              provider: identity.provider,
              issuer: identity.issuer,
              externalSubject: identity.subject,
              subjectId: localSubject,
              state: "Owned",
              version: "initial",
              reservation: null,
            })
            .onConflictDoNothing();
          yield* db
            .insert(logins)
            .values({
              moduleId,
              credentialId,
              subjectId: localSubject,
              identityKey: key,
              credentialRevision: "initial",
              status: "active",
            })
            .onConflictDoNothing();
          yield* db
            .insert(credentials)
            .values({
              subjectId: localSubject,
              credentialId,
              revision: "initial",
              status: "active",
            })
            .onConflictDoNothing();

          const [owner] = yield* db
            .select()
            .from(identities)
            .where(eq(identities.identityKey, key));

          const [login] = yield* db.select().from(logins).where(eq(logins.identityKey, key));

          const [factor] = yield* db
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.subjectId, localSubject),
                eq(credentials.credentialId, credentialId),
              ),
            );

          if (
            owner === undefined ||
            owner.state !== "Owned" ||
            owner.subjectId !== localSubject ||
            owner.provider !== identity.provider ||
            owner.issuer !== identity.issuer ||
            owner.externalSubject !== identity.subject ||
            login === undefined ||
            login.moduleId !== moduleId ||
            login.subjectId !== localSubject ||
            login.credentialId !== credentialId ||
            factor === undefined ||
            factor.revision !== login.credentialRevision
          ) {
            return yield* Mapping.PersistenceMappingError.make({
              operation: "oauth-storage.provision-conflict",
              cause: undefined,
            });
          }
        }),
      );

      const common = { subject, authority, subjectId, clock: options.clock ?? clock };

      const signIn = {
        ...common,
        ownership: {
          table: identities,
          identityKey: "identityKey",
          provider: "provider",
          issuer: "issuer",
          externalSubject: "externalSubject",
          subjectId: "subjectId",
          ownedCondition: and(
            eq(identities.state, "Owned"),
            eq(identities.identityKey, key),
            eq(identities.subjectId, localSubject),
          )!,
          decodeSubjectId: (row) => Schema.decodeUnknownSync(Schema.String)(row.subjectId),
        },
        credential,
        flow: signInFlow,
        constraints: Mapping.requiredOAuthSignInConstraints,
      } satisfies Mapping.OAuthSignInMapping<
        typeof subjects,
        typeof identities,
        typeof logins,
        typeof credentials,
        typeof signInFlows,
        string
      >;

      const connected = {
        ...common,
        ownership,
        flow: connectedFlow,
        grant,
        client,
        cohort,
        admission,
        command,
        signIn: { credential, flow: signInFlow },
        order,
        retentionMillis: 86_400_000,
        tupleConstraints: Mapping.requiredOAuthTupleConstraints,
        constraints: Mapping.requiredOAuthConnectedConstraints,
        revocation: {
          mode: "cohort",
          job,
          constraints: Mapping.requiredOAuthConnectedRevocationConstraints,
        },
        policy: {
          condition: (input) => {
            const configuration =
              input.kind === "action" || input.kind === "sign-in"
                ? input.configuration
                : input.grant?.configuration;

            const requestedModule =
              input.kind === "sign-in"
                ? input.credential.moduleId
                : input.kind === "action"
                  ? input.authorization.challenge.moduleId
                  : input.authorization.moduleId;

            if (
              input.subjectId !== localSubject ||
              requestedModule !== moduleId ||
              ((input.kind === "metadata" || input.kind === "use") &&
                input.authorization.policyRevision !== policyRevision) ||
              (configuration !== undefined &&
                (configuration.provider !== identity.provider ||
                  configuration.issuer !== identity.issuer)) ||
              (input.grant !== undefined &&
                (input.grant.identity.provider !== identity.provider ||
                  input.grant.identity.issuer !== identity.issuer ||
                  input.grant.identity.subject !== identity.subject))
            )
              return sql`0`;

            return sql`exists(select 1 from ${identities} where ${identities.identityKey} = ${key} and ${identities.subjectId} = ${localSubject} and ${identities.state} = 'Owned')`;
          },
        },
        externalReference: ({ identityKey, subjectId }) =>
          sql`exists(select 1 from ${logins} where ${eq(logins.identityKey, identityKey)} and ${eq(logins.subjectId, subjectId)})`,
      } satisfies Mapping.OAuthConnectedMapping<
        typeof subjects,
        typeof credentials,
        typeof identities,
        typeof identities,
        typeof connectedFlows,
        typeof grants,
        typeof clients,
        typeof cohorts,
        typeof admissions,
        typeof commands,
        string,
        typeof revocations
      >;

      const signInServices = yield* Native.makeOAuthSignInServices(signIn);
      const connectedServices = yield* Native.makeOAuthConnectedServices(connected);

      const revocationServices = yield* Native.makeOAuthConnectedRevocationServices({
        ...connected,
        job,
        constraints: Mapping.requiredOAuthConnectedRevocationConstraints,
      });

      const sessionServices = yield* Native.makeAuthenticationAuthorityServices({
        subjectId,
        subject: { ...subject, decodeRequirement: () => Effect.succeed(requirement) },
        credential: authority,
        isConstraintConflict: () => false,
      });

      const useAuthority = OAuth.OAuthConnectedUseAuthority.of({
        authorize: Effect.fn("OAuthStorage.authorizeUse")(function* (input) {
          if (
            input.invocation._tag !== "Authenticated" ||
            input.invocation.subjectId !== localSubject ||
            input.moduleId !== moduleId
          )
            return yield* OAuth.OAuthRejected.make({});

          const current = yield* sessionServices.authenticationAuthority
            .capture(localSubject, [credentialId])
            .pipe(
              Effect.catchTags({
                StaleAuthentication: () => OAuth.OAuthRejected.make({}),
                SessionUnavailable: () => OAuth.OAuthUnavailable.make({}),
              }),
            );

          const revision = yield* Schema.decodeEffect(OAuth.OAuthAccountRevision)(current).pipe(
            Effect.mapError(() => OAuth.OAuthUnavailable.make({})),
          );

          return {
            moduleId,
            revision,
            policyRevision,
            expiresAtMillis: DateTime.toEpochMillis(yield* DateTime.now) + 30_000,
            purpose: input.purpose,
            ...(input.grantId === undefined ? {} : { grantId: input.grantId }),
            ...(input.profileKey === undefined ? {} : { profileKey: input.profileKey }),
          };
        }),
      });

      return Context.make(OAuth.OAuthSignInPersistence, signInServices.oauthSignInPersistence).pipe(
        Context.add(OAuth.OAuthConnectedPersistence, connectedServices.oauthConnectedPersistence),
        Context.add(OAuth.OAuthConnectedRevocations, revocationServices.oauthConnectedRevocations),
        Context.add(Sessions.AuthenticationAuthority, sessionServices.authenticationAuthority),
        Context.add(OAuth.OAuthConnectedUseAuthority, useAuthority),
        // Connection management requires an application verifier for the exact
        // action challenge. Session assurance alone cannot authorize disconnect.
        Context.add(OAuth.OAuthConnectedActionEvidence, {
          verify: () => Effect.fail(OAuth.OAuthConnectedActionRequired.make({})),
        }),
      );
    }),
  ).pipe(Layer.provideMerge(database));
};
