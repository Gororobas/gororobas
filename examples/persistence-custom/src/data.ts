import { Auth, Proofs, WebCrypto } from "@yielded/auth";
import { Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { DataDirectory } from "./store";

const Keys = Schema.fromJsonString(
  Schema.Struct({
    proof: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/))),
    binding: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/))),
  }),
);

class InvalidKeys extends Schema.TaggedError<InvalidKeys>()("InvalidKeys", {}) {}

export const KeysLive = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* DataDirectory;
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
).pipe(Layer.provide(DataDirectory.layer), Layer.provide(WebCrypto.layerWebCrypto));
