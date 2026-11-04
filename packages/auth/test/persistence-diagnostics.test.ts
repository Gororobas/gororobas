import { it } from "@effect/vitest";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Logger from "effect/Logger";
import * as SqlError from "effect/sql/SqlError";
import { expect } from "vite-plus/test";

// Regression in 525916648e47ad1807aef1adba58783e525b6d33: SQL failures lose
// their category at the public reporter. Live auth cannot force mixed causes
// with private metadata or verify the unchanged original error identities.
it.effect("retains SQL diagnostics without exposing private values or changing a mixed cause", () =>
  Effect.gen(function* () {
    const expected = { _tag: "ExpectedRejection", message: "private-expected" } as const;

    const connection = SqlError.SqlError.make({
      reason: SqlError.ConnectionError.make({
        cause: { code: "ECONNRESET", message: "private-driver", query: "private-query" },
        message: "private-message",
        operation: "private-operation",
      }),
    });

    const authentication = SqlError.SqlError.make({
      reason: SqlError.AuthenticationError.make({ cause: { code: "private-code" } }),
    });

    const hostile = {
      "~effect/sql/SqlError": "~effect/sql/SqlError",
      get reason(): never {
        throw new Error("private-getter");
      },
    };

    const hostilePrototype = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("private-prototype");
        },
      },
    );

    const annotation = Context.Service<string>("private-annotation");

    const original = Cause.fromReasons<typeof expected | SqlError.SqlError>([
      Cause.makeFailReason(expected),
      Cause.makeFailReason(connection).annotate(Context.make(annotation, "private-value")),
      Cause.makeDieReason(authentication),
      Cause.makeDieReason(hostile),
      Cause.makeDieReason(hostilePrototype),
      Cause.makeInterruptReason(123),
    ]);

    const reported: Array<Cause.Cause<unknown>> = [];
    const formatted: Array<string> = [];

    const logging = Logger.layer([
      Logger.make((entry) => {
        reported.push(entry.cause);
        formatted.push(JSON.stringify(Logger.formatStructured.log(entry)));
      }),
    ]);

    const run = <E>(cause: Cause.Cause<E>) =>
      reportPersistenceFailure(Effect.failCause(cause), (error) => error === expected);

    const result = yield* Effect.exit(run(original).pipe(Effect.provide(logging)));

    expect(Exit.isFailure(result) && result.cause).toEqual(original);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.reasons).toMatchObject([
      { _tag: "Fail", error: { reason: "ConnectionError", code: "ECONNRESET" } },
      { _tag: "Die", defect: { reason: "AuthenticationError" } },
      { _tag: "Die", defect: { message: "Auth auth-persistence failed" } },
      { _tag: "Die", defect: { message: "Auth auth-persistence failed" } },
    ]);
    expect(JSON.stringify(reported)).not.toContain("private-");
    expect(formatted.join(" ")).not.toContain("private-");

    yield* Effect.exit(run(Cause.fail(expected)).pipe(Effect.provide(logging)));
    yield* Effect.exit(run(Cause.interrupt(123)).pipe(Effect.provide(logging)));
    expect(reported).toHaveLength(1);

    const brokenLogger = Logger.layer([
      Logger.make(() => {
        throw new Error("private-logger");
      }),
    ]);

    const fallback: Array<ReadonlyArray<unknown>> = [];
    const currentConsole = yield* Console.Console;

    const afterLoggerFailure = yield* Effect.exit(
      run(original).pipe(
        Effect.provide(brokenLogger),
        Effect.provideService(Console.Console, {
          ...currentConsole,
          error: (...args) => {
            fallback.push(args);
          },
        }),
      ),
    );

    expect(Exit.isFailure(afterLoggerFailure) && afterLoggerFailure.cause).toEqual(original);
    expect(fallback).toHaveLength(1);
    expect(JSON.stringify(fallback)).not.toContain("private-");

    const bothBroken = yield* Effect.exit(
      run(original).pipe(
        Effect.provide(brokenLogger),
        Effect.provideService(Console.Console, {
          ...currentConsole,
          error: () => {
            throw new Error("private-console");
          },
        }),
      ),
    );

    expect(Exit.isFailure(bothBroken) && bothBroken.cause).toEqual(original);
  }),
);
