import { Auth, Sessions } from "@yielded/auth";
import { AuthPersistence } from "@yielded/auth-persistence";
import { SubjectId } from "@yielded/auth/Schema";
import { Password } from "@yielded/auth/strategies";
import { Effect, Schema } from "effect";

const App = Auth.make("raw-consumer", {
  claims: Schema.Struct({}),
  strategies: { password: Password.make() },
  sessions: Sessions.stateful(),
});

const subjects = AuthPersistence.table({
  name: "customers",
  columns: {
    id: { name: "id", type: "text" },
    active: { name: "active", type: "boolean" },
    revision: { name: "revision", type: "text" },
  },
  unique: [["id"]],
});

export const Persistence = AuthPersistence.make(App);

export const storage = Persistence.managed({
  subjects: {
    table: subjects,
    id: "id",
    status: "active",
    activeValue: true,
    securityRevision: "revision",
    idCodec: SubjectId,
    requirements: () =>
      Effect.succeed({
        alternatives: [
          {
            factors: ["knowledge"],
            minimumCredentials: 1,
            userVerified: false,
            phishingResistant: false,
          },
        ],
        maximumAgeMillis: 60_000,
      }),
  },
});

export const passwordTable = storage.schema.passwords;
// @ts-expect-error A password-only definition does not allocate phone/proof storage.
storage.schema.proofRequests;
