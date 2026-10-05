import { Schema as AuthSchema } from "@yielded/auth";
import { AuthPersistence } from "@yielded/auth-persistence-drizzle/SqliteBun";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";

import {
  AppAuth,
  requirement,
  recoveryRequirement,
  sessionRequirement,
} from "../../shared/account/auth";

// Existing application table. The application owns its schema and customer IDs.
export const customers = sqliteTable("customers", {
  id: text("customer_key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  securityRevision: text("auth_revision").notNull(),
  displayName: text("display_name").notNull(),
});

export const Persistence = AuthPersistence.make(AppAuth);

export const storage = Persistence.managed({
  subjects: {
    table: customers,
    id: "id",
    status: "enabled",
    activeValue: true,
    securityRevision: "securityRevision",
    idCodec: AuthSchema.SubjectId,
    requirements: () => Effect.succeed(requirement),
    actionRequirements: (_row, action) =>
      Effect.succeed(
        action === "reset-password"
          ? recoveryRequirement
          : action === "verify-address"
            ? sessionRequirement
            : requirement,
      ),
  },
  prefix: "customer_auth",
});

// Pure Drizzle tables are available to queries and schema tooling before startup.
export const authSchema = storage.schema;

// Drizzle Kit discovers table exports; these are the managed tables above.
export const {
  identifiers,
  credentials,
  passwords,
  passwordAttempts,
  passwordScopes,
  passwordCharges,
  passwordCommands,
  proofRequests,
  proofSeries,
  proofGenerations,
  proofContinuations,
  proofScopes,
  proofAbuse,
  proofFailures,
  proofCommands,
  sessions,
  sessionFlows,
  passwordRegistrations,
  emailCredentials,
  emailCommands,
  passkeyCredentials,
  passkeyOwnership,
  passkeyHandles,
  passkeyModules,
  passkeyFlows,
  passkeyAdmissions,
  passkeyCharges,
  passkeyCommands,
} = authSchema;
