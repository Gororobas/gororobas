import { BunRuntime } from "@effect/platform-bun";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { TotpPersistence, TotpSecretKeys } from "@yielded/auth/Totp";
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
  Effect.provideService(TotpSecretKeys, exampleKeys),
  Effect.provide(Layer.mergeAll(LifecycleHooks.empty, DatabaseLive)),
  Effect.scoped,
  BunRuntime.runMain,
);
