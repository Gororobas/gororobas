import { Context, Effect, Scope, Semaphore, SubscriptionRef } from "effect";
import { Atom, AtomRegistry } from "effect/reactivity";

import {
  Client,
  makeAuthenticationCompletion,
  type OperationAuthenticationCompletion,
  type OperationFetchClient,
} from "../http-operation/client";

export interface AuthSubjectLifetime {
  readonly subject: string | null;
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
    readonly replaceSubject: (subject: string | null) => Effect.Effect<void>;
    readonly completeAuthentication: OperationAuthenticationCompletion;
  }
>()("effect-auth/AuthAtomLifetime") {}

/** A dedicated registry is disposed before the next subject is published. Mount
 * only `current` in `controlRegistry`. All operation atoms, including auth
 * mutations and device workflows, belong to the current subject registry. Acquire
 * this lifetime in the host scope, then provide its value to the Atom runtime. */
export const makeLifetime = Effect.fn("AuthAtom.makeLifetime")(function* (options?: {
  readonly initialSubject?: string | null;
}) {
  const client = yield* Client;
  const gate = yield* Semaphore.make(1);
  const controlRegistry = AtomRegistry.make();

  const state = yield* SubscriptionRef.make<AuthSubjectLifetime>({
    subject: options?.initialSubject ?? null,
    generation: 0,
    registry: AtomRegistry.make(),
  });

  const publishSubject = Effect.fn("AuthAtom.publishSubject")(function* (subject: string | null) {
    const previous = yield* SubscriptionRef.get(state);

    previous.registry.dispose();
    yield* SubscriptionRef.set(state, {
      subject,
      generation: previous.generation + 1,
      registry: AtomRegistry.make(),
    });
  });

  const replaceSubject = Effect.fn("AuthAtom.replaceSubject")(function* (subject: string | null) {
    yield* gate.withPermits(1)(
      Effect.uninterruptible(
        Effect.gen(function* () {
          // The Fetch client waits for browser credential responses before advancing.
          yield* client.transition;
          yield* publishSubject(subject);
        }),
      ),
    );
  });

  yield* Scope.addFinalizer(
    yield* Effect.scope,
    gate.withPermits(1)(
      Effect.gen(function* () {
        yield* client.transition;
        (yield* SubscriptionRef.get(state)).registry.dispose();
        controlRegistry.dispose();
      }),
    ),
  );

  return {
    client,
    current: Atom.subscriptionRef(state) as Atom.Atom<AuthSubjectLifetime>,
    get: SubscriptionRef.get(state),
    controlRegistry,
    replaceSubject,
    completeAuthentication: yield* makeAuthenticationCompletion(gate, publishSubject),
  };
});
