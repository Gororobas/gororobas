import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { Auth, Proofs, WebCrypto } from "@yielded/auth";
import { Config, Context, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

class AppData extends Context.Service<AppData, string>()("customers/AppData") {}

const DataLive = Layer.effect(
  AppData,
  Effect.gen(function* () {
    const directory = yield* Config.String("AUTH_DATA_DIR").pipe(
      Config.withDefault(new URL("../.data/", import.meta.url).pathname),
    );

    const fs = yield* FileSystem.FileSystem;

    yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });

    return directory;
  }),
);

export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* AppData;
    const path = yield* Path.Path;

    return SqliteClient.layer({ filename: path.join(directory, "auth.sqlite") });
  }),
).pipe(Layer.provide(DataLive));

const Keys = Schema.fromJsonString(
  Schema.Struct({
    proof: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/))),
    binding: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/))),
  }),
);

class InvalidKeys extends Schema.TaggedError<InvalidKeys>()("InvalidKeys", {}) {}

export const KeysLive = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* AppData;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const filename = path.join(directory, "keys.json");

    if (!(yield* fs.exists(filename))) {
      const keys = {
        proof: Redacted.make(Base64Url.encode(yield* crypto.randomBytes(32))),
        binding: Redacted.make(Base64Url.encode(yield* crypto.randomBytes(32))),
      };

      yield* fs
        .writeFileString(filename, yield* Schema.encodeEffect(Keys)(keys), {
          flag: "wx",
          mode: 0o600,
        })
        .pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "AlreadyExists" ? Effect.void : Effect.fail(error),
          ),
        );
    }

    const keys = yield* Schema.decodeEffect(Keys)(yield* fs.readFileString(filename)).pipe(
      Effect.mapError(() => InvalidKeys.make({})),
    );

    return Layer.mergeAll(
      Proofs.ProofKeys.layer({ activeKeyId: "v1", keys: [{ id: "v1", material: keys.proof }] }),
      Auth.RequestBindingConfig.layer({
        keyring: { activeKeyId: "v1", keys: [{ id: "v1", material: keys.binding }] },
        lifetimeMillis: 300_000,
        generation: 1,
      }),
    );
  }),
).pipe(Layer.provide(DataLive), Layer.provide(WebCrypto.layerWebCrypto));
