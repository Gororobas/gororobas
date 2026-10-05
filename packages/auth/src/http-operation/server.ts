import {
  Cause,
  Context,
  DateTime,
  Duration,
  Effect,
  Redacted,
  Schema,
  SchemaAST,
  Scope,
} from "effect";
import { Cookies } from "effect/http";

import { AuthRequest } from "../auth/AuthRequest";
import { HookDenied } from "../hooks/models";
import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthInvocation } from "../operations/context";
import {
  AuthCredentialCommandCollector,
  AuthRevealCommandCollectorService,
  type AuthCredentialCommand,
} from "../operations/credentials";
import type { AuthRevealCommand } from "../operations/reveals";
import {
  type AnyRoute,
  HttpRequestBody,
  type RouteRequirements,
  type RouteSuccess,
  type RouteFailure,
} from "./contract";
import { OperationHttpConfigurationError, OperationHttpError } from "./errors";
import type { HttpCredentials, OperationHttpConfiguration } from "./models";
import { OperationHttpInvocation } from "./OperationHttpInvocation";
import { OperationHttpServerConfig } from "./OperationHttpServerConfig";
import { CredentialWire, RevealWire, credentialWire, revealWire } from "./private";
import { requestSecurity } from "./security";

const responseSchema = Schema.Union([
  Schema.TaggedStruct("Success", {
    value: Schema.optionalKey(Schema.Json),
    private: Schema.optionalKey(Schema.Array(RevealWire)),
  }),
  Schema.TaggedStruct("Failure", { error: Schema.Json }),
  Schema.TaggedStruct("TransportFailure", { reason: Schema.String }),
]);

const encodeResponse = Schema.encodeEffect(Schema.fromJsonString(responseSchema));
const encodeCredential = Schema.encodeSync(Schema.fromJsonString(CredentialWire));

export interface OAuthHttpCallback<R = never> {
  readonly route: AnyRoute;
  readonly path: string;
  readonly provider: string;
  readonly callbackId: string;
  /** Resolve the original public flow ID from application-owned callback custody.
   * The operation independently authenticates its state and private request binder. */
  readonly flowId: (
    request: Request,
    credentials: HttpCredentials,
  ) => Effect.Effect<string, OperationHttpError>;
  readonly allowedRedirectOrigins: ReadonlyArray<string>;
  readonly allowedQueryParameters?: ReadonlyArray<string>;
  /** Named Auth actions read the private binder from AuthRequest themselves. */
  readonly requestBinding?: "context";
  /** Override the default returnTarget redirect using the schema-encoded result.
   * Credential delivery and non-cacheable response headers remain host-owned. */
  readonly respond?: (
    value: Schema.Json | undefined,
    input: { readonly flowId: string; readonly provider: string; readonly callbackId: string },
  ) => Effect.Effect<Response, OperationHttpError, R>;
}

export const oauthCallback = <R extends AnyRoute, ResponseR = never>(
  route: R,
  options: Omit<OAuthHttpCallback<ResponseR>, "route">,
): OAuthHttpCallback<ResponseR> & { readonly route: R } => {
  if (
    !options.path.startsWith("/") ||
    options.path.includes("?") ||
    (options.requestBinding !== "context" &&
      !Object.values(route.credentials).includes("request-binding")) ||
    route.operation.replay !== "single-use"
  )
    throw OperationHttpConfigurationError.make({ reason: "callback" });

  return Object.freeze({
    ...options,
    route,
    allowedRedirectOrigins: Object.freeze([...options.allowedRedirectOrigins]),
    ...(options.allowedQueryParameters === undefined
      ? {}
      : { allowedQueryParameters: Object.freeze([...options.allowedQueryParameters]) }),
  });
};

const boundedText = Effect.fn("OperationHttp.boundedText")(function* (
  request: Request,
  maximum: number,
) {
  return yield* Effect.tryPromise({
    try: async (signal) => {
      if (request.body === null) return "";
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;

      const abort = () => {
        void reader.cancel();
      };

      signal.addEventListener("abort", abort, { once: true });
      try {
        while (true) {
          const next = await reader.read();

          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > maximum) {
            await reader.cancel();
            throw OperationHttpError.make({ reason: "too-large" });
          }
          chunks.push(next.value);
        }
        const output = new Uint8Array(bytes);
        let offset = 0;

        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.byteLength;
        }

        return new TextDecoder("utf-8", { fatal: true }).decode(output);
      } finally {
        signal.removeEventListener("abort", abort);
        reader.releaseLock();
      }
    },
    catch: (error) =>
      Schema.is(OperationHttpError)(error) ? error : OperationHttpError.make({ reason: "request" }),
  });
});

const baseHeaders = () =>
  new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    vary: "Origin",
  });

const failResponse = (error: OperationHttpError) =>
  Effect.map(
    encodeResponse({ _tag: "TransportFailure", reason: error.reason }),
    (body) =>
      new Response(body, {
        status:
          error.reason === "not-found"
            ? 404
            : error.reason === "method"
              ? 405
              : error.reason === "too-large"
                ? 413
                : error.reason === "unavailable"
                  ? 503
                  : error.reason === "origin" || error.reason === "csrf"
                    ? 403
                    : 400,
        headers: baseHeaders(),
      }),
  ).pipe(Effect.orDie);

const callbackPayload = Effect.fn("OperationHttp.callbackPayload")(function* (
  callback: OAuthHttpCallback<unknown>,
  request: Request,
  credentials: HttpCredentials,
  url: URL,
) {
  const allowed = new Set([
    "state",
    "code",
    "error",
    "error_description",
    "error_uri",
    "iss",
    ...(callback.allowedQueryParameters ?? []),
  ]);

  const seen = new Set<string>();

  for (const [name, value] of url.searchParams) {
    if (!allowed.has(name) || seen.has(name) || value.length > 4096)
      return yield* OperationHttpError.make({ reason: "request" });
    seen.add(name);
  }
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (
    state === null ||
    state.length === 0 ||
    state.length > 2048 ||
    (code === null) === (error === null)
  )
    return yield* OperationHttpError.make({ reason: "request" });
  const issuer = url.searchParams.get("iss");

  const response =
    code === null
      ? {
          _tag: "Error",
          state,
          error: error === "access_denied" ? "access-denied" : "rejected",
          ...(issuer === null ? {} : { issuer }),
        }
      : { _tag: "Code", state, code, ...(issuer === null ? {} : { issuer }) };

  return {
    flowId: yield* callback.flowId(request, credentials),
    provider: callback.provider,
    callbackId: callback.callbackId,
    response,
  };
});

const inject = (route: AnyRoute, input: unknown, credentials: HttpCredentials) =>
  Effect.try({
    try: () => {
      const fields = Object.entries(route.credentials);

      if (fields.length === 0) return input;

      const output = {
        // oxlint-disable-next-line no-restricted-properties -- untyped HTTP payload must be a record before injecting private fields.
        ...Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(input),
      };

      for (const [field, slot] of fields) {
        if (Object.hasOwn(output, field)) throw new Error();
        const credential = credentials[slot];

        if (credential === undefined) throw new Error();
        output[field] = Redacted.value(credential);
      }

      return output;
    },
    catch: () => OperationHttpError.make({ reason: "credentials" }),
  });

const applyCommands = Effect.fn("OperationHttp.applyCommands")(function* (
  headers: Headers,
  commands: ReadonlyArray<AuthCredentialCommand>,
  config: OperationHttpConfiguration,
  native: boolean,
) {
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  for (const command of commands) {
    if (native) {
      headers.set(
        config.native!.responseHeaders[command.slot],
        encodeCredential(credentialWire(command)),
      );
    } else {
      const cookie = config.cookies[command.slot];
      const value = command._tag === "Issue" ? Redacted.value(command.credential) : "";
      const maxAge = command._tag === "Issue" ? Math.max(0, command.expiresAtMillis - now) : 0;

      headers.append(
        "set-cookie",
        Cookies.serializeCookie(
          Cookies.makeCookieUnsafe(cookie.name, value, {
            path: cookie.path,
            secure: cookie.secure,
            sameSite: cookie.sameSite,
            httpOnly: true,
            ...(cookie.domain === undefined ? {} : { domain: cookie.domain }),
            maxAge: Duration.millis(maxAge),
          }),
        ),
      );
    }
  }
});

/** Retain transport configuration and caller resolution only. Supply operation,
 * codec and callback services to each handle invocation instead of construction. */
export const make = <
  const Routes extends Readonly<Record<string, AnyRoute>>,
  const Callbacks extends ReadonlyArray<OAuthHttpCallback<unknown>> = readonly [],
>(
  contract: { readonly routes: Routes },
  options?: { readonly callbacks?: Callbacks },
) =>
  Effect.gen(function* () {
    type DispatchRoute = Routes[keyof Routes] | Callbacks[number]["route"];
    type Requirements = Exclude<
      | RouteRequirements<DispatchRoute>
      | Effect.Services<ReturnType<NonNullable<Callbacks[number]["respond"]>>>,
      AuthRequest | AuthCredentialCommandCollector | AuthRevealCommandCollectorService | Scope.Scope
    >;
    const config = yield* OperationHttpServerConfig;
    const invocation = yield* OperationHttpInvocation;

    for (const route of Object.values(contract.routes)) {
      if (
        route.method === "GET" &&
        (route.operation.replay !== "read-only" ||
          route.operation.credentials ||
          route.reveals.length > 0 ||
          route.operation.reveals.length > 0 ||
          Object.keys(route.credentials).length > 0 ||
          !(
            SchemaAST.isVoid(Schema.toEncoded(route.operation.rpc.payloadSchema).ast) ||
            SchemaAST.isUndefined(Schema.toEncoded(route.operation.rpc.payloadSchema).ast)
          ))
      )
        return yield* OperationHttpConfigurationError.make({ reason: "route" });
    }
    const routes = new Map(Object.values(contract.routes).map((route) => [route.path, route]));
    const callbacks = new Map<string, Callbacks[number]>();

    for (const callback of options?.callbacks ?? []) {
      if (callbacks.has(callback.path) || routes.has(callback.path))
        return yield* OperationHttpConfigurationError.make({ reason: "duplicate-route" });
      callbacks.set(callback.path, callback);
    }

    const handle = Effect.fn("OperationHttp.handle")(
      function* (request: Request) {
        const services = yield* Effect.context<Requirements>();

        if (new TextEncoder().encode(request.url).byteLength > config.maximumUrlBytes)
          return yield* OperationHttpError.make({ reason: "too-large" });

        const url = yield* Effect.try({
          try: () => new URL(request.url),
          catch: () => OperationHttpError.make({ reason: "request" }),
        });

        const callback = callbacks.get(url.pathname);
        const route = callback?.route ?? routes.get(url.pathname);

        if (route === undefined) return yield* OperationHttpError.make({ reason: "not-found" });
        if (request.method === "OPTIONS" && callback === undefined) {
          const origin = request.headers.get("origin");

          const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
            .toLowerCase()
            .split(",")
            .map((header) => header.trim())
            .filter(Boolean);

          if (origin === null || !config.trustedOrigins.includes(origin))
            return yield* OperationHttpError.make({ reason: "origin" });
          if (
            url.search !== "" ||
            request.headers.get("access-control-request-method") !== route.method ||
            requestedHeaders.some(
              (header) => header !== "content-type" && header !== config.csrfHeader,
            )
          )
            return yield* OperationHttpError.make({ reason: "csrf" });
          const headers = baseHeaders();

          headers.set("access-control-allow-origin", origin);
          headers.set("access-control-allow-credentials", "true");
          headers.set("access-control-allow-methods", route.method);
          headers.set("access-control-allow-headers", `content-type, ${config.csrfHeader}`);
          headers.set(
            "vary",
            "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
          );

          return new Response(null, { status: 204, headers });
        }
        if (request.method !== (callback === undefined ? route.method : "GET"))
          return yield* OperationHttpError.make({ reason: "method" });
        if (callback === undefined && url.search !== "")
          return yield* OperationHttpError.make({ reason: "request" });

        const security = yield* requestSecurity(
          request,
          callback === undefined ? (route.method === "GET" ? "read" : "operation") : "callback",
        );

        if (callback !== undefined && security.credentials["request-binding"] === undefined)
          return yield* OperationHttpError.make({ reason: "credentials" });

        const raw =
          callback === undefined && route.method === "GET"
            ? undefined
            : callback === undefined
              ? (yield* Schema.decodeEffect(Schema.fromJsonString(HttpRequestBody))(
                  yield* boundedText(request, config.maximumBodyBytes),
                ).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "request" }))))
                  .payload
              : yield* callbackPayload(callback, request, security.credentials, url);

        const payload = yield* inject(route, raw, security.credentials);
        const trusted = yield* invocation.resolve(request, security.credentials);
        const commands: AuthCredentialCommand[] = [];
        const reveals: AuthRevealCommand[] = [];

        const sink = (values: ReadonlyArray<AuthCredentialCommand>) =>
          Effect.sync(() => {
            commands.push(...values);
          });

        const collector = {
          supportedKinds: route.reveals,
          accept: (values: ReadonlyArray<AuthRevealCommand>) =>
            Effect.sync(() => {
              reveals.push(...values);
            }),
        };

        // The selected table entry couples its handler and codecs. The maker's
        // generic requirements retain every concrete entry before this dispatch.
        const invoke = route.operation.invokeUnknown as (
          invocation: AuthInvocation,
          input: unknown,
        ) => Effect.Effect<RouteSuccess<DispatchRoute>, RouteFailure<DispatchRoute>, Requirements>;

        const call = invoke(trusted, payload);

        const successSchema = route.operation.rpc.successSchema as Schema.Codec<
          RouteSuccess<DispatchRoute>,
          unknown,
          unknown,
          Requirements
        >;

        const errorSchema = route.operation.rpc.errorSchema as Schema.Codec<
          RouteFailure<DispatchRoute>,
          unknown,
          unknown,
          Requirements
        >;

        // Context captures retain all runtime entries, regardless of their static
        // requirement type. Replace request-owned services before every invocation
        // and wire projection so ambient collectors can never receive secrets.
        const requestScope = yield* Effect.scope;

        const requestServices = services.pipe(
          Context.add(Scope.Scope, requestScope),
          Context.add(AuthRequest, {
            invocation: trusted,
            ...(invocation.request === undefined
              ? {}
              : { resolveInvocation: invocation.request(request, security.credentials) }),
            credentials: security.credentials,
            beforeMutation:
              route.method === "GET" ? HookDenied.make({ reason: "policy" }) : Effect.void,
            credentialCommandSink: sink,
            revealCommandCollector: collector,
          }),
          Context.add(AuthCredentialCommandCollector, sink),
          Context.add(AuthRevealCommandCollectorService, collector),
        );

        const resolved = yield* Effect.result(call.pipe(Effect.provide(requestServices)));
        const headers = baseHeaders();

        if (
          security.requestOrigin !== null &&
          config.trustedOrigins.includes(security.requestOrigin)
        ) {
          headers.set("access-control-allow-origin", security.requestOrigin);
          headers.set("access-control-allow-credentials", "true");
        }
        if (resolved._tag === "Failure") {
          const encoded = yield* Schema.encodeEffect(errorSchema)(resolved.failure).pipe(
            Effect.provide(requestServices),
            Effect.mapError(() => OperationHttpError.make({ reason: "response" })),
          );

          // oxlint-disable-next-line no-restricted-properties -- an encoded operation error enters the JSON transport boundary.
          const error = yield* Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
            Effect.mapError(() => OperationHttpError.make({ reason: "response" })),
          );

          return new Response(
            yield* encodeResponse({ _tag: "Failure", error }).pipe(Effect.orDie),
            { status: 400, headers },
          );
        }

        const encoded = yield* Schema.encodeEffect(successSchema)(resolved.success).pipe(
          Effect.provide(requestServices),
          Effect.mapError(() => OperationHttpError.make({ reason: "response" })),
        );

        const value =
          encoded === undefined
            ? undefined
            : // oxlint-disable-next-line no-restricted-properties -- schema-encoded success enters the JSON boundary.
              yield* Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
                Effect.mapError(() => OperationHttpError.make({ reason: "response" })),
              );

        if (callback?.respond === undefined)
          yield* applyCommands(headers, commands, config, security.native);
        if (callback !== undefined) {
          if (callback.respond !== undefined) {
            // The callback retains its exact invocation requirements.
            const respond = callback.respond as NonNullable<
              OAuthHttpCallback<Requirements>["respond"]
            >;

            const input = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ flowId: Schema.String }),
            )(raw).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "response" })));

            const response = yield* respond(value, {
              ...input,
              provider: callback.provider,
              callbackId: callback.callbackId,
            }).pipe(Effect.provide(requestServices));

            yield* applyCommands(headers, commands, config, security.native);

            const customHeaders = new Headers(response.headers);

            for (const name of [
              "cache-control",
              "pragma",
              "referrer-policy",
              "x-content-type-options",
            ])
              customHeaders.set(name, headers.get(name)!);
            for (const cookie of headers.getSetCookie()) customHeaders.append("set-cookie", cookie);

            return new Response(response.body, { status: response.status, headers: customHeaders });
          }

          // oxlint-disable-next-line no-restricted-properties -- only the core-approved return target is projected from the callback result.
          const target = yield* Schema.decodeUnknownEffect(
            Schema.Struct({ returnTarget: Schema.String.check(Schema.isMaxLength(2048)) }),
          )(encoded).pipe(Effect.mapError(() => OperationHttpError.make({ reason: "response" })));

          const destination = yield* Effect.try({
            try: () => new URL(target.returnTarget, security.publicOrigin),
            catch: () => OperationHttpError.make({ reason: "response" }),
          });

          if (
            (destination.origin !== security.publicOrigin &&
              !callback.allowedRedirectOrigins.includes(destination.origin)) ||
            !["https:", "http:"].includes(destination.protocol) ||
            destination.username !== "" ||
            destination.password !== ""
          )
            return yield* OperationHttpError.make({ reason: "response" });
          headers.set("location", destination.href);

          return new Response(null, { status: 303, headers });
        }

        return new Response(
          yield* encodeResponse({
            _tag: "Success",
            ...(value === undefined ? {} : { value }),
            ...(reveals.length === 0 ? {} : { private: reveals.map(revealWire) }),
          }).pipe(Effect.orDie),
          { status: 200, headers },
        );
      },
      Effect.scoped,
      Effect.catch((error) =>
        failResponse(
          Schema.is(OperationHttpError)(error)
            ? error
            : OperationHttpError.make({ reason: "unavailable" }),
        ),
      ),
      Effect.catchCause((cause) =>
        Cause.hasDies(cause)
          ? reportAuthFailure("http", cause).pipe(
              Effect.andThen(failResponse(OperationHttpError.make({ reason: "unavailable" }))),
            )
          : Effect.failCause(cause),
      ),
      Effect.provideService(OperationHttpServerConfig, config),
    );

    return { handle };
  });
