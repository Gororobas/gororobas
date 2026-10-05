import { Cause, Context, Effect, Layer } from "effect";

import { reportAuthFailure } from "../internal/diagnostics";
import {
  HookConfigurationError,
  HookDeliveryFailed,
  type HookDelivery,
  type HookDenied,
  type LifecycleEvent,
  type LifecycleSnapshot,
  lifecycleEvent,
  lifecycleSnapshot,
} from "./models";

export interface HookHandlers<R = never, E = HookDeliveryFailed> {
  readonly before?: (snapshot: LifecycleSnapshot) => Effect.Effect<void, HookDenied, R>;
  readonly after?: (event: LifecycleEvent) => Effect.Effect<void, E, R>;
}

export type HookContributionId<Tag extends string> = Tag extends string
  ? {
      readonly _tag: "effect-auth/HookContribution";
      readonly id: Tag;
    }
  : never;

/** Each contribution owns a distinct service key; only composeHooks creates LifecycleHooks. */
export const hookContribution = <const Tag extends string>(id: Tag) => {
  const service = Context.Service<HookContributionId<Tag>, HookHandlers>(`effect-auth/hooks/${id}`);

  const layer = <R, E>(handlers: HookHandlers<R, E>) => {
    const { before, after } = handlers;

    return Layer.effect(
      service,
      Effect.gen(function* () {
        const services = yield* Effect.context<R>();

        return {
          ...(before === undefined
            ? {}
            : {
                before: (snapshot: LifecycleSnapshot) =>
                  before(snapshot).pipe(Effect.provide(services)),
              }),
          ...(after === undefined
            ? {}
            : {
                after: (event: LifecycleEvent) =>
                  after(event).pipe(
                    Effect.catchCause((cause) =>
                      Effect.failCause(Cause.map(cause, () => HookDeliveryFailed.make({}))),
                    ),
                    Effect.provide(services),
                  ),
              }),
        };
      }),
    );
  };

  return Object.freeze({ id, resolve: Effect.service(service), layer });
};

export interface HookContribution<Tag extends string> {
  readonly id: Tag;
  readonly resolve: Effect.Effect<HookHandlers, never, HookContributionId<Tag>>;
}

export type AnyHookContribution = HookContribution<string>;

export class LifecycleHooks extends Context.Service<
  LifecycleHooks,
  {
    readonly before: (snapshot: LifecycleSnapshot) => Effect.Effect<void, HookDenied>;
    /** Runs in declaration order, collecting failures and continuing with later hooks. */
    readonly after: (event: LifecycleEvent) => Effect.Effect<ReadonlyArray<HookDelivery>>;
  }
>()("effect-auth/LifecycleHooks") {
  static readonly empty = Layer.succeed(LifecycleHooks, {
    before: () => Effect.void,
    after: () => Effect.succeed([]),
  });
}

export const composeHooks = <const Tag extends string>(
  ...contributions: ReadonlyArray<HookContribution<Tag>>
) => {
  const entries = contributions.map(({ id, resolve }) => Object.freeze({ id, resolve }));

  return Layer.effect(
    LifecycleHooks,
    Effect.gen(function* () {
      const ids = new Set<string>();

      for (const contribution of entries) {
        if (ids.has(contribution.id))
          return yield* HookConfigurationError.make({
            reason: "duplicate-contribution",
            contribution: contribution.id,
          });
        ids.add(contribution.id);
      }

      const handlers = yield* Effect.forEach(entries, (contribution) =>
        Effect.map(contribution.resolve, (handler) => ({ id: contribution.id, handler })),
      );

      return {
        before: Effect.fn("LifecycleHooks.before")(function* (input: LifecycleSnapshot) {
          const snapshot = lifecycleSnapshot(input);

          for (const { handler } of handlers) {
            if (handler.before !== undefined) yield* handler.before(snapshot);
          }
        }),
        after: Effect.fn("LifecycleHooks.after")(function* (input: LifecycleEvent) {
          const event = lifecycleEvent(input);
          const reports: HookDelivery[] = [];

          for (const { id, handler } of handlers) {
            if (handler.after === undefined) continue;
            const exit = yield* Effect.exit(Effect.suspend(() => handler.after!(event)));

            if (exit._tag === "Failure") yield* reportAuthFailure("after-hook", exit.cause);

            reports.push({
              eventId: event.id,
              contribution: id,
              status: exit._tag === "Success" ? "delivered" : "failed",
            });
          }

          return reports;
        }),
      };
    }),
  );
};
