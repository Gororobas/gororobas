import { Context, Effect, Layer, Option, Scope, Semaphore } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";

import type { AnyAuthAction, AuthActions } from "../operations/actions";
import {
  Client,
  makeAuthenticationCompletion,
  make as makeTransport,
  type OperationAuthenticationCompletion,
  type OperationFetchClient,
  type OperationFetchOptions,
} from "./client";
import type { RouteFailure, RouteInput, RouteSuccess } from "./contract";
import { OperationHttpError } from "./errors";

export type ClientOptions<R = never, RNative = never> = Omit<
  OperationFetchOptions<R, RNative>,
  "csrfHeader" | "csrfValue"
> & {
  readonly csrf?: { readonly header: string; readonly value: string };
};

export type ActionDecodeServices<Action extends AnyAuthAction> =
  | Action["route"]["operation"]["rpc"]["successSchema"]["DecodingServices"]
  | Action["route"]["operation"]["rpc"]["errorSchema"]["DecodingServices"];

export type ActionArguments<Action extends AnyAuthAction> =
  undefined extends RouteInput<Action["route"]>
    ? readonly [input?: RouteInput<Action["route"]>]
    : readonly [input: RouteInput<Action["route"]>];

export interface AuthClientState {
  readonly subject: string | null;
  readonly generation: number;
}

export type AuthClientEvent =
  | {
      readonly _tag: "Transition";
      readonly state: AuthClientState;
      readonly action?: string;
      readonly origin?: object;
    }
  | { readonly _tag: "Mutation"; readonly name: string };

/** Internal bridge shared with Atom. Subscriptions belong to their host Scope;
 * transition listeners only dispose and publish state, never call the client. */
export interface AuthClientController<Actions extends AuthActions> {
  readonly actions: Actions;
  readonly transport: OperationFetchClient;
  readonly state: Effect.Effect<AuthClientState>;
  readonly subscribe: (
    listener: (event: AuthClientEvent) => Effect.Effect<void>,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly replaceSubject: (subject: string | null) => Effect.Effect<void>;
  readonly completeAuthentication: OperationAuthenticationCompletion;
  readonly call: <Name extends keyof Actions>(
    name: Name,
    input: RouteInput<Actions[Name]["route"]>,
    options?: { readonly notifyMutation?: boolean; readonly origin?: object },
  ) => Effect.Effect<
    RouteSuccess<Actions[Name]["route"]>,
    RouteFailure<Actions[Name]["route"]> | OperationHttpError,
    ActionDecodeServices<Actions[Name]>
  >;
}

export const AuthClientTypeId: unique symbol = Symbol.for("effect-auth/Client");

/** Named calls return Effects; request credentials and private reveals remain
 * in the configured transport capabilities, outside operation results. */
export type AuthClient<Actions extends AuthActions> = {
  readonly [Name in keyof Actions]: (
    ...args: ActionArguments<Actions[Name]>
  ) => Effect.Effect<
    RouteSuccess<Actions[Name]["route"]>,
    RouteFailure<Actions[Name]["route"]> | OperationHttpError,
    ActionDecodeServices<Actions[Name]>
  >;
} & { readonly [AuthClientTypeId]: AuthClientController<Actions> };

/** Derive one named client from the shared contract. Each operation makes one
 * attempt. Authentication transitions also notify any scoped Atom consumers. */
const acquire = Effect.fn("Client.make")(function* <Actions extends AuthActions, R, RNative>(
  contract: { readonly actions: Actions },
  options: ClientOptions<R, RNative>,
): Effect.fn.Return<
  { readonly auth: AuthClient<Actions> },
  OperationHttpError,
  Scope.Scope | HttpClient.HttpClient | R | RNative
> {
  const transport = yield* makeTransport({
    ...options,
    csrfHeader: options.csrf?.header ?? "x-effect-auth-csrf",
    csrfValue: options.csrf?.value ?? "1",
  });

  const gate = yield* Semaphore.make(1);
  const listeners = new Set<(event: AuthClientEvent) => Effect.Effect<void>>();
  let state: AuthClientState = { subject: null, generation: 0 };
  let closed = false;

  const notify = (event: AuthClientEvent) =>
    Effect.forEach([...listeners], (listener) => listener(event), {
      concurrency: 1,
      discard: true,
    });

  const publish = Effect.fn("Client.publishSubject")(function* (
    subject: string | null,
    action?: string,
    origin?: object,
  ) {
    state = { subject, generation: state.generation + 1 };
    yield* notify({
      _tag: "Transition",
      state,
      ...(action === undefined ? {} : { action }),
      ...(origin === undefined ? {} : { origin }),
    });
  });

  const completeAuthentication = yield* makeAuthenticationCompletion(gate, publish).pipe(
    Effect.provideService(Client, transport),
  );

  const replaceSubject = Effect.fn("Client.replaceSubject")(function* (subject: string | null) {
    yield* gate.withPermits(1)(
      Effect.uninterruptible(
        Effect.gen(function* () {
          yield* transport.transition;
          yield* publish(subject);
        }),
      ),
    );
  });

  const call: AuthClientController<Actions>["call"] = Effect.fn("Client.call")(function* <
    Name extends keyof Actions,
  >(
    name: Name,
    input: RouteInput<Actions[Name]["route"]>,
    callOptions?: { readonly notifyMutation?: boolean; readonly origin?: object },
  ) {
    if (closed) return yield* OperationHttpError.make({ reason: "stale-response" });

    const action = contract.actions[name];
    const project = action.subject;
    const started = yield* transport.generation;
    let transitioned = false;

    const execute = Effect.gen(function* () {
      if (project !== undefined && action.mode === "mutation") {
        const generation = state.generation;

        // Notify within credential settlement: disposing an account registry can
        // interrupt the atom that dispatched this call before a later success tap.
        const complete = yield* makeAuthenticationCompletion(gate, (subject) =>
          publish(subject, String(name), callOptions?.origin),
        ).pipe(Effect.provideService(Client, transport));

        const value = yield* complete<Actions[Name]["route"]>(
          action.route,
          input,
          (success) => project.fromSuccess(success),
          { expectedGeneration: started },
        );

        transitioned = state.generation !== generation;

        return value;
      }

      const value = yield* transport.call<Actions[Name]["route"]>(action.route, input);

      if (project !== undefined) {
        yield* gate.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              if ((yield* transport.generation) !== started)
                return yield* OperationHttpError.make({ reason: "stale-response" });

              const subject = yield* Effect.try({
                try: () => project.fromSuccess(value),
                catch: () => OperationHttpError.make({ reason: "response" }),
              });

              if (subject !== undefined && subject !== state.subject) {
                yield* transport.transition;
                yield* publish(subject);
              }
            }),
          ),
        );
      }

      return value;
    });

    const value = yield* execute;

    if (action.mode === "mutation" && !transitioned && callOptions?.notifyMutation !== false)
      yield* notify({ _tag: "Mutation", name: String(name) });

    return value;
  });

  const controller: AuthClientController<Actions> = {
    actions: contract.actions,
    transport,
    state: Effect.sync(() => state),
    call,
    replaceSubject,
    completeAuthentication,
    subscribe: (listener) =>
      Effect.acquireRelease(
        gate.withPermits(1)(
          Effect.gen(function* () {
            yield* listener({ _tag: "Transition", state });
            listeners.add(listener);
          }),
        ),
        () => Effect.sync(() => void listeners.delete(listener)),
      ),
  };

  yield* Scope.addFinalizer(
    yield* Effect.scope,
    gate.withPermits(1)(
      Effect.gen(function* () {
        closed = true;
        yield* transport.transition;
        listeners.clear();
      }),
    ),
  );

  const methods = Object.fromEntries(
    Object.keys(contract.actions).map((name) => [
      name,
      (input: RouteInput<Actions[string]["route"]>) => call(name, input),
    ]),
  );

  Object.defineProperty(methods, AuthClientTypeId, { value: controller });

  // Every property delegates to the same named contract entry. This cast restores
  // the mapped key/signature relationship after constructing the property table.
  return { auth: Object.freeze(methods) as AuthClient<Actions> };
});

/** Identifier for a configured client service, separate from the server service. */
export interface ClientService<Id extends string, Actions extends AuthActions> {
  readonly namespace: Id;
  readonly actions: Actions;
  readonly _client: unique symbol;
}

export interface ClientDefinition<
  Id extends string,
  Actions extends AuthActions,
  R = never,
> extends Context.Service<ClientService<Id, Actions>, { readonly auth: AuthClient<Actions> }> {
  readonly contract: { readonly namespace: Id; readonly actions: Actions };
  readonly make: Effect.Effect<
    { readonly auth: AuthClient<Actions> },
    OperationHttpError,
    Scope.Scope | HttpClient.HttpClient | R
  >;
  readonly layer: Layer.Layer<
    ClientService<Id, Actions>,
    OperationHttpError,
    HttpClient.HttpClient | R
  >;
  /** Client with Fetch transport, credential mode and redirect defaults configured.
   * Supply Fetch/RequestInit defaults when constructing this Layer. */
  readonly layerFetch: Layer.Layer<ClientService<Id, Actions>, OperationHttpError, R>;
}

/** Define a yieldable client without acquiring resources. Provide its layer once
 * in the application Scope, or yield its make Effect for direct acquisition.
 * Supply a non-retrying HttpClient at either boundary. Every instance owns its
 * credential settlement and scoped Atom subscriptions. */
export const make = <
  const Id extends string,
  Actions extends AuthActions,
  R = never,
  RNative = never,
>(
  contract: { readonly namespace: Id; readonly actions: Actions },
  options: ClientOptions<R, RNative>,
): ClientDefinition<Id, Actions, R | RNative> => {
  const service = Context.Service<
    ClientService<Id, Actions>,
    { readonly auth: AuthClient<Actions> }
  >()(`${contract.namespace}/client`);

  const create = acquire(contract, options);
  const layer = Layer.effect(service, create);

  const fetchOptions = Layer.effect(
    FetchHttpClient.RequestInit,
    Effect.map(
      Effect.serviceOption(FetchHttpClient.RequestInit),
      (defaults): globalThis.RequestInit => ({
        ...Option.getOrUndefined(defaults),
        credentials: options.native === undefined ? "include" : "omit",
        redirect: "error",
      }),
    ),
  );

  // Fetch captures its construction context. Do not share a differently
  // configured transport through another client's Atom memo map.
  const layerFetch = layer.pipe(
    Layer.provide(Layer.fresh(FetchHttpClient.layer).pipe(Layer.provide(fetchOptions))),
  );

  return Object.assign(service, { contract, make: create, layer, layerFetch });
};
