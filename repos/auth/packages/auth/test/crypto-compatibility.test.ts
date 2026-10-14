import { it } from "@effect/vitest";
import * as OAuth from "@yielded/auth/OAuth";
import * as Password from "@yielded/auth/Password";
import * as Totp from "@yielded/auth/Totp";
import { layerCryptoWeb } from "@yielded/auth/WebCrypto";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Effect, Layer, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { expect } from "vite-plus/test";

import fixtures from "./crypto-fixtures";

const admission = KdfAdmission.layer({ maxQueued: 0 });
const backend = Portable.layer(globalThis.crypto.subtle).pipe(Layer.provideMerge(admission));
const runtime = Layer.merge(backend, layerCryptoWeb);

it.effect(
  "verifies stored PHC and PBKDF2 without normalizing password bytes or nesting admission",
  () =>
    Effect.gen(function* () {
      const hashing = yield* Password.PasswordHashing;

      for (const encoded of [fixtures.password.phc, fixtures.password.pbkdf2]) {
        const verifier = Redacted.make(Password.EncodedPasswordHash.make(encoded));

        expect(yield* hashing.verify(Redacted.make(fixtures.password.password), verifier)).toEqual({
          matches: true,
          needsRehash: true,
        });
        expect(
          yield* hashing.verify(
            Redacted.make(fixtures.password.password.normalize("NFC")),
            verifier,
          ),
        ).toEqual({ matches: false, needsRehash: false });
      }

      const invalid = yield* hashing
        .verify(
          Redacted.make("x"),
          Redacted.make(
            Password.EncodedPasswordHash.make(fixtures.password.phc.replace("m=32", "m=65537")),
          ),
        )
        .pipe(Effect.result);

      expect(invalid).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PasswordVerifierInvalid", reason: "work-limit" },
      });
    }).pipe(Effect.provide(Password.PasswordHashing.layer().pipe(Layer.provide(runtime)))),
);

const key = Redacted.make(Schema.decodeSync(Schema.Uint8ArrayFromBase64Url)(fixtures.totp.key));

const keys = Layer.succeed(Totp.TotpSecretKeys, {
  current: Effect.succeed({ keyId: "key1", key }),
  get: () => Effect.succeed(key),
});

it.effect("opens stored TOTP secrets and retains recovery and RFC 6238 formats", () =>
  Effect.gen(function* () {
    const cryptography = yield* Totp.TotpCryptography;
    const binding = Schema.decodeSync(Totp.TotpSecretBinding)(fixtures.totp.binding);
    const envelope = Schema.decodeSync(Totp.TotpSecretEnvelope)(fixtures.totp.envelope);
    const secret = yield* cryptography.decryptSecret(binding, envelope);

    expect(Base64Url.encode(secret)).toBe(fixtures.totp.secret);
    expect(yield* cryptography.matchCode(secret, "287082", 59000, 0)).toBe(1);
    expect(yield* cryptography.recoveryDigest("totp", "subject", fixtures.totp.recovery)).toBe(
      fixtures.totp.digest,
    );
    expect(
      yield* cryptography
        .decryptSecret({ ...binding, credentialId: "other" }, envelope)
        .pipe(Effect.result),
    ).toMatchObject({ _tag: "Failure", failure: { _tag: "TotpUnavailable" } });
    const codes = yield* cryptography.newRecoveryCodes("totp", "subject");

    expect(codes.codes).toHaveLength(10);
    expect(
      codes.codes.every((code) =>
        /^rc1-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(code),
      ),
    ).toBe(true);
  }).pipe(
    Effect.provide(Totp.TotpCryptography.layer.pipe(Layer.provide(Layer.merge(keys, runtime)))),
  ),
);

const keyring = {
  activeKeyId: "key1",
  keys: [{ id: "key1", material: Redacted.make(fixtures.oauth.key) }],
};

// https://github.com/yielded-dev/auth/issues/200: unsupported OAuth encryption
// must fail at construction, before a request can collapse it to OAuthUnavailable.
it.effect("rejects an AEAD backend without XChaCha at protector construction", () =>
  Effect.gen(function* () {
    const result = yield* OAuth.OAuthTransactionProtector.layer(keyring).pipe(
      Layer.build,
      Effect.provide(
        Layer.merge(
          layerCryptoWeb,
          WebCrypto.layer(globalThis.crypto.subtle).pipe(Layer.provide(admission)),
        ),
      ),
      Effect.result,
    );

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "OAuthConfigurationError",
        reason: "crypto",
        message: expect.stringContaining("XChaCha20-Poly1305"),
      },
    });
  }),
);

it.effect("opens all stored OAuth envelope domains and rejects changed durable authority", () =>
  Effect.gen(function* () {
    const signIn = yield* OAuth.OAuthTransactionProtector;
    const link = yield* OAuth.OAuthLinkTransactionProtector;
    const connected = yield* OAuth.OAuthConnectedTransactionProtector;
    const token = yield* OAuth.OAuthConnectedTokenProtector;

    const a = fixtures.oauth.signIn,
      b = fixtures.oauth.link,
      c = fixtures.oauth.connected,
      d = fixtures.oauth.token;

    const context = Schema.decodeSync(OAuth.OAuthSignInTransactionContext)(a.context);
    const sealed = Schema.decodeSync(OAuth.OAuthSealedTransaction)(a.sealed);

    expect(
      Schema.encodeSync(OAuth.OAuthTransactionSecrets)(yield* signIn.open({ context, sealed })),
    ).toEqual(a.plain);
    expect(
      yield* signIn
        .open({
          context: { ...context, flowId: OAuth.OAuthSignInBegin.fields.flowId.make("other") },
          sealed,
        })
        .pipe(Effect.result),
    ).toMatchObject({ _tag: "Failure", failure: { _tag: "OAuthUnavailable" } });
    expect(
      Schema.encodeSync(OAuth.OAuthTransactionSecrets)(
        yield* link.open({
          context: Schema.decodeSync(OAuth.OAuthLinkTransactionContext)(b.context),
          sealed: Schema.decodeSync(OAuth.OAuthSealedTransaction)(b.sealed),
        }),
      ),
    ).toEqual(b.plain);
    expect(
      Schema.encodeSync(OAuth.OAuthTransactionSecrets)(
        yield* connected.open({
          context: Schema.decodeSync(OAuth.OAuthConnectedTransactionContext)(c.context),
          sealed: Schema.decodeSync(OAuth.OAuthSealedTransaction)(c.sealed),
        }),
      ),
    ).toEqual(c.plain);
    expect(
      Schema.encodeSync(OAuth.OAuthConnectedTokenMaterial)(
        yield* token.open({
          context: Schema.decodeSync(OAuth.OAuthConnectedTokenContext)(d.context),
          sealed: Schema.decodeSync(OAuth.OAuthConnectedSealedTokens)(d.sealed),
        }),
      ),
    ).toEqual(d.plain);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        OAuth.OAuthTransactionProtector.layer(keyring),
        OAuth.OAuthLinkTransactionProtector.layer(keyring),
        OAuth.OAuthConnectedTransactionProtector.layer(keyring),
        OAuth.OAuthConnectedTokenProtector.layer(keyring),
      ).pipe(Layer.provide(runtime)),
    ),
  ),
);
