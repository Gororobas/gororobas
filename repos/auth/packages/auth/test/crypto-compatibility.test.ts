import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { it } from "@effect/vitest";
import * as OAuth from "@yielded/auth/OAuth";
import * as Password from "@yielded/auth/Password";
import { KdfAdmission } from "@yielded/auth/Password";
import * as Totp from "@yielded/auth/Totp";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { expect } from "vite-plus/test";

import fixtures from "./crypto-fixtures";

const admission = KdfAdmission.layer({ maxQueued: 0 });
const runtime = Layer.merge(NodeCrypto.layer, admission);

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

// Requested policy migration: Effect-valued entropy operations must remain fresh
// on every execution, including when a caller retains the same Effect value.
it.effect("keeps TOTP entropy lazy and fresh on every execution", () =>
  Effect.gen(function* () {
    const crypto = yield* SecureRandom.SecureRandom;
    let requests = 0;

    const services = yield* Layer.build(
      Totp.TotpCryptography.layer.pipe(
        Layer.provide(
          Layer.succeed(SecureRandom.SecureRandom, {
            ...crypto,
            randomBytes: (size) => Effect.sync(() => new Uint8Array(size).fill(++requests)),
          }),
        ),
      ),
    );

    const cryptography = Context.get(services, Totp.TotpCryptography);
    const identifier = cryptography.randomId;
    const secret = cryptography.generateSecret;

    expect(requests).toBe(0);
    const firstId = yield* identifier;
    const secondId = yield* identifier;
    const firstSecret = yield* secret;
    const secondSecret = yield* secret;

    expect(requests).toBe(4);
    expect(firstId).not.toBe(secondId);
    expect(firstSecret).toEqual(new Uint8Array(20).fill(3));
    expect(secondSecret).toEqual(new Uint8Array(20).fill(4));
  }).pipe(Effect.provide(Layer.merge(keys, runtime))),
);

it.effect("opens stored TOTP secrets and retains recovery and RFC 6238 formats", () =>
  Effect.gen(function* () {
    const cryptography = yield* Totp.TotpCryptography;

    const binding = yield* Schema.decodeEffect(Totp.TotpSecretBinding)(fixtures.totp.binding).pipe(
      Effect.orDie,
    );

    const envelope = yield* Schema.decodeEffect(Totp.TotpSecretEnvelope)(
      fixtures.totp.envelope,
    ).pipe(Effect.orDie);

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

    const context = yield* Schema.decodeEffect(OAuth.OAuthSignInTransactionContext)(a.context).pipe(
      Effect.orDie,
    );

    const sealed = yield* Schema.decodeEffect(OAuth.OAuthSealedTransaction)(a.sealed).pipe(
      Effect.orDie,
    );

    expect(
      yield* Schema.encodeEffect(OAuth.OAuthTransactionSecrets)(
        yield* signIn.open({ context, sealed }),
      ).pipe(Effect.orDie),
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
      yield* Schema.encodeEffect(OAuth.OAuthTransactionSecrets)(
        yield* link.open({
          context: yield* Schema.decodeEffect(OAuth.OAuthLinkTransactionContext)(b.context).pipe(
            Effect.orDie,
          ),
          sealed: yield* Schema.decodeEffect(OAuth.OAuthSealedTransaction)(b.sealed).pipe(
            Effect.orDie,
          ),
        }),
      ).pipe(Effect.orDie),
    ).toEqual(b.plain);
    expect(
      yield* Schema.encodeEffect(OAuth.OAuthTransactionSecrets)(
        yield* connected.open({
          context: yield* Schema.decodeEffect(OAuth.OAuthConnectedTransactionContext)(
            c.context,
          ).pipe(Effect.orDie),
          sealed: yield* Schema.decodeEffect(OAuth.OAuthSealedTransaction)(c.sealed).pipe(
            Effect.orDie,
          ),
        }),
      ).pipe(Effect.orDie),
    ).toEqual(c.plain);
    expect(
      yield* Schema.encodeEffect(OAuth.OAuthConnectedTokenMaterial)(
        yield* token.open({
          context: yield* Schema.decodeEffect(OAuth.OAuthConnectedTokenContext)(d.context).pipe(
            Effect.orDie,
          ),
          sealed: yield* Schema.decodeEffect(OAuth.OAuthConnectedSealedTokens)(d.sealed).pipe(
            Effect.orDie,
          ),
        }),
      ).pipe(Effect.orDie),
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
