import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Semaphore from "effect/Semaphore";
import * as SubscriptionRef from "effect/SubscriptionRef";

import {
  Client,
  makeAuthenticationSettlement,
  type OperationAuthenticationCompletion,
  type OperationFetchClient,
} from "../http-operation/client";
import type { AnyRoute, RouteInput, RouteSuccess } from "../http-operation/contract";
import type { SubjectId } from "../Schema";
import { reportAtomDefects } from "./failures";

export interface AuthSubjectLifetime {
  readonly subject: SubjectId | null;
  readonly generation: number;
  readonly registry: AtomRegistry.AtomRegistry;
}

export class AuthAtomLifetime extends Context.Service<
  AuthAtomLifetime,
  {
    readonly client: OperationFetchClient;
    readonly current: Atom.Atom<AuthSubjectLifetime>;
    readonly get: Effect.Effect<AuthSubjectLifetime>;
    readonly controlRegistry: AtomRegistry.AtomRegistry;
    readonly replaceSubject: (subject: SubjectId | null) => Effect.Effect<void>;
    readonly completeAuthentication: OperationAuthenticationCompletion;
  }
>()("effect-auth/AuthAtomLifetime") {}

/** A dedicated registry is disposed before the next subject is published. Mount
 * only `current` in `controlRegistry`. All operation atoms, including auth
 * mutations and device workflows, belong to the current subject registry. Acquire
 * this lifetime in the host scope, then provide its value to the Atom runtime. */
export const makeLifetime = Effect.fn("AuthAtom.makeLifetime")(
  (options?: { readonly initialSubject?: SubjectId | null }) =>
    Effect.gen(function* () {
      const client = yield* Client;
      const gate = yield* Semaphore.make(1);
      const controlRegistry = AtomRegistry.make();

      const state = yield* SubscriptionRef.make<AuthSubjectLifetime>({
        subject: options?.initialSubject ?? null,
        generation: 0,
        registry: AtomRegistry.make(),
      });

      const publishSubject = Effect.fn("AuthAtom.publishSubject")(function* (
        subject: SubjectId | null,
      ) {
        const previous = yield* SubscriptionRef.get(state);

        previous.registry.dispose();
        yield* SubscriptionRef.set(state, {
          subject,
          generation: previous.generation + 1,
          registry: AtomRegistry.make(),
        });
      });

      const settleAuthentication = yield* makeAuthenticationSettlement(publishSubject);

      const completeAuthentication: OperationAuthenticationCompletion = Effect.fn(
        "OperationHttpClient.completeAuthentication",
      )(function* <Route extends AnyRoute>(
        route: Route,
        input: RouteInput<Route>,
        fromSuccess: (success: RouteSuccess<Route>) => SubjectId | null | undefined,
        options?: {
          readonly onTransition?: Effect.Effect<void>;
          readonly expectedGeneration?: number;
        },
      ) {
        const expectedGeneration = options?.expectedGeneration ?? (yield* client.generation);

        return yield* gate.withPermits(1)(
          Effect.uninterruptible(
            settleAuthentication(route, input, fromSuccess, { ...options, expectedGeneration }),
          ),
        );
      });

      const replaceSubject = Effect.fn("AuthAtom.replaceSubject")(function* (
        subject: SubjectId | null,
      ) {
        yield* gate.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              // The Fetch client waits for browser credential responses before advancing.
              yield* client.transition;
              yield* publishSubject(subject);
            }),
          ),
        );
      }, reportAtomDefects);

      yield* Effect.addFinalizer(() =>
        gate.withPermits(1)(
          client.transition.pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                (yield* SubscriptionRef.get(state)).registry.dispose();
              }),
            ),
            Effect.ensuring(Effect.sync(() => controlRegistry.dispose())),
            reportAtomDefects,
          ),
        ),
      );

      return {
        client,
        current: Atom.subscriptionRef(state),
        get: SubscriptionRef.get(state),
        controlRegistry,
        replaceSubject,
        completeAuthentication,
      };
    }).pipe(reportAtomDefects),
);
