import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-node";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import { expect } from "vite-plus/test";

import * as SqliteNode from "../src/SqliteNode";
import { mapping, migrate } from "./fixtures/totp-sqlite-consumer";

// Human-requested regression: explicit Drizzle acquisition must reject migration
// drift before a workflow can run; the previous matching-DDL fixture cannot prove it.
it.effect(
  "rejects a declared key missing from the captured database before acquisition or coordination",
  () =>
    Effect.gen(function* () {
      const client = yield* SqlClient;

      yield* migrate;
      yield* client`drop table totp_example_factors`;
      yield* client`create table totp_example_factors (scope text, state text not null, version text not null)`;
      const database = yield* makeWithDefaults({});

      const acquire = SqliteNode.makeTotpPersistenceServices(mapping).pipe(
        Effect.provideService(SqliteNode.Database, database),
      );

      let entered = false;

      const coordinate = SqliteNode.coordinateTotpPersistence(
        Effect.succeed(database),
        { mapping },
        Effect.sync(() => {
          entered = true;
        }),
      );

      const rejected = yield* acquire.pipe(
        Effect.as("accepted"),
        Effect.catchTag("TotpConfigurationError", () => Effect.succeed("rejected")),
      );

      const rejectedOwner = yield* coordinate.pipe(
        Effect.as("accepted"),
        Effect.catchTag("TotpConfigurationError", () => Effect.succeed("rejected")),
      );

      expect(rejected).toBe("rejected");
      expect(rejectedOwner).toBe("rejected");
      expect(entered).toBe(false);
      yield* client`create unique index totp_factor_scope on totp_example_factors (scope)`;
      yield* acquire.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" })));
      yield* coordinate;
      expect(entered).toBe(true);
    }).pipe(
      Effect.provide(
        Layer.merge(
          SqliteClient.layer({ filename: ":memory:" }),
          Layer.succeed(LifecycleHooks, {
            before: () => Effect.void,
            after: () => Effect.succeed([]),
          }),
        ),
      ),
    ),
);
