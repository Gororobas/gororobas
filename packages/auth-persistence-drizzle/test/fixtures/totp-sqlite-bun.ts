import { BunCrypto, BunRuntime } from "@effect/platform-bun";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { TotpPersistence, TotpSecretKeys, TotpCryptography } from "@yielded/auth/Totp";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import { Effect, Layer } from "effect";

import * as SqliteBun from "../../src/SqliteBun";
import { exampleKeys, mapping, migrate, useAuthenticator } from "./totp-sqlite-consumer";

const DatabaseLive = SqliteBun.databaseLayer.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

Effect.gen(function* () {
  yield* migrate;

  const services = yield* SqliteBun.makeTotpPersistenceServices(mapping);

  const result = yield* useAuthenticator.pipe(
    Effect.provideService(TotpPersistence, services.totpPersistence),
  );

  yield* Effect.log(result);
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      TotpCryptography.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(TotpSecretKeys, exampleKeys),
            BunCrypto.layer,
            Portable.layer(globalThis.crypto.subtle).pipe(Layer.provide(KdfAdmission.layer())),
          ),
        ),
      ),
      BunCrypto.layer,
      LifecycleHooks.empty,
      DatabaseLive,
    ),
  ),
  Effect.scoped,
  BunRuntime.runMain,
);
