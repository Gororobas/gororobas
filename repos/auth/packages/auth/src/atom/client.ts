import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import {
  type ActionDecodeServices,
  AuthClientTypeId,
  type ClientDefinition,
  type ClientService,
} from "../http-operation/auth-client";
import type { RouteFailure, RouteInput, RouteSuccess } from "../http-operation/contract";
import { OperationHttpError } from "../http-operation/errors";
import {
  markAuthFailureReported,
  reportAuthFailure,
  ReportedOperationDefect,
} from "../internal/diagnostics";
import type { AnyAuthAction, AuthActions } from "../operations/actions";
import type { SubjectId } from "../Schema";
import { AuthAtomLifetime, type AuthSubjectLifetime } from "./AuthAtomLifetime";
import { reportAtomDefects } from "./failures";
import { type AuthIdentity, type IdentityCacheOptions, IdentityNotVerified } from "./identity";
import type { ReactivityKeys } from "./operations";
import { type AccountBinding, makeScopedRuntime } from "./scoped-runtime";

type ActionsWithSession = AuthActions & {
  readonly getSession: AnyAuthAction;
};
type DecoderServices<Actions extends AuthActions> =
  | ActionDecodeServices<Actions[keyof Actions]>
  | ActionDecodeServices<Actions["getSession"]>;
type SessionSchema<Actions extends AuthActions> =
  Actions["getSession"]["route"]["operation"]["rpc"]["successSchema"];

const cacheResult = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.asSome,
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.interrupt
        : reportAuthFailure("session-cache", cause).pipe(Effect.as(Option.none<A>())),
    ),
  );

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
  /** Optional local display snapshot. Never supplies authentication authority. */
  readonly identityCache?: IdentityCacheOptions<SessionSchema<Actions>, E>;
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
  ? [RouteInput<Action["route"]>] extends [void]
    ? QueryAtom<Action, E>
    : (
        ...args: undefined extends RouteInput<Action["route"]>
          ? [input?: RouteInput<Action["route"]>]
          : [input: RouteInput<Action["route"]>]
      ) => QueryAtom<Action, E>
  : Atom.AtomResultFn<
      RouteInput<Action["route"]>,
      RouteSuccess<Action["route"]>,
      RouteFailure<Action["route"]> | OperationHttpError | E
    >;

type AuthActionAtoms<Actions extends ActionsWithSession, E> = {
  readonly [Name in keyof Actions]: AuthActionAtom<Actions[Name], E>;
} & {
  /** Default getSession query, including any initial display data. */
  readonly session: QueryAtom<Actions["getSession"], E>;
};

export type AuthAtoms<
  Id extends string,
  Actions extends ActionsWithSession,
  E = never,
  R = never,
> = AuthActionAtoms<Actions, E> & {
  /** Local display identity, with live verification distinguished from remembered data. */
  readonly identity: Atom.Atom<AuthIdentity<RouteSuccess<Actions["getSession"]["route"]>>>;
  /** Observe the shared live session for an expected subject, excluding display seeds. */
  readonly verifiedSession: (
    subjectId: SubjectId,
  ) => QueryAtom<Actions["getSession"], E | IdentityNotVerified>;
  readonly client: ClientDefinition<Id, Actions, R>;
  /** Account-scoped queries, effects, state and workflows. Named auth mutations
   * and subject-discovering queries use the host lifetime so their own account
   * change can settle. */
  readonly runtime: Atom.AtomRuntime<
    ClientService<Id, Actions> | AuthAtomLifetime | DecoderServices<Actions>,
    E | OperationHttpError
  >;
};

interface Binding extends AccountBinding {
  seedAvailable: boolean;
}

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

  type Session = RouteSuccess<Actions["getSession"]["route"]>;
  type SessionError = RouteFailure<Actions["getSession"]["route"]> | OperationHttpError;

  class AuthAtomBinding extends Context.Service<
    AuthAtomBinding,
    Binding & {
      readonly seed: Option.Option<Session>;
      readonly session: Atom.Atom<AsyncResult.AsyncResult<Session, SessionError>>;
      readonly identity: Atom.Atom<AuthIdentity<Session>>;
      readonly snapshot: Atom.Atom<AuthIdentity<Session>>;
    }
  >()("effect-auth/Atom/Binding") {}

  const extraKeys: Readonly<Record<string, ReactivityKeys | undefined>> | undefined =
    options.reactivityKeys;

  // The options tuple requires this Layer whenever codec services are nonempty.
  const services = (options.services ?? Layer.empty) as Layer.Layer<DecoderServices<Actions>, E>;

  const acquire = Effect.gen(function* () {
    const controller = (yield* client).auth[AuthClientTypeId];
    const reactivity = yield* Reactivity.Reactivity;
    const parent = yield* AtomRegistry.AtomRegistry;
    const codecServices = yield* Effect.context<DecoderServices<Actions>>();

    const sessionServices = yield* Effect.context<ActionDecodeServices<Actions["getSession"]>>();

    if (
      actions.getSession.mode !== "query" ||
      !Schema.is(Schema.toEncoded(actions.getSession.route.operation.rpc.payloadSchema))(
        undefined,
      ) ||
      ["session", "runtime", "client", "identity", "verifiedSession"].some((name) =>
        Object.hasOwn(actions, name),
      ) ||
      (options.identityCache !== undefined && actions.getSession.subject === undefined) ||
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

    const sessionPayload: Actions["getSession"]["route"]["operation"]["rpc"]["payloadSchema"] =
      actions.getSession.route.operation.rpc.payloadSchema;

    const sessionInput = yield* Schema.decodeEffect(Schema.toEncoded(sessionPayload))(
      undefined,
    ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "request" })));

    const seed = hasSeed
      ? Option.some(
          yield* Effect.uninterruptibleMask((restore) =>
            restore(
              Schema.decodeUnknownEffect(sessionSchema)(options.initialSession).pipe(
                Effect.provide(codecServices),
              ),
            ).pipe(
              Effect.catchCause((cause) =>
                reportAuthFailure("client-workflow", cause).pipe(
                  Effect.andThen(
                    Effect.failCause(
                      markAuthFailureReported(
                        Cause.fromReasons(
                          cause.reasons.map((reason) =>
                            Cause.isInterruptReason(reason)
                              ? reason
                              : Cause.isDieReason(reason)
                                ? Cause.makeDieReason(ReportedOperationDefect.make({}))
                                : Cause.makeFailReason(
                                    OperationHttpError.make({ reason: "response" }),
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : Option.none<Session>();

    const seedSubject = Option.isSome(seed)
      ? yield* Effect.sync(() => actions.getSession.subject?.fromSuccess(seed.value))
      : undefined;

    const cacheOptions = options.identityCache;

    const cache =
      cacheOptions === undefined
        ? Option.none()
        : yield* cacheResult(
            Effect.gen(function* () {
              const context = yield* Layer.build(cacheOptions.storage);

              const store = KeyValueStore.toSchemaStore(
                Context.get(context, KeyValueStore.KeyValueStore),
                sessionSchema,
              );

              const gate = yield* Semaphore.make(1);

              return {
                read: store.get(cacheOptions.key).pipe(Effect.provide(codecServices)),
                write: (value: Session | undefined, generation: number) =>
                  gate
                    .withPermits(1)(
                      Effect.uninterruptible(
                        Effect.gen(function* () {
                          if ((yield* controller.state).generation !== generation) return;
                          yield* value === undefined
                            ? store.remove(cacheOptions.key)
                            : store.set(cacheOptions.key, value).pipe(Effect.provide(context));
                        }),
                      ),
                    )
                    .pipe(cacheResult, Effect.asVoid),
              };
            }),
          );

    let snapshotGeneration = initial.generation;

    let remembered: AuthIdentity<Session> =
      Option.isSome(seed) && typeof seedSubject === "string"
        ? { _tag: "Remembered", subjectId: seedSubject, snapshot: seed.value }
        : { _tag: "Unknown" };

    if (Option.isSome(cache) && initial.generation === 0) {
      const saved = hasSeed ? Option.some(seed) : yield* cacheResult(cache.value.read);

      if (Option.isSome(saved) && Option.isSome(saved.value)) {
        const value = saved.value.value;

        const subject = yield* cacheResult(
          Effect.sync(() => actions.getSession.subject?.fromSuccess(value)),
        );

        if (Option.isSome(subject) && typeof subject.value === "string") {
          const restored = yield* controller.restoreRememberedSubject(
            subject.value,
            initial.generation,
          );

          if (restored !== undefined) {
            snapshotGeneration = restored.generation;
            remembered = { _tag: "Remembered", subjectId: subject.value, snapshot: value };
          }
        }
      }
    }

    const acquired = yield* controller.state;

    // Only our own restoration can carry display data across a generation change.
    // A concurrent replacement retires even a seed for the same subject.
    const snapshotCurrent = acquired.generation === snapshotGeneration;

    if (!snapshotCurrent) remembered = { _tag: "Unknown" };

    const memoMap = Atom.isAtom(factory.memoMap) ? parent.get(factory.memoMap) : factory.memoMap;

    const newRegistry = () =>
      AtomRegistry.make({
        initialValues: Atom.isAtom(factory.memoMap)
          ? [Atom.initialValue(factory.memoMap, memoMap)]
          : undefined,
      });

    const controlRegistry = AtomRegistry.make();
    let current: AuthSubjectLifetime = { ...acquired, registry: newRegistry() };
    const state = Atom.make(current).pipe(Atom.keepAlive);
    const snapshot = Atom.make<AuthIdentity<Session>>(remembered).pipe(Atom.keepAlive);
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

    let adoptedSession = Option.none<Session>();

    const session = Atom.make((get) =>
      Effect.gen(function* () {
        const origin = {};
        let active = true;

        get.addFinalizer(() => {
          active = false;
        });
        get.addFinalizer(
          binding.subscribe((event) => {
            get.setSelf(AsyncResult.initial(true));
            if (event.origin !== origin) get.refreshSelf();
          }),
        );

        if (Option.isSome(adoptedSession)) {
          const value = adoptedSession.value;

          adoptedSession = Option.none();

          return value;
        }

        const value = yield* controller.call("getSession", sessionInput, { origin });

        const generation = current.generation;

        const subject = yield* Effect.try({
          try: () => actions.getSession.subject?.fromSuccess(value),
          catch: () => OperationHttpError.make({ reason: "response" }),
        });

        if (!active) return yield* Effect.interrupt;
        controlRegistry.set(
          snapshot,
          typeof subject === "string"
            ? { _tag: "Remembered", subjectId: subject, snapshot: value }
            : subject === null
              ? { _tag: "SignedOut" }
              : { _tag: "Unknown" },
        );
        if (Option.isSome(cache))
          yield* cache.value.write(typeof subject === "string" ? value : undefined, generation);

        return value;
      }).pipe(
        reportAtomDefects,
        // Inherit application codecs and logging, but keep this read's Scope,
        // registry and scheduler rather than the host's acquisition lifetime.
        Effect.updateContext((current: Context.Context<Scope.Scope | AtomRegistry.AtomRegistry>) =>
          Context.merge(sessionServices, current),
        ),
      ),
    );

    const identity = Atom.make((get): AuthIdentity<Session> => {
      const result = get(session);
      const saved = get(snapshot);

      if (AsyncResult.isSuccess(result) && !result.waiting && saved._tag === "Remembered")
        return { ...saved, _tag: "Verified" };

      return saved;
    });

    const binding: AuthAtomBinding["Service"] = {
      lifetime,
      current: () => current,
      subscribe: (listener) => {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
      seed,
      seedAvailable: hasSeed && snapshotCurrent,
      session,
      identity,
      snapshot,
    };

    yield* controller.subscribe((event) =>
      Effect.gen(function* () {
        if (closed) return;
        if (event._tag === "Authentication") {
          if (current.generation !== event.state.generation) return;
          if (event.state.subject === null) {
            controlRegistry.set(snapshot, { _tag: "SignedOut" });

            return;
          }
          if (event.session === undefined) return;

          yield* Effect.gen(function* () {
            const value = yield* Schema.decodeUnknownEffect(Schema.toType(sessionSchema))(
              event.session,
            );

            const subject = yield* Effect.try({
              try: () => actions.getSession.subject?.fromSuccess(value),
              catch: () => OperationHttpError.make({ reason: "response" }),
            });

            if (typeof subject !== "string" || subject !== event.state.subject)
              return yield* OperationHttpError.make({ reason: "response" });
            if (current.generation !== event.state.generation) return;

            Atom.batch(() => {
              adoptedSession = Option.some(value);
              controlRegistry.set(snapshot, {
                _tag: "Remembered",
                subjectId: subject,
                snapshot: value,
              });
              controlRegistry.refresh(session);
            });
            if (Option.isSome(cache)) yield* cache.value.write(value, event.state.generation);
          }).pipe(Effect.catchCause((cause) => reportAuthFailure("client-workflow", cause)));

          return;
        }
        if (event._tag === "Mutation") {
          controlRegistry.refresh(session);
          yield* reactivity.invalidate(queryKeys);
          const keys = extraKeys?.[event.name];

          if (keys !== undefined) yield* reactivity.invalidate(keys);

          return;
        }
        if (current.generation === event.state.generation) return;
        adoptedSession = Option.none();
        // Initial verification may acquire the already displayed account before
        // its query publishes the result. Explicit replacement still retires it.
        binding.seedAvailable =
          binding.seedAvailable &&
          current.generation === 0 &&
          event.action === "getSession" &&
          event.state.subject === seedSubject;
        if (!binding.seedAvailable) controlRegistry.set(snapshot, { _tag: "Unknown" });
        // Retire public views and settle pending dispatch observers before disposal.
        for (const listener of [...listeners]) listener(event);
        current.registry.dispose();
        current = { ...event.state, registry: newRegistry() };
        controlRegistry.set(state, current);
        if (Option.isSome(cache)) yield* cache.value.write(undefined, current.generation);
        // Account-owned workflows may be interrupted during this transition.
        const keys = event.action === undefined ? undefined : extraKeys?.[event.action];

        if (keys !== undefined) yield* reactivity.invalidate(keys);
      }),
    );

    if (cacheOptions !== undefined && typeof window !== "undefined") {
      const refresh = () => controlRegistry.refresh(session);

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          window.addEventListener("online", refresh);
          window.addEventListener("focus", refresh);
        }),
        () =>
          Effect.sync(() => {
            window.removeEventListener("online", refresh);
            window.removeEventListener("focus", refresh);
          }),
      );
    }

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
        binding.seedAvailable = false;
        try {
          for (const listener of [...listeners]) listener({});
        } finally {
          listeners.clear();
        }
      }).pipe(
        Effect.ensuring(Effect.sync(() => current.registry.dispose())),
        Effect.ensuring(Effect.sync(() => controlRegistry.dispose())),
        reportAtomDefects,
      ),
    );

    return Context.make(AuthAtomBinding, binding).pipe(Context.add(AuthAtomLifetime, lifetime));
  }).pipe(reportAtomDefects);

  // The options tuple requires a fully provided Layer whenever the client needs services.
  // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
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

  // Read the one host-owned source even from an account registry. Refreshes are
  // forwarded to that source rather than acquiring another client or session read.
  const hostView = <A>(
    select: (binding: AuthAtomBinding["Service"]) => Atom.Atom<A>,
    unavailable: (context: Atom.Type<typeof runtime>) => A,
  ) => {
    const refreshSignal = Atom.make(() => ({}));
    const observed = Atom.make((): { token?: object } => ({}));

    return Atom.readable(
      (get) => {
        const token = get(refreshSignal);
        const previous = get(observed);
        const context = get(runtime);

        if (!AsyncResult.isSuccess(context)) return unavailable(context);
        const binding = Context.get(context.value, AuthAtomBinding);

        if (previous.token !== undefined && previous.token !== token)
          binding.lifetime.controlRegistry.refresh(binding.session);
        previous.token = token;
        const source = select(binding);

        get.addFinalizer(
          binding.lifetime.controlRegistry.subscribe(source, (value) => get.setSelf(value)),
        );

        return binding.lifetime.controlRegistry.get(source);
      },
      (refresh) => refresh(refreshSignal),
    );
  };

  const liveSession = hostView(
    (binding) => binding.session,
    (context): AsyncResult.AsyncResult<Session, SessionError | E> =>
      AsyncResult.isFailure(context)
        ? AsyncResult.failure(context.cause)
        : AsyncResult.initial(true),
  ).pipe(Atom.withServerValueInitial);

  const session = Atom.readable(
    (get) => {
      const result = get(liveSession);
      const context = get(runtime);

      if (!AsyncResult.isSuccess(context)) return result;
      const binding = Context.get(context.value, AuthAtomBinding);

      if (!AsyncResult.isInitial(result)) binding.seedAvailable = false;

      return binding.seedAvailable && Option.isSome(binding.seed)
        ? AsyncResult.success(binding.seed.value, { waiting: true })
        : result;
    },
    (refresh) => refresh(liveSession),
  ).pipe(
    Atom.withServerValue((get) => {
      const context = get(runtime);

      if (!AsyncResult.isSuccess(context))
        return AsyncResult.initial<Session, SessionError | E>(true);
      const binding = Context.get(context.value, AuthAtomBinding);

      return binding.seedAvailable && Option.isSome(binding.seed)
        ? AsyncResult.success(binding.seed.value, { waiting: true })
        : AsyncResult.initial<Session, SessionError | E>(true);
    }),
  );

  const identity = hostView(
    (binding) => binding.identity,
    (): AuthIdentity<Session> => ({ _tag: "Unknown" }),
  ).pipe(
    Atom.withServerValue((get): AuthIdentity<Session> => {
      const context = get(runtime);

      if (!AsyncResult.isSuccess(context)) return { _tag: "Unknown" };
      const binding = Context.get(context.value, AuthAtomBinding);

      return binding.lifetime.controlRegistry.get(binding.snapshot);
    }),
  );

  const verifiedSession = Atom.family((subjectId: SubjectId) =>
    Atom.readable(
      (get): AsyncResult.AsyncResult<Session, SessionError | E | IdentityNotVerified> => {
        const result = get(liveSession);

        if (!AsyncResult.isSuccess(result)) return result;
        if (result.waiting) return AsyncResult.initial(true);
        const value = get(identity);

        if (value._tag === "Verified" && value.subjectId === subjectId) return result;

        return AsyncResult.fail(
          IdentityNotVerified.make({
            reason:
              value._tag === "SignedOut"
                ? "signed-out"
                : value._tag === "Verified"
                  ? "subject-mismatch"
                  : "unavailable",
          }),
        );
      },
      (refresh) => refresh(liveSession),
    ).pipe(Atom.withServerValueInitial),
  );

  const call = Effect.fn("AuthAtom.call")(function* <Name extends keyof Actions>(
    name: Name,
    input: RouteInput<Actions[Name]["route"]>,
  ) {
    const instance = yield* client;

    return yield* instance.auth[AuthClientTypeId].call(name, input);
  }, reportAtomDefects);

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
      }).pipe(reportAtomDefects),
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

  // Object.fromEntries erases the relationship between action names, modes and payloads.
  const atoms = Object.fromEntries(
    Object.entries(actions).flatMap(([name, action]) => {
      if (action.mode === "mutation") return [[name, mutation(name)]];

      const query = Atom.family((input: RouteInput<Actions[string]["route"]>) => {
        if (name === "getSession" && input === undefined) return session;

        // A subject-discovering read must outlive the account registry it retires.
        // Other transitions still clear its result and restart the request.
        const source =
          action.subject !== undefined
            ? host.atom((get) =>
                Effect.gen(function* () {
                  const binding = yield* AuthAtomBinding;
                  const instance = yield* client;
                  const origin = {};

                  get.addFinalizer(
                    binding.subscribe((event) => {
                      get.setSelf(AsyncResult.initial(true));
                      if (event.origin !== origin) get.refreshSelf();
                    }),
                  );

                  return yield* instance.auth[AuthClientTypeId].call(name, input, { origin });
                }).pipe(reportAtomDefects),
              )
            : runtime.atom(call(name, input));

        return source.pipe(factory.withReactivity(queryKeys), Atom.withServerValueInitial);
      });

      const payloadSchema: Actions[string]["route"]["operation"]["rpc"]["payloadSchema"] =
        action.route.operation.rpc.payloadSchema;

      const payload = Schema.toEncoded(payloadSchema);
      const input: unknown = undefined;
      const acceptsDefault = Schema.is(payload)(input);

      const entries = [
        [
          name,
          acceptsDefault && (SchemaAST.isVoid(payload.ast) || SchemaAST.isUndefined(payload.ast))
            ? query(input)
            : query,
        ],
      ];

      if (name === "getSession")
        entries.push([
          "session",
          acceptsDefault
            ? query(input)
            : runtime.atom(Effect.fail(OperationHttpError.make({ reason: "request" }))),
        ]);

      return entries;
    }),
  ) as AuthActionAtoms<Actions, E>;

  const result: AuthAtoms<Id, Actions, E, R> = {
    ...atoms,
    client,
    runtime,
    identity,
    verifiedSession,
  };

  Object.freeze(result);

  return result;
};
