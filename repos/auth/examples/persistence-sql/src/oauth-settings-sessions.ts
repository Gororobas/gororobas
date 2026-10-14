import { Schema as AuthSchema, Sessions } from "@yielded/auth";
import * as Adapter from "@yielded/auth-persistence/Adapter";
import * as Mapping from "@yielded/auth-persistence/OAuthPersistence";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { requirement, subject } from "../../shared/oauth/storage";
import { SettingsAuth } from "./oauth-settings-auth";

const tombstones = Mapping.table({
  name: "oauth_settings_revocation",
  columns: {
    moduleId: { name: "module_id", type: "text" },
    subjectId: { name: "subject_id", type: "text" },
    sessionId: { name: "session_id", type: "text" },
    absoluteExpiresAt: { name: "expires_at", type: "integer" },
  },
  unique: [["moduleId", "subjectId", "sessionId"]],
});

const decodeInstant = (value: unknown) =>
  Schema.decodeUnknownEffect(Schema.DateTimeUtcFromMillis)(
    typeof value === "bigint" ? Number(value) : value,
  ).pipe(
    Effect.mapError((cause) =>
      Adapter.PersistenceMappingError.make({ operation: "decode", cause }),
    ),
  );

/** Signed sessions check the same SQL subject revision that unlink advances. */
export const SettingsSessionsLive = Layer.effect(
  SettingsAuth.sessions.SignedSessionValidity,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`CREATE TABLE IF NOT EXISTS oauth_settings_revocation (
      module_id TEXT NOT NULL, subject_id TEXT NOT NULL, session_id TEXT NOT NULL,
      expires_at BIGINT NOT NULL, UNIQUE(module_id, subject_id, session_id))`;

    const validity = yield* Adapter.makeNativeSignedSessionValidityServices(
      Adapter.makeNativeSqlTables(sql),
      {
        moduleId: SettingsAuth.sessions.moduleId,
        clock: {
          engineNowMillis: Mapping.clock.engineNowMillis,
          encodeInstant: (value) => value,
          decodeInstant: (value) =>
            Schema.decodeUnknownSync(Schema.Int)(typeof value === "bigint" ? Number(value) : value),
          toMillis: (value) => value,
          fromMillis: (value) => value,
        },
        subject: {
          ...subject,
          activeStatusValue: "active",
          decodeRequirement: () => Effect.succeed(requirement),
          nextSecurityRevision: (value) =>
            Effect.succeed(
              Sessions.SecurityRevision.make(
                value === "initial" ? "1" : String(BigInt(value) + 1n),
              ),
            ),
        },
        subjectId: {
          toNative: Effect.succeed,
          toSubject: (value) =>
            Schema.decodeUnknownEffect(AuthSchema.SubjectId)(value).pipe(
              Effect.mapError((cause) =>
                Adapter.PersistenceMappingError.make({ operation: "decode", cause }),
              ),
            ),
          equals: (left, right) => left === right,
        },
        sessionId: {
          toNative: Effect.succeed,
          toSession: (value) =>
            Schema.decodeUnknownEffect(Sessions.SessionId)(value).pipe(
              Effect.mapError((cause) =>
                Adapter.PersistenceMappingError.make({ operation: "decode", cause }),
              ),
            ),
          equals: (left, right) => left === right,
        },
        tombstone: {
          table: tombstones,
          moduleId: "moduleId",
          subjectId: "subjectId",
          sessionId: "sessionId",
          absoluteExpiresAt: "absoluteExpiresAt",
          encodeInstant: DateTime.toEpochMillis,
          decodeInstant,
          encodeInsert: (input) => ({
            ...input,
            absoluteExpiresAt: DateTime.toEpochMillis(input.absoluteExpiresAt),
          }),
        },
        isConstraintConflict: () => false,
        constraints: Adapter.requiredSignedValidityConstraints,
      },
    ).pipe(Effect.provideService(Adapter.SqlBatchCommit, undefined));

    return validity.signedSessionValidity;
  }),
);
