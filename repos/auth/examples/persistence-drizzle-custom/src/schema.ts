import { Schema as AuthSchema } from "@yielded/auth";
import { AuthPersistence } from "@yielded/auth-persistence-drizzle/SqliteBun";
import { Effect } from "effect";

import {
  AppAuth,
  requirement,
  recoveryRequirement,
  sessionRequirement,
} from "../../shared/account/auth";
import * as passkeys from "./passkey-tables";
import * as tables from "./tables";
export { customers } from "./tables";

export const Persistence = AuthPersistence.make(AppAuth);

export const storage = Persistence.map({
  subjects: {
    table: tables.customers,
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
  tables: {
    identifiers: tables.identifiers,
    credentials: tables.credentials,
    passwords: tables.passwords,
    emailCredentials: tables.emailCredentials,
    proofs: tables.proofs,
    sessions: tables.sessions,
    pending: tables.pending,
    ...passkeys,
  },
});

export const authSchema = storage.schema;
