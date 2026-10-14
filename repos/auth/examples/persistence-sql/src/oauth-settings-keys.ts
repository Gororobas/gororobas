import { Auth, OAuth, Sessions } from "@yielded/auth";
import { Config, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

const material = Schema.RedactedFromValue(
  Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
);

export const SettingsKeyMaterial = Schema.fromJsonString(
  Schema.Struct({ session: material, transaction: material, binding: material }),
);

export const settingsKeysLayer = (keys: typeof SettingsKeyMaterial.Type) => {
  const keyring = (key: Redacted.Redacted<string>) => ({
    activeKeyId: "v1",
    keys: [{ id: "v1", material: key }],
  });

  return Layer.mergeAll(
    Layer.succeed(Sessions.SessionSigningKeys, keyring(keys.session)),
    OAuth.OAuthTransactionProtector.layer(keyring(keys.transaction)),
    OAuth.OAuthLinkTransactionProtector.layer(keyring(keys.transaction)),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: keyring(keys.binding),
    }),
  );
};

export const SettingsKeysLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const directory = yield* Config.String("AUTH_DATA_DIR").pipe(
      Config.withDefault(new URL("../.data/", import.meta.url).pathname),
    );

    yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, "oauth-settings-keys.json");

    if (!(yield* fs.exists(filename))) {
      const random = crypto
        .randomBytes(32)
        .pipe(Effect.map((bytes) => Redacted.make(Base64Url.encode(bytes))));

      const keys = { session: yield* random, transaction: yield* random, binding: yield* random };

      yield* fs
        .writeFileString(filename, yield* Schema.encodeEffect(SettingsKeyMaterial)(keys), {
          flag: "wx",
          mode: 0o600,
        })
        .pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "AlreadyExists" ? Effect.void : Effect.fail(error),
          ),
        );
    }

    return settingsKeysLayer(
      yield* Schema.decodeEffect(SettingsKeyMaterial)(yield* fs.readFileString(filename), {
        reportInput: false,
      }),
    );
  }),
);
