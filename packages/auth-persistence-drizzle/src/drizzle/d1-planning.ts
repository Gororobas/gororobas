import type { D1Client } from "@effect/sql-d1/D1Client";
import { HookConfigurationError } from "@yielded/auth/Hooks";
import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import { type Option, Context, Effect } from "effect";

import { D1BatchStatements } from "./D1BatchStatements";

export type D1PlanningDatabase = EffectSQLiteD1Database<AnyRelations> & {
  readonly $client: D1Client;
};

export class CurrentD1PlanningDatabase extends Context.Service<
  CurrentD1PlanningDatabase,
  D1PlanningDatabase
>()("effect-auth/drizzle/CurrentD1PlanningDatabase") {}

export interface D1Owner<Closed> {
  readonly collector: D1BatchStatements["Service"];
  readonly check: Effect.Effect<void, Closed>;
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Closed, R>;
  readonly close: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Closed, R>;
}

const closedCollector = () =>
  HookConfigurationError.make({ reason: "closed-journal", contribution: "d1-batch" });

export const makeD1Owner = <Closed>(
  closed: Closed,
): Effect.Effect<D1Owner<Closed>, never, D1BatchStatements> =>
  Effect.map(D1BatchStatements, (nativeCollector) => {
    let accepting = true;
    let active = 0;
    let collector: D1BatchStatements["Service"];

    const valid = (current: Option.Option<D1BatchStatements["Service"]>) =>
      accepting && current._tag === "Some" && current.value === collector;

    const checkWith = <Failure>(failure: Failure): Effect.Effect<void, Failure> =>
      Effect.serviceOption(D1BatchStatements).pipe(
        Effect.flatMap((current) => (valid(current) ? Effect.void : Effect.fail(failure))),
      );

    const enterWith = <Failure>(failure: Failure): Effect.Effect<void, Failure> =>
      Effect.serviceOption(D1BatchStatements).pipe(
        Effect.flatMap((current) => {
          if (!valid(current)) return Effect.fail(failure);
          active++;

          return Effect.void;
        }),
      );

    const runWith = <A, E, R, Failure>(
      failure: Failure,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | Failure, R> =>
      Effect.uninterruptibleMask((restore) =>
        enterWith(failure).pipe(
          Effect.flatMap(() =>
            restore(effect).pipe(
              Effect.flatMap((value) => checkWith(failure).pipe(Effect.as(value))),
              Effect.ensuring(
                Effect.sync(() => {
                  active--;
                }),
              ),
            ),
          ),
        ),
      );

    const check = checkWith(closed);

    const run = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Closed, R> =>
      runWith(closed, effect);

    collector = D1BatchStatements.of({
      append: (statement) =>
        runWith(
          closedCollector(),
          Effect.suspend(() => nativeCollector.append(statement)),
        ).pipe(Effect.orDie),
    });

    return {
      collector,
      check,
      run,
      close: (effect) => {
        let activeAtClose = false;

        return effect.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              accepting = false;
              activeAtClose = active !== 0;
            }),
          ),
          Effect.flatMap((value) => (activeAtClose ? Effect.fail(closed) : Effect.succeed(value))),
        );
      },
    };
  });
