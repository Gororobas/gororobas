import { it } from "@effect/vitest";
import * as OAuth from "@yielded/auth/OAuth";
import * as Password from "@yielded/auth/Password";
import * as Totp from "@yielded/auth/Totp";
import { layerCryptoWeb } from "@yielded/auth/WebCrypto";
import { Aead } from "@yielded/crypto/Aead";
import { Kdf } from "@yielded/crypto/Kdf";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import {
  Context,
  Crypto,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Redacted,
  Schema,
  Scope,
} from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import fixtures from "./crypto-fixtures";

const runtime = Layer.merge(
  layerCryptoWeb,
  Portable.layer(globalThis.crypto.subtle).pipe(Layer.provideMerge(KdfAdmission.layer())),
);

// At 5199d99, payload.ts seal borrowed keyring bytes before waiting for entropy;
// the Layer finalizer wiped them without joining seal. Gate this window because
// ordinary round-trip fixtures cannot force teardown during entropy acquisition.
it.effect("protector scope closure cancels and joins an active seal before wiping its keys", () =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const aead = yield* Aead;
    const entered = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const cleanup = yield* Deferred.make<void>();
    let interrupted = false;
    let encryptions = 0;
    const owner = yield* Scope.fork(yield* Effect.scope);

    const services = yield* Layer.buildWithScope(
      OAuth.OAuthTransactionProtector.layer({
        activeKeyId: "key1",
        keys: [{ id: "key1", material: Redacted.make(fixtures.oauth.key) }],
      }).pipe(
        Layer.provide(
          Layer.succeed(Crypto.Crypto, {
            ...crypto,
            randomBytes: (size) =>
              Deferred.succeed(entered, undefined).pipe(
                Effect.andThen(Deferred.await(finish)),
                Effect.andThen(crypto.randomBytes(size)),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    interrupted = true;
                  }),
                ),
                Effect.ensuring(Deferred.await(cleanup)),
              ),
          }),
        ),
        Layer.provide(
          Layer.succeed(Aead, {
            ...aead,
            encrypt: (input) =>
              Effect.suspend(() => {
                encryptions++;

                return aead.encrypt(input);
              }),
          }),
        ),
      ),
      owner,
    );

    const protector = Context.get(services, OAuth.OAuthTransactionProtector);

    const input = {
      context: yield* Schema.decodeEffect(OAuth.OAuthSignInTransactionContext)(
        fixtures.oauth.signIn.context,
      ),
      secrets: yield* Schema.decodeEffect(OAuth.OAuthTransactionSecrets)(
        fixtures.oauth.signIn.plain,
      ),
    };

    const sealing = yield* protector.seal(input).pipe(Effect.forkChild);

    yield* Deferred.await(entered);
    const closing = yield* Scope.close(owner, Exit.void).pipe(Effect.forkChild);

    yield* TestClock.adjust(1);
    const closeBeforeCleanup = closing.pollUnsafe();
    const cancelledDuringClose = interrupted;

    yield* Deferred.succeed(finish, undefined);
    yield* Deferred.succeed(cleanup, undefined);
    yield* Fiber.join(closing);
    const result = yield* Fiber.await(sealing);
    const late = yield* protector.seal(input).pipe(Effect.result);

    expect(closeBeforeCleanup).toBeUndefined();
    expect(cancelledDuringClose).toBe(true);
    expect(result._tag).toBe("Failure");
    expect(encryptions).toBe(0);
    expect(late).toMatchObject({ _tag: "Failure", failure: { _tag: "OAuthUnavailable" } });
  }).pipe(Effect.provide(runtime)),
);

// At 5199d99, totp/cryptography.ts checked Redacted.value(key).length before AEAD,
// turning an erased application key into a defect instead of TotpUnavailable.
it.effect("TOTP reports erased application keys as typed unavailability", () =>
  Effect.gen(function* () {
    const key = Redacted.make(new Uint8Array(32));

    Redacted.wipeUnsafe(key);

    const services = yield* Layer.build(
      Totp.TotpCryptography.layer.pipe(
        Layer.provide(
          Layer.succeed(Totp.TotpSecretKeys, {
            current: Effect.succeed({ keyId: "key1", key }),
            get: () => Effect.succeed(key),
          }),
        ),
      ),
    );

    const totp = Context.get(services, Totp.TotpCryptography);

    const binding = yield* Schema.decodeEffect(Totp.TotpSecretBinding)(fixtures.totp.binding);

    const envelope = yield* Schema.decodeEffect(Totp.TotpSecretEnvelope)(fixtures.totp.envelope);

    for (const operation of [
      totp.encryptSecret(binding, new Uint8Array(20)).pipe(Effect.asVoid),
      totp.decryptSecret(binding, envelope).pipe(Effect.asVoid),
    ]) {
      const result = yield* Effect.exit(operation);

      expect(
        Exit.isFailure(result) &&
          result.cause.reasons.every(
            (reason) => reason._tag === "Fail" && reason.error._tag === "TotpUnavailable",
          ),
      ).toBe(true);
    }
  }).pipe(Effect.provide(runtime)),
);

// At 5199d99, hashing.ts verify unwrapped its verifier before returning an Effect;
// passwordBytes also unwrapped erased passwords outside a typed error boundary.
it.effect("password operations defer secret access and return typed erased-secret failures", () =>
  Effect.gen(function* () {
    const hashing = yield* Password.PasswordHashing;
    const password = Redacted.make("password");
    const verifier = Redacted.make(Password.EncodedPasswordHash.make(fixtures.password.phc));

    Redacted.wipeUnsafe(password);
    Redacted.wipeUnsafe(verifier);
    const verify = hashing.verify(Redacted.make("password"), verifier);
    const checked = yield* Effect.exit(verify);

    expect(
      Exit.isFailure(checked) &&
        checked.cause.reasons.every(
          (reason) => reason._tag === "Fail" && reason.error._tag === "PasswordVerifierInvalid",
        ),
    ).toBe(true);
    for (const operation of [
      hashing.hash(password),
      hashing.dummy(password),
      hashing.verify(
        password,
        Redacted.make(Password.EncodedPasswordHash.make(fixtures.password.phc)),
      ),
    ]) {
      const result = yield* Effect.exit(operation);

      expect(
        Exit.isFailure(result) &&
          result.cause.reasons.every(
            (reason) =>
              reason._tag === "Fail" && reason.error._tag === "PasswordHashingUnavailable",
          ),
      ).toBe(true);
    }
  }).pipe(Effect.provide(Password.PasswordHashing.layer().pipe(Layer.provide(runtime)))),
);

// At 5199d99, hashing.ts hash acquired derived output in acquireUseRelease's
// masked acquisition. A cancellable Kdf isolates Auth's ownership of this wait;
// verify/dummy exercise the same scoped buffer contract. Native backend completion
// guarantees are covered by packages/crypto/test/lifetime.test.ts.
for (const method of ["hash", "verify", "dummy"] as const) {
  it.effect(`password ${method} allows KDF cancellation and wipes its password buffer`, () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      let bytes: Uint8Array | undefined;
      let cancelled = false;
      const output = new Uint8Array(32).fill(17);

      const derive: Kdf["Service"]["argon2id"] = (input) =>
        Effect.suspend(() => {
          bytes = Redacted.value(input.password);

          return Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(finish)),
            Effect.as(Redacted.make(output)),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                cancelled = true;
              }),
            ),
          );
        });

      const services = yield* Layer.build(
        Password.PasswordHashing.layer().pipe(
          Layer.provide(Layer.succeed(KdfAdmission.KdfAdmission, { run: (work) => work })),
          Layer.provide(
            Layer.succeed(Kdf, {
              argon2id: derive,
              scrypt: () => Effect.die("unused"),
              pbkdf2: () => Effect.die("unused"),
              hkdf: () => Effect.die("unused"),
            }),
          ),
        ),
      );

      const hashing = Context.get(services, Password.PasswordHashing);
      const password = Redacted.make("password");

      const operation =
        method === "verify"
          ? hashing.verify(
              password,
              Redacted.make(Password.EncodedPasswordHash.make(fixtures.password.phc)),
            )
          : hashing[method](password);

      const worker = yield* operation.pipe(Effect.forkChild);

      yield* Deferred.await(entered);
      const interruption = yield* Fiber.interrupt(worker).pipe(Effect.forkChild);

      yield* TestClock.adjust(1);
      const cancelledBeforeCompletion = cancelled;

      yield* Deferred.succeed(finish, undefined);
      yield* Fiber.join(interruption);
      expect(cancelledBeforeCompletion).toBe(true);
      expect(bytes).toBeDefined();
      expect(bytes?.every((byte) => byte === 0)).toBe(true);
      yield* operation;
      expect(output.every((byte) => byte === 0)).toBe(true);
    }).pipe(Effect.provide(layerCryptoWeb)),
  );
}
