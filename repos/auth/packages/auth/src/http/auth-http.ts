import {
  Schema,
  Context,
  type Types,
  type Unify,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Scope,
} from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApi, HttpApiBuilder, type HttpApiGroup, type HttpApiEndpoint } from "effect/http-api";

import { AuthRequest } from "../auth/AuthRequest";
import type { SessionApi, SessionApiError } from "../auth/session";
import { HookDenied } from "../hooks/models";
import { OperationHttpConfigurationError, OperationHttpError } from "../http-operation/errors";
import type { HttpCredentials, OperationHttpConfiguration } from "../http-operation/models";
import {
  invocationLayer,
  OperationHttpInvocation,
} from "../http-operation/OperationHttpInvocation";
import {
  configurationLayer,
  cookieConfiguration,
  OperationHttpServerConfig,
} from "../http-operation/OperationHttpServerConfig";
import { mutationSecurity, requestSecurity } from "../http-operation/security";
import { make as makeOperationServer } from "../http-operation/server";
import type { OAuthConnectedProtocol } from "../oauth/OAuthConnectedProtocol";
import type { OAuthProtocol } from "../oauth/OAuthProtocol";
import type { ProviderDefinition } from "../oauth/providerDefinition";
import type { ActionSuccess, AuthActions } from "../operations/actions";
import { guest } from "../operations/context";
import {
  type AuthCredentialCommand,
  AuthCredentialCommandCollector,
  AuthRevealCommandCollectorService,
} from "../operations/credentials";
import type { RequestBindingConfigurationError } from "../operations/requestBinding";
import type { RequestBindingConfig } from "../operations/RequestBindingConfig";
import { ProofUnavailable } from "../proofs/errors";
import { ProofRequestContext } from "../proofs/ProofRequestContext";
import type { SessionMetadata } from "../sessions/models";
import { httpGroup, matchesEndpoint } from "./auth-contract";
import { makeOAuth, type OAuthOptions } from "./oauth";
import type { makeSessionHttpContract } from "./session-contract";

const withProofRequestContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const supplied = yield* Effect.serviceOption(ProofRequestContext);
    const incoming = yield* HttpServerRequest.HttpServerRequest;

    const context = Option.isSome(supplied)
      ? supplied.value
      : Option.match(incoming.remoteAddress, {
          onNone: () => Effect.fail(ProofUnavailable.make({})),
          onSome: (address) => Effect.succeed({ networkKey: Redacted.make(address) }),
        });

    return yield* Effect.provideService(effect, ProofRequestContext, context);
  });

/** Browser transport policy. Secure names retain __Host-; insecure cookies are loopback-only. */
export interface AuthHttpOptions<E = never, R = never, ResponseR = never> {
  readonly origin: string;
  readonly maximumBodyBytes?: number;
  readonly maximumUrlBytes?: number;
  readonly cookie?: {
    readonly prefix?: string;
    readonly name?: string;
    readonly secure?: boolean;
    readonly sameSite?: "lax" | "strict";
  };
  readonly csrf?: { readonly header: string; readonly value: string };
  readonly oauth?: OAuthOptions<E, R, ResponseR>;
}

type OAuthConfiguration<O> = O extends { readonly oauth?: infer C } ? Exclude<C, undefined> : never;
type ProviderError<O> = [OAuthConfiguration<O>] extends [never]
  ? never
  : OAuthConfiguration<O> extends {
        readonly providers: Readonly<Record<string, ProviderDefinition<infer E, unknown>>>;
      }
    ? E
    : never;
type ProviderServices<O> = [OAuthConfiguration<O>] extends [never]
  ? never
  : OAuthConfiguration<O> extends {
        readonly providers: Readonly<Record<string, ProviderDefinition<unknown, infer R>>>;
      }
    ? R
    : never;
type ResponseFunctionServices<F> = F extends (
  ...args: never[]
) => Effect.Effect<unknown, unknown, infer R>
  ? R
  : never;
type ResponseRequirement<C> =
  C extends ReadonlyArray<infer Entry>
    ? ResponseRequirement<Entry>
    : C extends { readonly respond?: infer F }
      ? ResponseFunctionServices<Exclude<F, undefined>>
      : never;
type CallbackServices<C> = C extends { readonly callbacks?: infer Callbacks }
  ? ResponseRequirement<NonNullable<Callbacks>[keyof NonNullable<Callbacks>]>
  : never;
type ResponseServices<O> =
  | ResponseRequirement<OAuthConfiguration<O>>
  | CallbackServices<OAuthConfiguration<O>>;
type OAuthConfigured<O, A> = [OAuthConfiguration<O>] extends [never] ? never : A;
type OAuthProvided<O> = O extends { readonly oauth: OAuthOptions<unknown, unknown, unknown> }
  ? OAuthProtocol | OAuthConnectedProtocol
  : never;

/** Mount the shared auth actions and OAuth callbacks with their configured services.
 * Supply application-owned persistence and account services through Layer.provide.
 */
export const layer = <
  I,
  S extends SessionMetadata,
  RE,
  Api extends SessionApi<S, unknown>,
  Actions extends AuthActions,
  AE,
  AR,
  const Options extends AuthHttpOptions<unknown, unknown, unknown>,
>(
  auth: Omit<Context.Key<I, Api>, typeof Unify.unifySymbol> & {
    readonly sessions: { readonly Session: Schema.Codec<S, unknown, unknown, RE> };
    readonly contract: { readonly basePath?: string; readonly actions: Actions };
    readonly layer: Layer.Layer<I, AE, AR>;
  },
  options: Options,
) => {
  const http = make(auth, options);

  return http.routes().pipe(Layer.provide(http.layer));
};

/** Build handlers and middleware for custom HTTP composition. Use layer for standalone mounting.
 * Mutation admission checks Origin and CSRF before effects. Generated operation
 * handlers independently require JSON; custom protected workflows choose their encoding.
 * The application owns session policy, persistence and profile lookup.
 */
export const make = <
  I,
  S extends SessionMetadata,
  RE,
  Api extends SessionApi<S, unknown>,
  Actions extends AuthActions,
  AE,
  AR,
  const Options extends AuthHttpOptions<unknown, unknown, unknown>,
>(
  auth: Omit<Context.Key<I, Api>, typeof Unify.unifySymbol> & {
    readonly sessions: { readonly Session: Schema.Codec<S, unknown, unknown, RE> };
    readonly contract: { readonly basePath?: string; readonly actions: Actions };
    readonly layer: Layer.Layer<I, AE, AR>;
  },
  options: Options,
) => {
  // The conditional types retain the concrete declarations' errors and services.
  const oauth =
    options.oauth === undefined
      ? undefined
      : makeOAuth<ProviderError<Options>, ProviderServices<Options>, ResponseServices<Options>>(
          options.oauth as OAuthOptions<
            ProviderError<Options>,
            ProviderServices<Options>,
            ResponseServices<Options>
          >,
          options.origin,
          auth.contract.basePath ?? "/auth",
          auth.contract.actions,
        );

  const layer = (
    oauth === undefined ? auth.layer : auth.layer.pipe(Layer.provideMerge(oauth.layer))
  ) as Layer.Layer<
    I | OAuthProvided<Options>,
    AE | ProviderError<Options> | OAuthConfigured<Options, OperationHttpConfigurationError>,
    Exclude<AR, OAuthProvided<Options>> | Exclude<ProviderServices<Options>, Scope.Scope>
  >;

  const secure = options.cookie?.secure ?? true;

  const cookies = cookieConfiguration({
    prefix: options.cookie?.prefix ?? (secure ? "__Host-effect-auth-" : "effect-auth-"),
    secure,
    sameSite: options.cookie?.sameSite ?? "lax",
  });

  const sessionCookieName = options.cookie?.name ?? cookies.session.name;

  const configuration =
    (secure &&
      (!cookies.session.name.startsWith("__Host-") || !sessionCookieName.startsWith("__Host-"))) ||
    (!secure && options.origin.startsWith("https:")) ||
    (options.oauth !== undefined && options.cookie?.sameSite === "strict")
      ? Layer.effect(
          OperationHttpServerConfig,
          Effect.fail(OperationHttpConfigurationError.make({ reason: "cookies" })),
        )
      : configurationLayer({
          publicOrigin: options.origin,
          trustedOrigins: [options.origin],
          cookies: {
            ...cookies,
            session: { ...cookies.session, name: sessionCookieName },
          },
          csrfHeader: options.csrf?.header ?? "x-effect-auth-csrf",
          csrfValue: options.csrf?.value ?? "1",
          maximumBodyBytes: options.maximumBodyBytes ?? 65536,
          maximumUrlBytes: options.maximumUrlBytes ?? 8192,
        });

  const resolve = (
    api: Pick<SessionApi<S>, "verifySession">,
    credential: Redacted.Redacted<string> | undefined,
  ) =>
    credential === undefined
      ? Effect.succeed(guest)
      : api.verifySession(credential).pipe(
          Effect.map((session) => ({
            _tag: "Authenticated" as const,
            subjectId: session.subjectId,
            sessionId: session.sessionId,
            assurance: session.assurance,
          })),
          Effect.catchTag("SessionInvalid", () => Effect.succeed(guest)),
        );

  /** Existing operation contracts retain private predecode injection and their wire format. */
  const operationLayer = Layer.merge(
    configuration,
    invocationLayer(
      Effect.fn("AuthHttp.invocation")(function* (_request, credentials) {
        const api = yield* auth;

        return yield* resolve(api, credentials.session).pipe(
          Effect.mapError(() => OperationHttpError.make({ reason: "unavailable" })),
        );
      }),
    ),
  );

  /** Implement shared HttpApi session security using the validated outer request context. */
  const securityLayer = <
    const Id extends string,
    ContractSchema extends Schema.Codec<S, unknown, unknown, RE>,
  >(
    contract: ReturnType<typeof makeSessionHttpContract<Id, ContractSchema>>,
  ) =>
    Layer.effect(
      contract.RequireSession,
      Effect.gen(function* () {
        if (contract.cookieName !== sessionCookieName) {
          return yield* OperationHttpConfigurationError.make({ reason: "cookies" });
        }
        const api = yield* auth;

        const services = (yield* Effect.context<
          Exclude<Effect.Services<ReturnType<Api["requireSession"]>>, AuthRequest>
        >()).pipe(
          Context.omit(
            AuthRequest,
            Scope.Scope,
            AuthCredentialCommandCollector,
            AuthRevealCommandCollectorService,
          ),
        );

        return contract.RequireSession.of({
          session: Effect.fn("AuthHttp.requireSession")(function* (httpEffect) {
            // HttpApiBuilder treats middleware.requires as a construction dependency.
            // This exact Effect runs only inside the request security handler, so
            // expose its AuthRequest requirement through the router request marker.
            const required = api
              .requireSession()
              .pipe(Effect.provide(services)) as unknown as Effect.Effect<
              S,
              SessionApiError,
              HttpRouter.Request.From<"Requires", AuthRequest>
            >;

            const session = yield* required;

            return yield* Effect.provideService(httpEffect, contract.CurrentSession, session);
          }),
        });
      }),
    );

  const wrap = (api: Api, config: OperationHttpConfiguration) =>
    Effect.fn("AuthHttp.request")(function* <E, R>(
      effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
    ) {
      const incoming = yield* HttpServerRequest.HttpServerRequest;

      const request = yield* HttpServerRequest.toWeb(incoming).pipe(
        Effect.mapError(() => OperationHttpError.make({ reason: "request" })),
      );

      if (new TextEncoder().encode(request.url).byteLength > config.maximumUrlBytes) {
        return yield* OperationHttpError.make({ reason: "too-large" });
      }

      const security = yield* requestSecurity(request, "request").pipe(
        Effect.provideService(OperationHttpServerConfig, config),
      );

      const commands: AuthCredentialCommand[] = [];
      let mutationAdmitted = false;

      const beforeMutation = mutationSecurity(request).pipe(
        Effect.provideService(OperationHttpServerConfig, config),
        Effect.mapError(() => HookDenied.make({ reason: "policy" })),
        Effect.tap(() =>
          Effect.sync(() => {
            mutationAdmitted = true;
          }),
        ),
      );

      const sink = (values: ReadonlyArray<AuthCredentialCommand>) =>
        Effect.sync(() => {
          if (!mutationAdmitted)
            throw new Error("Credential delivery requires an admitted mutation");
          commands.push(...values);
        });

      const resolveInvocation = resolve(api, security.credentials.session);

      let response = yield* effect.pipe(
        Effect.provideService(auth, api),
        Effect.provideService(AuthRequest, {
          invocation: guest,
          credentials: security.credentials,
          resolveInvocation,
          beforeMutation,
          credentialCommandSink: sink,
        }),
        withProofRequestContext,
      );

      const now = DateTime.toEpochMillis(yield* DateTime.now);

      for (const command of commands) {
        const cookie = config.cookies[command.slot];

        response = yield* HttpServerResponse.setCookie(
          response,
          cookie.name,
          command._tag === "Issue" ? Redacted.value(command.credential) : "",
          {
            ...cookie,
            httpOnly: true,
            maxAge: Duration.millis(
              command._tag === "Issue" ? Math.max(0, command.expiresAtMillis - now) : 0,
            ),
          },
        ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "response" })));
      }

      return HttpServerResponse.setHeader(response, "cache-control", "no-store");
    });

  const requestLayer = HttpRouter.middleware<{
    provides: I | AuthRequest | ProofRequestContext;
  }>()(
    Effect.gen(function* () {
      const api = yield* auth;
      const config = yield* OperationHttpServerConfig;

      return (
        effect,
      ): Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        Types.unhandled,
        HttpServerRequest.HttpServerRequest
      > =>
        wrap(
          api,
          config,
        )(effect).pipe(
          Effect.catchTag("OperationHttpError", (error) =>
            HttpServerResponse.schemaJson(OperationHttpError)(error, {
              status:
                error.reason === "origin" || error.reason === "csrf"
                  ? 403
                  : error.reason === "too-large"
                    ? 413
                    : 400,
              headers: { "cache-control": "no-store" },
            }).pipe(Effect.orDie),
          ),
        );
    }),
  ).layer.pipe(Layer.provide(configuration));

  /** Apply to raw HttpRouter or HttpApi route Layers. Authentication is explicit in handlers. */
  const middleware = Layer.provide(requestLayer);

  /** Admit a custom mutation before it runs; body encoding remains application-owned. */
  const protect = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const request = yield* AuthRequest;

      if (request.beforeMutation !== undefined) yield* request.beforeMutation;

      return yield* effect.pipe(
        Effect.provideService(AuthCredentialCommandCollector, request.credentialCommandSink),
        Effect.provideService(AuthRevealCommandCollectorService, {
          supportedKinds: [],
          accept: () =>
            Effect.die(new Error("Private reveals require an explicit operation route")),
        }),
      );
    });

  /** Wrap a custom response workflow, keeping all credential delivery request-local. */
  const withRequest = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const api = yield* auth;
      const config = yield* OperationHttpServerConfig;

      return yield* wrap(api, config)(effect);
    }).pipe(Effect.provide(configuration));

  /** Mount the shared contract. Each route calls the same local method, and
   * request credentials are installed before that method executes. Paths belong
   * to the contract so server and client cannot configure them independently. */
  const makeServer = () => {
    type Call = Extract<
      Api[Extract<keyof Actions, keyof Api>],
      (...args: never[]) => Effect.Effect<unknown, unknown, unknown>
    >;
    type Result = ReturnType<Call>;
    type Mounted = {
      readonly [Name in keyof Actions]: Omit<Actions[Name]["route"], "operation"> & {
        readonly operation: Omit<Actions[Name]["route"]["operation"], "invokeUnknown"> & {
          readonly invokeUnknown: (
            invocation: unknown,
            input: unknown,
          ) => Effect.Effect<
            ActionSuccess<Actions[Name]>,
            Effect.Error<Result>,
            I | Effect.Services<Result>
          >;
        };
      };
    };

    const table = Object.fromEntries(
      Object.entries(auth.contract.actions).map(([name, action]) => [
        name,
        {
          ...action.route,
          operation: {
            ...action.route.operation,
            invokeUnknown: (_invocation: unknown, input: unknown) =>
              Effect.gen(function* () {
                const api = yield* auth;

                // This table contains the exact methods bound from auth.contract.
                const invoke = api[name as keyof Api] as (
                  input: unknown,
                ) => Effect.Effect<
                  Effect.Success<Result>,
                  Effect.Error<Result>,
                  Effect.Services<Result>
                >;

                return yield* invoke(input);
              }),
          },
        },
      ]),
    ) as Mounted;

    const requestInvocation = Layer.effect(
      OperationHttpInvocation,
      Effect.gen(function* () {
        const api = yield* auth;

        return {
          resolve: () => Effect.succeed(guest),
          request: (_request: Request, credentials: HttpCredentials) =>
            resolve(api, credentials.session),
        };
      }),
    );

    const server = Effect.gen(function* () {
      const api = yield* auth;
      const callbacks = oauth === undefined ? [] : yield* oauth.callbacks(table);
      const server = yield* makeOperationServer({ routes: table }, { callbacks });

      return {
        handle: (request: Request) =>
          server.handle(request).pipe(Effect.provideService(auth, api), withProofRequestContext),
        callbackPaths: callbacks.map((callback) => callback.path),
      };
    }).pipe(Effect.provide([configuration, requestInvocation]));

    // Binding configuration is acquired only by the configured OAuth branch.
    return server as Effect.Effect<
      Effect.Success<typeof server>,
      | Exclude<Effect.Error<typeof server>, RequestBindingConfigurationError>
      | OAuthConfigured<Options, RequestBindingConfigurationError>,
      | Exclude<Effect.Services<typeof server>, RequestBindingConfig>
      | OAuthConfigured<Options, RequestBindingConfig>
    >;
  };

  /** Implement the AuthContract.httpGroup mounted in the consumer's HttpApi.
   * Raw handlers preserve private input rejection and bounded decoding before
   * any schema can project away unknown fields. There is one transport engine.
   */
  const handlers = <
    ApiId extends string,
    Groups extends HttpApiGroup.Constraint,
    const Name extends HttpApiGroup.Identifier<Groups> = Extract<
      HttpApiGroup.Identifier<Groups>,
      "auth"
    >,
  >(
    api: HttpApi.HttpApi<ApiId, Groups>,
    options?: { readonly name?: Name },
  ) => {
    const name = (options?.name ?? "auth") as Name;

    type Mounted = HttpApiGroup.WithIdentifier<Groups, Name>;
    type Endpoint = HttpApiGroup.Endpoints<Mounted>;
    type InvocationServices = Effect.Services<
      ReturnType<Effect.Success<ReturnType<typeof makeServer>>["handle"]>
    >;
    type Requirements<E extends HttpApiEndpoint.Constraint> = E extends HttpApiEndpoint.Constraint
      ?
          | HttpApiEndpoint.Middleware<E>
          | HttpApiEndpoint.MiddlewareServices<E>
          | HttpRouter.Request.From<
              "Requires",
              HttpApiEndpoint.ExcludeProvided<
                E,
                | InvocationServices
                | HttpApiEndpoint.ServerServices<E>
                | HttpServerRequest.HttpServerRequest
              >
            >
      : never;

    return HttpApiBuilder.group(
      api,
      name,
      Effect.fn("AuthHttp.handlers")(function* (handlers) {
        const mounted = (Object.values(api.groups) as HttpApiGroup.Top[]).find(
          (candidate) => candidate.identifier === name,
        );

        if (
          mounted === undefined ||
          Object.keys(mounted.endpoints).length !== Object.keys(auth.contract.actions).length
        )
          return yield* OperationHttpConfigurationError.make({ reason: "route" });
        for (const [name, action] of Object.entries(auth.contract.actions)) {
          const actual = mounted.endpoints[name];

          if (actual === undefined || !matchesEndpoint(actual, action))
            return yield* OperationHttpConfigurationError.make({ reason: "route" });
        }
        const server = yield* makeServer();

        for (const name of Object.keys(auth.contract.actions)) {
          handlers.handleRaw(name as Parameters<typeof handlers.handleRaw>[0], () =>
            Effect.gen(function* () {
              const request = yield* HttpServerRequest.toWeb(
                yield* HttpServerRequest.HttpServerRequest,
              ).pipe(Effect.orDie);

              return HttpServerResponse.fromWeb(yield* server.handle(request));
            }),
          );
        }

        // handleRaw registers in place; the loop covers every named endpoint.
        return handlers as HttpApiBuilder.Handlers<
          Requirements<Endpoint>,
          Mounted["endpoints"],
          keyof Mounted["endpoints"]
        >;
      }),
    );
  };

  /** Unprovided routes for custom service composition. layer(auth, options) supplies
   * the configured auth and OAuth services automatically. */
  const routes = () => {
    const api = HttpApi.make(`${auth.key}/http`).add(httpGroup(auth.contract));

    return Layer.merge(
      HttpApiBuilder.layer(api).pipe(Layer.provide(handlers(api))),
      callbackRoutes(),
    );
  };

  /** Mount these alongside handlers(api) when composing an existing HttpApi.
   * routes() already includes them. Callback GETs use state/binding admission. */
  const callbackRoutes = () =>
    Layer.unwrap(
      Effect.gen(function* () {
        const server = yield* makeServer();

        return HttpRouter.addAll(
          server.callbackPaths.map((path) =>
            HttpRouter.route(
              "GET",
              Schema.decodeUnknownSync(Schema.TemplateLiteral(["/", Schema.String]))(path),
              Effect.gen(function* () {
                const request = yield* HttpServerRequest.toWeb(
                  yield* HttpServerRequest.HttpServerRequest,
                ).pipe(Effect.orDie);

                return HttpServerResponse.fromWeb(yield* server.handle(request));
              }),
            ),
          ),
        );
      }),
    );

  return {
    routes,
    handlers,
    layer,
    callbackRoutes,
    oauth: {
      callbackUrl: (provider: string, callbackId?: string) => {
        if (oauth === undefined) throw OperationHttpConfigurationError.make({ reason: "callback" });

        return oauth.callbackUrl(provider, callbackId);
      },
    },
    middleware,
    withRequest,
    operationLayer,
    securityLayer,
    protect,
  };
};
