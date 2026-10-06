import { AuthenticationClaims, authenticationNamespace } from "@gororobas/domain"
import { Auth, Email, Hooks, Schema as AuthSchema, Sessions } from "@yielded/auth"
import { AuthPersistence } from "@yielded/auth-persistence"
import { Effect, Layer, Record, String as EffectString } from "effect"

export const authenticationRequirement: Sessions.AuthenticationRequirement = {
  alternatives: [
    {
      factors: ["possession"],
      userVerified: false,
      phishingResistant: false,
      minimumCredentials: 1,
    },
  ],
  maximumAgeMillis: 5 * 60_000,
}

export const sessionConfiguration = Sessions.stateful({ maxAge: "30 days", idleTimeout: "7 days" })

// This descriptor selects the adapter's proof/session storage ports. Its email
// address operations are never installed in the public authentication service.
const StorageAuth = Auth.make(authenticationNamespace, {
  claims: AuthenticationClaims,
  sessions: sessionConfiguration,
  strategies: {
    email: Email.makeAddresses({
      addresses: { maximumEvidenceAgeMillis: 300_000, requireImmediateInvalidation: true },
    }),
  },
})

const Persistence = AuthPersistence.make(StorageAuth)

const authSubjects = AuthPersistence.table({
  name: "auth_subjects",
  columns: {
    id: { name: "id", type: "text" },
    active: { name: "active", type: "boolean" },
    securityRevision: { name: "security_revision", type: "text" },
  },
  unique: [["id"]],
})

const subjects = {
  table: authSubjects,
  id: "id",
  status: "active",
  activeValue: true,
  securityRevision: "securityRevision",
  idCodec: AuthSchema.SubjectId,
  requirements: () => Effect.succeed(authenticationRequirement),
}

const generated = Persistence.managed({ subjects, prefix: "auth" })

export const authStorage = Persistence.map({
  subjects,
  tables: Record.map(generated.schema, (table) =>
    AuthPersistence.table({
      name: EffectString.camelToSnake(table.name),
      columns: Record.fromEntries(
        Record.toEntries(table.columns).map(([key, column]) => [
          key,
          {
            ...column.options,
            name:
              key === "subjectId"
                ? "auth_subject_id"
                : EffectString.camelToSnake(column.options.name),
          },
        ]),
      ),
      unique: table.unique,
    }),
  ),
})

export const AuthStorageLive = Persistence.layer.pipe(
  Layer.provide(Persistence.Config.layer(authStorage)),
  Layer.provide(Hooks.LifecycleHooks.empty),
)
