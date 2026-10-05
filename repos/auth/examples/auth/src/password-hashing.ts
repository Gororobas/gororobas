import { BunRuntime } from "@effect/platform-bun";
import { Password, WebCrypto } from "@yielded/auth";
import * as PasswordCrypto from "@yielded/auth-crypto/Password";
import { Effect, Layer, Redacted } from "effect";

// Disposable tiny corpus demonstrates explicit offline screening. A production
// consumer supplies a maintained compromised/common-password corpus or service.
const fixtureScreening = Layer.succeed(
  Password.CompromisedPasswords,
  Password.CompromisedPasswords.of({
    check: (password) =>
      Effect.succeed(
        Redacted.value(password) === "a commonly guessed password"
          ? { _tag: "Rejected", reason: "common" }
          : { _tag: "Allowed" },
      ),
  }),
);

const hashing = PasswordCrypto.layer().pipe(
  Layer.provide(Password.PasswordKdfAdmission.layer()),
  Layer.provide(WebCrypto.layerWebCrypto),
);

const check = Password.NewPasswordCheck.layer().pipe(Layer.provide(fixtureScreening));

const program = Effect.gen(function* () {
  const policy = yield* Password.NewPasswordCheck;
  const hasher = yield* Password.PasswordHashing;
  const checked = yield* policy.check(Redacted.make("A manager-pasted cafe\u0301 passphrase 🐈"));
  const hash = yield* hasher.hash(checked.password);
  const current = yield* hasher.verify(checked.password, hash);
  const wrong = yield* hasher.verify(Redacted.make("different password"), hash);

  if (!current.matches || current.needsRehash || wrong.matches)
    return yield* Effect.die("password example verification failed");

  // Store checked.normalization WITH the hash. Login applies that stored mode;
  // the standard PHC encoding deliberately does not imply text normalization.
  const rejected = yield* policy
    .check(Redacted.make("a commonly guessed password"))
    .pipe(Effect.result);

  if (rejected._tag !== "Failure")
    return yield* Effect.die("explicit screening did not reject fixture");
  const legacyPassword = Redacted.make("legacy e\u0301 password\0 with spaces ");

  for (const [iterations, digest] of [
    [100000, "zF3A2fy3Z66tq-RQz-2hpwtDlA-M52eKum5xT-SBlXw"],
    [600000, "8rp-OojAe9742ABihV-abZQQ-Bn3zVuHHLU5bUAaMO8"],
  ] as const) {
    // Fixed public migration fixture, independently derived with Python hashlib.
    const legacy = Redacted.make(
      Password.EncodedPasswordHash.make(
        `pbkdf2-sha256$${iterations}$cHVibGljLXNhbHQtMTIzNA$${digest}`,
      ),
    );

    const verified = yield* hasher.verify(legacyPassword, legacy);

    if (!verified.matches || !verified.needsRehash)
      return yield* Effect.die("legacy migration verification failed");
  }
  yield* hasher.dummy(Redacted.make("unknown actor fixture password"));
  yield* Effect.log(
    `Argon2id verified; wrong password rejected; ${checked.normalization} provenance retained; screening and cold dummy work completed`,
  );
});

BunRuntime.runMain(program.pipe(Effect.provide(Layer.mergeAll(hashing, check))));
