import { OAuth, Sessions } from "@yielded/auth";
import { PersistenceMappingError } from "@yielded/auth-persistence";
import * as Mapping from "@yielded/auth-persistence/OAuthPersistence";
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import type { identities } from "../../shared/oauth/storage";
import {
  authority,
  grants,
  revocations,
  credential,
  logins,
  makeMappings,
  makeServices,
  ownership,
  requirement,
  signInFlow,
  subject,
  subjectId,
} from "../../shared/oauth/storage";
import { AppAuth, moduleId, ownerId, profile, Registration } from "./oauth-lifecycle-model";

const { sql, eq } = Mapping;
const string = Schema.decodeUnknownSync(Schema.String);
const registrationJson = Schema.fromJsonString(Registration);

const intents = Mapping.table({
  name: "demo_oauth_registration",
  columns: {
    moduleId: { name: "moduleId", type: "text" },
    reference: { name: "reference", type: "text" },
    flowId: { name: "flowId", type: "text" },
    identityKey: { name: "identityKey", type: "text", nullable: true },
    snapshot: { name: "snapshot", type: "text", nullable: true },
    expiresAt: { name: "expiresAt", type: "integer", nullable: true },
    retentionUntil: { name: "retentionUntil", type: "integer", nullable: true },
  },
  unique: [
    ["moduleId", "reference"],
    ["moduleId", "flowId"],
  ],
});

const intent = {
  table: intents,
  moduleId: "moduleId",
  reference: "reference",
  flowId: "flowId",
  identityKey: "identityKey",
  snapshot: "snapshot",
  expiresAt: "expiresAt",
  retentionUntil: "retentionUntil",
  encodeInsert: (value) => ({
    moduleId: value.context.moduleId,
    reference: value.reference,
    flowId: value.context.flowId,
  }),
} satisfies Mapping.OAuthRegistrationIntentTable<typeof intents>;

export const mutableOwnership = {
  ...ownership,
  encodeInsert: ({ identityKey, identity, subjectId }) => ({
    identityKey,
    provider: identity.provider,
    issuer: identity.issuer,
    externalSubject: identity.subject,
    subjectId,
  }),
} satisfies Mapping.OAuthOwnershipTable<typeof identities, string>;

export const mutableCredential = {
  ...credential,
  removal: "delete",
  encodeInsert: (value) => ({ ...value, status: "active" }),
} satisfies Mapping.OAuthCredentialTable<typeof logins, string>;

export const mutableAuthority = {
  ...authority,
  encodeInsert: (value) => ({ ...value, status: "active" }),
} satisfies Mapping.OAuthAuthorityTable<typeof authority.table, string>;

/** Shared app-owned OAuth login mapping; callers select session and metadata policy. */
export const makeAccountsMapping = Effect.fnUntraced(function* () {
  const crypto = yield* Crypto.Crypto;

  const uuid = crypto
    .randomUUIDv4()
    .pipe(
      Effect.mapError((cause) =>
        PersistenceMappingError.make({ operation: "demo.allocate", cause }),
      ),
    );

  return {
    subject: {
      ...subject,
      decodeAuthenticationRequirement: () => requirement,
      nextSecurityRevision: (current) =>
        Sessions.SecurityRevision.make(current === "initial" ? "1" : String(BigInt(current) + 1n)),
    },
    ownership: mutableOwnership,
    credential: mutableCredential,
    authority: mutableAuthority,
    flow: signInFlow,
    subjectId,
    clock: Mapping.clock,
    constraints: Mapping.requiredOAuthSignInConstraints,
    // This demo permits any verified caller to view their own active login methods.
    metadataAccess: () => sql`true`,
    eligibility: [
      Mapping.oauthEligibilityTable<typeof logins, string>({
        table: logins,
        subjectId: "subjectId",
        credentialId: "credentialId",
        revision: "credentialRevision",
        scope: "demo-oauth-logins",
        condition: () => eq(logins.columns.status, "active"),
        decode: (row) => ({
          credentialId: string(row.credentialId),
          revision: Schema.decodeUnknownSync(Sessions.SecurityRevision)(row.credentialRevision),
          usablePrimary: row.status === "active",
          factors: ["possession"],
          userVerified: false,
          phishingResistant: false,
        }),
      }),
    ],
    cleanup: [],
    sessionInvalidation: "original-absolute-expiry",
    otherReferences: ({ identityKey, subjectId }) =>
      sql`exists(select 1 from ${grants} where ${eq(grants.columns.identityKey, identityKey)} and ${eq(grants.columns.subjectId, subjectId)}) or exists(select 1 from ${revocations} where ${eq(revocations.columns.identityKey, identityKey)} and ${eq(revocations.columns.subjectId, subjectId)})`,
    allocateCredentialId: uuid,
    allocateRevision: uuid.pipe(Effect.map((value) => Sessions.SecurityRevision.make(value))),
  } satisfies Mapping.OAuthAccountsMapping<
    typeof subject.table,
    typeof identities,
    typeof logins,
    typeof authority.table,
    typeof signInFlow.table,
    string
  >;
});

/** App-owned migration and policy for this disposable CLI consumer only. */
export const makeLifecycleStorage = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;

  const uuid = crypto
    .randomUUIDv4()
    .pipe(
      Effect.mapError((cause) =>
        PersistenceMappingError.make({ operation: "demo.allocate", cause }),
      ),
    );

  const dialect = client.onDialectOrElse({
    pg: () => "pg" as const,
    orElse: () => "sqlite" as const,
  });

  const base = yield* makeMappings({
    moduleId,
    subjectId: ownerId,
    provider: profile.provider,
    issuer: "https://www.strava.com",
    externalSubject: "123",
  });

  const integer = dialect === "pg" ? "BIGINT" : "INTEGER";

  yield* client.unsafe(`CREATE TABLE IF NOT EXISTS demo_oauth_registration (
    "moduleId" TEXT NOT NULL, reference TEXT NOT NULL, "flowId" TEXT NOT NULL,
    "identityKey" TEXT, snapshot TEXT, "expiresAt" ${integer}, "retentionUntil" ${integer},
    UNIQUE("moduleId", reference), UNIQUE("moduleId", "flowId"))`);

  const signIn = base.signIn;

  const registration = {
    registration: Registration,
    ownership: mutableOwnership,
    intent,
    clock: Mapping.clock,
    constraints: Mapping.requiredOAuthRegistrationConstraints,
    inspect: ({ registration }) =>
      Effect.succeed({
        fingerprint: `demo-v1:${Schema.encodeSync(registrationJson)(registration)}`,
        eligible: true,
      }),
    eligibility: { admission: () => sql`true`, postcondition: () => sql`true` },
    subjectId,
    subject,
    credential: mutableCredential,
    authority: mutableAuthority,
    allocateSubjectId: uuid,
    allocateCredentialId: uuid,
    allocateRevision: Effect.succeed(Sessions.SecurityRevision.make("0")),
    encodeSubjectInsert: (_input, ids) => ({
      id: ids.subjectId,
      status: "active",
      securityRevision: ids.securityRevision,
    }),
  } satisfies Mapping.OAuthRegistrationMapping<
    typeof Registration.Type,
    typeof subject.table,
    typeof identities,
    typeof logins,
    typeof authority.table,
    typeof intents,
    string
  >;

  const accounts = yield* makeAccountsMapping();

  const registrationIntents = yield* Mapping.makeOAuthRegistrationIntentServices({
    ownership: mutableOwnership,
    intent,
    clock: Mapping.clock,
    constraints: {
      intentReference: Mapping.requiredOAuthRegistrationConstraints.intentReference,
      intentFlow: Mapping.requiredOAuthRegistrationConstraints.intentFlow,
      ownership: Mapping.requiredOAuthRegistrationConstraints.ownership,
    },
    eligible: () => sql`true`,
  });

  const registrationServices = yield* Mapping.makeOAuthRegistrationServices(registration);
  const accountServices = yield* Mapping.makeOAuthAccountsServices(accounts);
  const services = yield* makeServices({ ...base, signIn });

  return services.pipe(
    Context.add(OAuth.OAuthRegistrationIntents, registrationIntents.oauthRegistrationIntents),
    Context.add(OAuth.OAuthAccountsPersistence, accountServices.oauthAccountsPersistence),
    Context.add(
      AppAuth.strategies.registration.registration.RegistrationAuthority,
      registrationServices.registrationAuthority,
    ),
  );
});

export const LifecycleStorageLive = Layer.effectContext(makeLifecycleStorage);
