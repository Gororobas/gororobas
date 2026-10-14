import type { Hmac } from "@yielded/crypto/Hmac";
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
import {
  type Cookies,
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { HttpApi, HttpApiBuilder, type HttpApiGroup, type HttpApiEndpoint } from "effect/http-api";

import { AuthRequest } from "../auth/AuthRequest";
import type { SessionApi, SessionApiError } from "../auth/session";
import { HookDenied } from "../hooks/models";
import { OperationHttpConfigurationError, OperationHttpError } from "../http-operation/errors";
import type { HttpCredentials, OperationHttpConfiguration } from "../http-operation/models";
import { OperationHttpInvocation } from "../http-operation/OperationHttpInvocation";
import {
  configurationLayer,
  cookieConfiguration,
  OperationHttpServerConfig,
} from "../http-operation/OperationHttpServerConfig";
import { mutationSecurity, requestSecurity } from "../http-operation/security";
import { make as makeOperationServer } from "../http-operation/server";
import { rotationCookies, snapshotCookie } from "../http-operation/session-cache-cookie";
import { withoutObservability } from "../internal/diagnostics";
import { cookieDomain, httpsOrigin, origin, originWithinDomain } from "../internal/origin";
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
import { OperationOutputError } from "../operations/errors";
import type { RequestBindingConfigurationError } from "../operations/requestBinding";
import type { RequestBindingConfig } from "../operations/RequestBindingConfig";
import { ProofUnavailable } from "../proofs/errors";
import { ProofRequestContext } from "../proofs/ProofRequestContext";
import { sessionCacheTransport } from "../sessions/cookieCache";
import {
  cacheSessionInvocation,
  SessionVerificationCapture,
  withSessionRequest,
} from "../sessions/invocation";
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

/** Browser transport policy. Domain cookies require Secure and trust every subdomain.
 * Never host user- or AI-generated content there; audit dangling DNS, verify sessions
 * server-side and retain Origin/CSRF admission on mutations. */
export interface AuthHttpOptions<E = never, R = never, ResponseR = never> {
  readonly origin: string;
  /** Additional exact HTTPS origins, within cookie.domain if set. Host-only HTTP
   * loopback deployments with secure: false also admit HTTP loopback origins. */
  readonly trustedOrigins?: ReadonlyArray<string>;
  readonly maximumBodyBytes?: number;
  readonly maximumUrlBytes?: number;
  readonly cookie?: {
    /** Bare parent host shared by all auth cookies. Defaults to host-only cookies.
     * With a domain, names use __Secure-; __Host- and secure: false fail startup. */
    readonly domain?: string;
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
    readonly sessions: {
      readonly moduleId: string;
      readonly Session: Schema.Codec<S, unknown, unknown, RE>;
    };
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
    readonly sessions: {
      readonly moduleId: string;
      readonly Session: Schema.Codec<S, unknown, unknown, RE>;
    };
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

  // OAuthConfigured mirrors the branch below; only configured OAuth providers contribute errors and supply OAuth services.
  // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
  const layer = (
    oauth === undefined ? auth.layer : auth.layer.pipe(Layer.provideMerge(oauth.layer))
  ) as Layer.Layer<
    I | OAuthProvided<Options>,
    AE | ProviderError<Options> | OAuthConfigured<Options, OperationHttpConfigurationError>,
    Exclude<AR, OAuthProvided<Options>> | Exclude<ProviderServices<Options>, Scope.Scope>
  >;

  const secure = options.cookie?.secure ?? true;

  const domain = options.cookie?.domain;
  const requiredPrefix = domain === undefined ? "__Host-" : "__Secure-";

  const cookies = cookieConfiguration({
    ...(domain === undefined ? {} : { domain }),
    prefix: options.cookie?.prefix ?? (secure ? `${requiredPrefix}effect-auth-` : "effect-auth-"),
    secure,
    sameSite: options.cookie?.sameSite ?? "lax",
  });

  const sessionCookieName = options.cookie?.name ?? cookies.session.name;

  const configuration = Layer.unwrap(
    Effect.gen(function* () {
      if (domain !== undefined) {
        yield* Schema.decodeEffect(cookieDomain)(domain).pipe(
          Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "cookies" })),
        );
      }
      if (
        (secure &&
          (!cookies.session.name.startsWith(requiredPrefix) ||
            !sessionCookieName.startsWith(requiredPrefix))) ||
        (domain !== undefined && !secure) ||
        (!secure && options.origin.startsWith("https:")) ||
        (options.oauth !== undefined && options.cookie?.sameSite === "strict")
      )
        return yield* OperationHttpConfigurationError.make({ reason: "cookies" });

      yield* Schema.decodeEffect(domain === undefined ? origin : httpsOrigin)(options.origin).pipe(
        Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "origin" })),
      );

      const additionalOrigin =
        domain === undefined && !secure && options.origin.startsWith("http:")
          ? Schema.Union([httpsOrigin, origin.check(Schema.isPattern(/^http:/))])
          : httpsOrigin;

      const additional = yield* Schema.decodeEffect(Schema.Array(additionalOrigin))(
        options.trustedOrigins ?? [],
      ).pipe(Effect.mapError(() => OperationHttpConfigurationError.make({ reason: "origin" })));

      const trustedOrigins = [...new Set([options.origin, ...additional])];

      if (
        domain !== undefined &&
        !trustedOrigins.every((value) => originWithinDomain(value, domain))
      )
        return yield* OperationHttpConfigurationError.make({ reason: "origin" });

      return configurationLayer({
        publicOrigin: options.origin,
        trustedOrigins,
        cookies: {
          ...cookies,
          session: { ...cookies.session, name: sessionCookieName },
        },
        csrfHeader: options.csrf?.header ?? "x-effect-auth-csrf",
        csrfValue: options.csrf?.value ?? "1",
        maximumBodyBytes: options.maximumBodyBytes ?? 65536,
        maximumUrlBytes: options.maximumUrlBytes ?? 8192,
      });
    }),
  );

  const resolve = (
    api: Pick<SessionApi<S>, "verifySession">,
    credential: Redacted.Redacted<string> | undefined,
  ) =>
    Effect.gen(function* () {
      if (credential === undefined) return guest;
      const capture = yield* Effect.serviceOption(SessionVerificationCapture);
      const now = DateTime.toEpochMillis(yield* DateTime.now);

      const original =
        Option.isSome(capture) && capture.value.isActive()
          ? capture.value.sessions.findLast(
              (value) =>
                value.moduleId === auth.sessions.moduleId &&
                Redacted.value(value.credential) === Redacted.value(credential) &&
                now < value.expiresAtMillis &&
                now < value.absoluteExpiresAtMillis,
            )
          : undefined;

      const session =
        original ??
        (yield* api
          .verifySession(credential)
          .pipe(Effect.catchTag("SessionInvalid", () => Effect.succeed(null))));

      return session === null
        ? guest
        : {
            _tag: "Authenticated" as const,
            subjectId: session.subjectId,
            sessionId: session.sessionId,
            assurance: session.assurance,
          };
    });

  /** Existing operation contracts retain private predecode injection and their wire format. */
  const operationLayer = Layer.merge(
    configuration,
    Layer.effect(
      OperationHttpInvocation,
      Effect.gen(function* () {
        const api = yield* auth;
        const cacheTransport = api[sessionCacheTransport];

        return {
          ...(cacheTransport === undefined ? {} : { [sessionCacheTransport]: cacheTransport }),
          resolve: Effect.fn("AuthHttp.invocation")(function* (
            _request: Request,
            credentials: HttpCredentials,
          ) {
            return yield* resolve(api, credentials.session).pipe(
              Effect.mapError(() => OperationHttpError.make({ reason: "unavailable" })),
            );
          }),
        };
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
          withoutObservability,
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
            // @effect-diagnostics-next-line anyUnknownInErrorContext:off
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
      const mutationCookies: Cookies.Cookie[] = [];
      const cacheTransport = security.native ? undefined : api[sessionCacheTransport];
      let mutationAdmitted = false;

      const rotateCache = yield* Effect.cached(
        Effect.gen(function* () {
          if (cacheTransport === undefined) return;
          const generation = yield* cacheTransport.rotate;

          mutationCookies.push(
            ...(yield* rotationCookies(
              config.cookies["session-cache"],
              generation,
              cacheTransport.lifetimeMillis,
            )),
          );
        }),
      );

      const beforeMutation = yield* Effect.cached(
        mutationSecurity(request).pipe(
          Effect.provideService(OperationHttpServerConfig, config),
          Effect.mapError(() => HookDenied.make({ reason: "policy" })),
          Effect.andThen(
            Effect.gen(function* () {
              yield* rotateCache;
              mutationAdmitted = true;
            }).pipe(Effect.mapError(() => HookDenied.make({ reason: "unavailable" }))),
          ),
        ),
      );

      const sink = Effect.fnUntraced(function* (values: ReadonlyArray<AuthCredentialCommand>) {
        if (!mutationAdmitted) return yield* Effect.die(OperationOutputError.make({}));
        commands.push(...values);
      });

      const resolveInvocation = yield* cacheSessionInvocation(
        resolve(api, security.credentials.session),
      );

      return yield* Effect.gen(function* () {
        let response = yield* effect.pipe(
          Effect.provideService(auth, api),
          Effect.provideService(AuthRequest, {
            invocation: guest,
            credentials: security.credentials,
            // Only named actions grant query mode; other HTTP methods stay fresh.
            ...(["GET", "HEAD"].includes(request.method)
              ? {}
              : { actionMode: "mutation" as const }),
            ...(security.sessionCacheGeneration === undefined
              ? {}
              : { sessionCacheGeneration: security.sessionCacheGeneration }),
            resolveInvocation,
            beforeMutation,
            credentialCommandSink: sink,
            ...(cacheTransport === undefined
              ? {}
              : {
                  initializeSessionCache: rotateCache,
                  sessionCacheCommandSink: (command) =>
                    Effect.sync(() => {
                      commands.push(command);
                    }),
                }),
          }),
          withProofRequestContext,
        );

        const now = DateTime.toEpochMillis(yield* DateTime.now);

        for (const command of commands) {
          const cookie = config.cookies[command.slot];

          if (command.slot === "session-cache") {
            if (cacheTransport === undefined) continue;
            const snapshot = yield* snapshotCookie(cookie, command, now);

            if (snapshot !== undefined)
              response = yield* HttpServerResponse.setCookie(
                response,
                snapshot.name,
                snapshot.value,
                snapshot.options,
              ).pipe(Effect.orDie);
            continue;
          }

          const sameSite =
            command._tag === "Issue" && command.sameSite === "none" ? "none" : cookie.sameSite;

          if (sameSite === "none" && !cookie.secure)
            return yield* OperationHttpError.make({ reason: "credentials" });

          response = yield* HttpServerResponse.setCookie(
            response,
            cookie.name,
            command._tag === "Issue" ? Redacted.value(command.credential) : "",
            {
              ...cookie,
              sameSite,
              httpOnly: true,
              maxAge: Duration.millis(
                command._tag === "Issue" ? Math.max(0, command.expiresAtMillis - now) : 0,
              ),
            },
          ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "response" })));
        }

        for (const cookie of mutationCookies)
          response = yield* HttpServerResponse.setCookie(
            response,
            cookie.name,
            cookie.value,
            cookie.options,
          ).pipe(Effect.orDie);

        return HttpServerResponse.setHeader(response, "cache-control", "no-store");
      }).pipe(
        Effect.tapCause(() => {
          if (cacheTransport === undefined) return Effect.void;

          const clearSnapshot = commands.some(
            (command) => command.slot === "session-cache" && command._tag === "Clear",
          );

          if (mutationCookies.length === 0 && !clearSnapshot) return Effect.void;

          // Errors are rendered outside this middleware, including failures during
          // cookie delivery. Preserve invalidation only, never credential issuance.
          return HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.gen(function* () {
              if (clearSnapshot && mutationCookies.length === 0) {
                const clear = yield* snapshotCookie(
                  config.cookies["session-cache"],
                  { _tag: "Clear", slot: "session-cache" },
                  0,
                );

                if (clear !== undefined)
                  response = yield* HttpServerResponse.setCookie(
                    response,
                    clear.name,
                    clear.value,
                    clear.options,
                  ).pipe(Effect.orDie);
              }
              for (const cookie of mutationCookies)
                response = yield* HttpServerResponse.setCookie(
                  response,
                  cookie.name,
                  cookie.value,
                  cookie.options,
                ).pipe(Effect.orDie);

              return response;
            }),
          );
        }),
      );
    }, withSessionRequest);

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
          accept: () => Effect.die(OperationOutputError.make({})),
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

        const cacheTransport = api[sessionCacheTransport];

        return {
          ...(cacheTransport === undefined ? {} : { [sessionCacheTransport]: cacheTransport }),
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

    // Binding configuration and signing are acquired only by the configured OAuth branch.
    // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
    return server as Effect.Effect<
      Effect.Success<typeof server>,
      | Exclude<Effect.Error<typeof server>, RequestBindingConfigurationError>
      | OAuthConfigured<Options, RequestBindingConfigurationError>,
      | Exclude<Effect.Services<typeof server>, RequestBindingConfig | Hmac>
      | OAuthConfigured<Options, RequestBindingConfig | Hmac>
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
   * routes() already includes them. GET and POST both reach the operation
   * server. POST carries a form_post body on the same path. */
  const callbackRoutes = () =>
    Layer.unwrap(
      Effect.gen(function* () {
        const server = yield* makeServer();

        return HttpRouter.addAll(
          server.callbackPaths.flatMap((path) => {
            const template = Schema.decodeUnknownSync(Schema.TemplateLiteral(["/", Schema.String]))(
              path,
            );

            const handler = Effect.gen(function* () {
              const request = yield* HttpServerRequest.toWeb(
                yield* HttpServerRequest.HttpServerRequest,
              ).pipe(Effect.orDie);

              return HttpServerResponse.fromWeb(yield* server.handle(request));
            });

            return [
              HttpRouter.route("GET", template, handler),
              HttpRouter.route("POST", template, handler),
            ];
          }),
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
        if (oauth === undefined)
          // oxlint-disable-next-line effect/no-untyped-throw -- Public synchronous callback URL lookup rejects missing OAuth configuration.
          throw OperationHttpConfigurationError.make({ reason: "callback" });

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
