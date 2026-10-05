import { BunRuntime, BunServices } from "@effect/platform-bun";
import { AuthPersistence } from "@yielded/auth-persistence-drizzle/SqliteBun";
import { Effect, Layer } from "effect";

import { DatabaseLive } from "./data";

export const MigrationsLive = AuthPersistence.migrationsLayer({
  migrationsFolder: new URL("../drizzle/", import.meta.url).pathname,
});

if (import.meta.main)
  BunRuntime.runMain(
    Layer.build(
      MigrationsLive.pipe(Layer.provide(DatabaseLive), Layer.provide(BunServices.layer)),
    ).pipe(Effect.scoped, Effect.asVoid),
  );
