import { Context, Effect, Layer, Scope } from "effect";

import type { AuthInvocation } from "../operations/context";
import {
  AuthCredentialCommandCollector,
  AuthRevealCommandCollectorService,
} from "../operations/credentials";
import { AuthConfigurationError } from "./AuthConfigurationError";
import { AuthRequest } from "./AuthRequest";
import type { SessionApiError } from "./session";

/** The same validated invocations used by local and transport callers. */
export type AuthMethod = (
  invocation: AuthInvocation,
  input: never,
) => Effect.Effect<unknown, unknown, unknown>;

type RequestCollectorServices = AuthCredentialCommandCollector | AuthRevealCommandCollectorService;

const unsupportedRevealCollector = Object.freeze({
  supportedKinds: Object.freeze([]),
  accept: () => Effect.void,
});

type BoundMethod<M extends AuthMethod, Provided> = (
  ...args: [Parameters<M>[1]] extends [void]
    ? [input?: Parameters<M>[1]]
    : [input: Parameters<M>[1]]
) => Effect.Effect<
  Effect.Success<ReturnType<M>>,
  Effect.Error<ReturnType<M>> | SessionApiError,
  | AuthRequest
  | Exclude<
      Effect.Services<ReturnType<M>>,
      Exclude<Provided | RequestCollectorServices, AuthRequest | Scope.Scope>
    >
>;

/** Pair a selected, named API with its implementing Layer, preserving every method's types. */
export const makeAuthStrategy = <
  const Methods extends Readonly<Record<string, AuthMethod>>,
  Provided,
  E,
  R,
  const Completion extends boolean = false,
>(
  methods: Methods & { readonly then?: never } & Record<Exclude<keyof Methods, string>, never>,
  layer: Layer.Layer<Provided, E, R>,
  options?: { readonly completion: Completion },
) => {
  type Result = ReturnType<Methods[keyof Methods]>;

  // A heterogeneous method table loses its key correlation during iteration.
  const entries = Object.entries(methods) as Array<
    [
      string,
      (
        invocation: AuthInvocation,
        input: never,
      ) => Effect.Effect<Effect.Success<Result>, Effect.Error<Result>, Effect.Services<Result>>,
    ]
  >;

  return Object.freeze({
    completion: (options?.completion ?? false) as false | NoInfer<Completion>,
    make: Effect.gen(function* () {
      if (entries.some(([name]) => name === "then"))
        return yield* AuthConfigurationError.make({ reason: "method" });

      const built = yield* Layer.buildWithMemoMap(
        layer,
        yield* Layer.CurrentMemoMap,
        yield* Effect.scope,
      );

      const services = Context.omit(
        AuthRequest,
        Scope.Scope,
        AuthCredentialCommandCollector,
        AuthRevealCommandCollectorService,
      )(built);

      const bound = Object.fromEntries(
        entries.map(([name, invoke]) => [
          name,
          Effect.fn(`Auth.${name}`)(function* (input: never) {
            // Resolve before providing the shared handler context: callers never get captured.
            const request = yield* AuthRequest;

            // Raw strategy methods are conservatively mutations. Only a trusted
            // named query declaration can admit a read without mutation policy.
            if (request.actionMode !== "query" && request.beforeMutation !== undefined)
              yield* request.beforeMutation;

            const invocation = yield* (
              request.resolveInvocation ?? Effect.succeed(request.invocation)
            );

            const revealCollector = request.revealCommandCollector ?? unsupportedRevealCollector;

            return yield* invoke(invocation, input).pipe(
              Effect.provideService(AuthCredentialCommandCollector, request.credentialCommandSink),
              Effect.provideService(AuthRevealCommandCollectorService, revealCollector),
              Effect.provide(services),
            );
          }),
        ]),
      );

      // Object.entries loses the key/signature correlation; each method above retains its invoke.
      return Object.freeze(bound) as {
        readonly [K in keyof Methods]: BoundMethod<Methods[K], Provided>;
      };
    }),
  });
};
