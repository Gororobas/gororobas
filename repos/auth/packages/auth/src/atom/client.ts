import { Context, Effect, Layer, Schema, Scope } from "effect";
import { AsyncResult, Atom, AtomRegistry, Reactivity } from "effect/reactivity";

import {
  type ActionDecodeServices,
  AuthClientTypeId,
  type ClientDefinition,
  type ClientService,
} from "../http-operation/auth-client";
import type { RouteFailure, RouteInput, RouteSuccess } from "../http-operation/contract";
import { OperationHttpError } from "../http-operation/errors";
import type { AnyAuthAction, AuthActions } from "../operations/actions";
import { AuthAtomLifetime, type AuthSubjectLifetime } from "./AuthAtomLifetime";
import type { ReactivityKeys } from "./operations";
import { type AccountBinding, makeScopedRuntime } from "./scoped-runtime";

type ActionsWithSession = AuthActions & { readonly getSession: AnyAuthAction };
type DecoderServices<Actions extends AuthActions> = ActionDecodeServices<Actions[keyof Actions]>;

export interface AuthAtomOptions<
  Actions extends AuthActions,
  E = never,
  Id extends string = string,
> {
  /** Use the application's runtime factory to share Layers and invalidation. */
  readonly runtime?: Atom.RegistryRuntimeFactory | Atom.SharedRuntimeFactory;
  /** Client service Layer with its dependencies provided. Defaults to the client's layerFetch. */
  readonly layer?: Layer.Layer<ClientService<Id, Actions>, E>;
  /** Additional application queries invalidated by a successful mutation. */
  readonly reactivityKeys?: Partial<{
    readonly [
      Name in keyof Actions as Actions[Name]["mode"] extends "mutation" ? Name : never
    ]: ReactivityKeys;
  }>;
  /** Encoded initial display data. Define a separate binding for each SSR request. */
  readonly initialSession?: unknown;
  /** Required when action result codecs depend on services. */
  readonly services?: Layer.Layer<DecoderServices<Actions>, E>;
}

type QueryAtom<Action extends AnyAuthAction, E = never> = Atom.Atom<
  AsyncResult.AsyncResult<
    RouteSuccess<Action["route"]>,
    RouteFailure<Action["route"]> | OperationHttpError | E
  >
>;

export type AuthActionAtom<Action extends AnyAuthAction, E = never> = Action["mode"] extends "query"
  ? undefined extends RouteInput<Action["route"]>
    ? QueryAtom<Action, E>
    : (input: RouteInput<Action["route"]>) => QueryAtom<Action, E>
  : Atom.AtomResultFn<
      RouteInput<Action["route"]>,
      RouteSuccess<Action["route"]>,
      RouteFailure<Action["route"]> | OperationHttpError | E
    >;

export type AuthAtoms<
  Id extends string,
  Actions extends ActionsWithSession,
  E = never,
  R = never,
> = {
  readonly [Name in keyof Actions]: AuthActionAtom<Actions[Name], E>;
} & {
  readonly session: QueryAtom<Actions["getSession"], E>;
  readonly client: ClientDefinition<Id, Actions, R>;
  /** Account-scoped queries, effects, state and workflows. Named auth mutations
   * use the host lifetime so their own successful account change can settle. */
  readonly runtime: Atom.AtomRuntime<
    ClientService<Id, Actions> | AuthAtomLifetime | DecoderServices<Actions>,
    E | OperationHttpError
  >;
};

interface Binding extends AccountBinding {
  readonly seed: unknown;
  seedAvailable: boolean;
}

class AuthAtomBinding extends Context.Service<AuthAtomBinding, Binding>()(
  "effect-auth/Atom/Binding",
) {}

/** Define importable atoms without acquiring a client. The host registry owns
 * one client Scope; private account registries are replaced internally. Supply
 * the same runtime factory as other application queries to share invalidation. */
export const make = <
  const Id extends string,
  Actions extends ActionsWithSession,
  E = never,
  R = never,
>(
  client: ClientDefinition<Id, Actions, R>,
  ...args: [DecoderServices<Actions> | R] extends [never]
    ? [options?: AuthAtomOptions<Actions, E, Id>]
    : [
        options: AuthAtomOptions<Actions, E, Id> &
          ([DecoderServices<Actions>] extends [never]
            ? {}
            : {
                readonly services: Layer.Layer<DecoderServices<Actions>, E>;
              }) &
          ([R] extends [never]
            ? {}
            : { readonly layer: Layer.Layer<ClientService<Id, Actions>, E> }),
      ]
): AuthAtoms<Id, Actions, E, R> => {
  const options = args[0] ?? {};
  const factory = options.runtime ?? Atom.runtime;
  const actions = client.contract.actions;
  const queryKeys = [Symbol("effect-auth/client/queries")];

  const extraKeys = options.reactivityKeys as
    | Readonly<Record<string, ReactivityKeys | undefined>>
    | undefined;

  // The options tuple requires this Layer whenever codec services are nonempty.
  const services = (options.services ?? Layer.empty) as Layer.Layer<DecoderServices<Actions>, E>;

  const acquire = Effect.gen(function* () {
    const controller = (yield* client).auth[AuthClientTypeId];
    const reactivity = yield* Reactivity.Reactivity;
    const parent = yield* AtomRegistry.AtomRegistry;
    const scope = yield* Effect.scope;
    const codecServices = yield* Effect.context<DecoderServices<Actions>>();

    if (
      actions.getSession.mode !== "query" ||
      ["session", "runtime", "client"].some((name) => Object.hasOwn(actions, name)) ||
      Object.values(actions).some(
        ({ mode, route }) =>
          mode === "query" &&
          (route.operation.credentials ||
            route.operation.reveals.length > 0 ||
            route.operation.replay !== "read-only"),
      )
    )
      return yield* OperationHttpError.make({ reason: "request" });

    const initial = yield* controller.state;
    const hasSeed = Object.hasOwn(options, "initialSession");

    if (hasSeed && initial.generation !== 0)
      return yield* OperationHttpError.make({ reason: "stale-response" });

    const sessionSchema: Actions["getSession"]["route"]["operation"]["rpc"]["successSchema"] =
      actions.getSession.route.operation.rpc.successSchema;

    const seed = hasSeed
      ? yield* Schema.decodeUnknownEffect(sessionSchema)(options.initialSession).pipe(
          Effect.mapError(() => OperationHttpError.make({ reason: "response" })),
          Effect.provide(codecServices),
        )
      : undefined;

    const memoMap = Atom.isAtom(factory.memoMap) ? parent.get(factory.memoMap) : factory.memoMap;

    const newRegistry = () =>
      AtomRegistry.make({
        initialValues: Atom.isAtom(factory.memoMap)
          ? [Atom.initialValue(factory.memoMap, memoMap)]
          : undefined,
      });

    const controlRegistry = AtomRegistry.make();
    let current: AuthSubjectLifetime = { ...initial, registry: newRegistry() };
    const state = Atom.make(current).pipe(Atom.keepAlive);
    const listeners = new Set<(event: { readonly origin?: object }) => void>();
    let closed = false;

    const lifetime: AuthAtomLifetime["Service"] = {
      client: controller.transport,
      current: Atom.readable((get) => {
        get.addFinalizer(controlRegistry.subscribe(state, (value) => get.setSelf(value)));

        return controlRegistry.get(state);
      }),
      get: Effect.sync(() => current),
      controlRegistry,
      replaceSubject: controller.replaceSubject,
      completeAuthentication: controller.completeAuthentication,
    };

    const binding: Binding = {
      lifetime,
      current: () => current,
      subscribe: (listener) => {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
      seed,
      seedAvailable: hasSeed,
    };

    yield* controller.subscribe((event) =>
      Effect.gen(function* () {
        if (closed) return;
        if (event._tag === "Mutation") {
          yield* reactivity.invalidate(queryKeys);
          const keys = extraKeys?.[event.name];

          if (keys !== undefined) yield* reactivity.invalidate(keys);

          return;
        }
        if (current.generation === event.state.generation) return;
        binding.seedAvailable = false;
        // Retire public views and settle pending dispatch observers before disposal.
        for (const listener of [...listeners]) listener(event);
        current.registry.dispose();
        current = { ...event.state, registry: newRegistry() };
        controlRegistry.set(state, current);
        // Account-owned workflows may be interrupted during this transition.
        const keys = event.action === undefined ? undefined : extraKeys?.[event.action];

        if (keys !== undefined) yield* reactivity.invalidate(keys);
      }),
    );

    yield* Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        closed = true;
        binding.seedAvailable = false;
        for (const listener of [...listeners]) listener({});
        listeners.clear();
        current.registry.dispose();
        controlRegistry.dispose();
      }),
    );

    return Context.make(AuthAtomBinding, binding).pipe(Context.add(AuthAtomLifetime, lifetime));
  });

  // The options tuple requires a fully provided Layer whenever the client needs services.
  const clientLayer = (options.layer ?? client.layerFetch) as Layer.Layer<
    ClientService<Id, Actions>,
    E | OperationHttpError
  >;

  const host = factory(
    Layer.effectContext(acquire).pipe(
      Layer.provideMerge(clientLayer),
      Layer.provideMerge(services),
    ),
  ).pipe(Atom.keepAlive);

  const runtime = makeScopedRuntime(host, (context) => Context.get(context, AuthAtomBinding));

  const call = Effect.fn("AuthAtom.call")(function* <Name extends keyof Actions>(
    name: Name,
    input: RouteInput<Actions[Name]["route"]>,
  ) {
    const instance = yield* client;

    return yield* instance.auth[AuthClientTypeId].call(name, input);
  });

  const mutation = <Name extends keyof Actions>(name: Name) => {
    const active = Atom.make((): { origin?: object | undefined } => ({}));

    const source = host.fn<RouteInput<Actions[Name]["route"]>>()((input, get) =>
      Effect.gen(function* () {
        const binding = yield* AuthAtomBinding;
        const instance = yield* client;
        const origin = {};
        const state = get(active);

        state.origin = origin;

        return yield* Effect.acquireUseRelease(
          Effect.sync(() =>
            binding.subscribe((event) => {
              // A replaced call may still be settling credentials uninterruptibly.
              // Its observer must never interrupt the newer dispatch in this atom.
              if (state.origin !== origin) return;
              // Remove any previous account's public result without cancelling the
              // authentication call that owns this admitted transition.
              get.setSelf(AsyncResult.initial(true));
              if (event.origin !== origin) get.registry.set(source, Atom.Interrupt);
            }),
          ),
          () => instance.auth[AuthClientTypeId].call(name, input, { origin }),
          (unsubscribe) =>
            Effect.sync(() => {
              if (state.origin === origin) state.origin = undefined;
              unsubscribe();
            }),
        );
      }),
    );

    return Atom.writable(
      (get) => {
        const context = get(host);
        const state = get(active);

        if (AsyncResult.isSuccess(context)) {
          const binding = Context.get(context.value, AuthAtomBinding);

          get.addFinalizer(
            binding.subscribe(() => {
              if (state.origin === undefined) get.registry.set(source, Atom.Reset);
            }),
          );
        }

        return get(source);
      },
      (ctx, input: RouteInput<Actions[Name]["route"]> | Atom.Reset | Atom.Interrupt) => {
        // Each dispatch starts without a previous account result. Native fn
        // captures its previous value when running, before transition callbacks.
        if (input !== Atom.Reset && input !== Atom.Interrupt) ctx.set(source, Atom.Reset);
        ctx.set(source, input);
      },
    ).pipe(Atom.withServerValueInitial);
  };

  const atoms = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => {
      if (action.mode === "mutation") return [name, mutation(name)];

      const query = Atom.family((input: RouteInput<Actions[string]["route"]>) =>
        runtime
          .atom(call(name, input))
          .pipe(factory.withReactivity(queryKeys), Atom.withServerValueInitial),
      );

      // Restore the encoded payload relationship while inspecting heterogeneous actions.
      const payloadSchema = action.route.operation.rpc.payloadSchema as Schema.Top & {
        readonly Encoded: RouteInput<Actions[string]["route"]>;
      };

      const input: unknown = undefined;

      if (!Schema.is(Schema.toEncoded(payloadSchema))(input)) return [name, query];
      if (name !== "getSession" || !Object.hasOwn(options, "initialSession"))
        return [name, query(input)];
      const session = query(input);

      return [
        name,
        Atom.readable((get) => {
          const result = get(session);
          const context = get(host);

          if (!AsyncResult.isSuccess(context)) return result;
          const binding = Context.get(context.value, AuthAtomBinding);

          if (!AsyncResult.isInitial(result)) binding.seedAvailable = false;

          return binding.seedAvailable
            ? AsyncResult.success(binding.seed, { waiting: true })
            : result;
        }).pipe(
          Atom.withServerValue((get) => {
            const context = get(host);

            if (!AsyncResult.isSuccess(context)) return AsyncResult.initial(true);
            const binding = Context.get(context.value, AuthAtomBinding);

            return binding.seedAvailable
              ? AsyncResult.success(binding.seed, { waiting: true })
              : AsyncResult.initial(true);
          }),
        ),
      ];
    }),
  );

  // Action mode and encoded payload choose each named atom's exact public form.
  return Object.freeze({ ...atoms, session: atoms.getSession, client, runtime }) as AuthAtoms<
    Id,
    Actions,
    E
  >;
};
