import { BrowserLogin, OperationHttp, OperationHttpServer, Operations } from "@yielded/auth";
import { BrowserLoginPersistence } from "@yielded/auth-persistence";
import { Config, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import { AppAuth } from "../../shared/account/auth";
import { handoff, nativeSession } from "../../shared/account/browser-login-contract";
import { NativeSessionLive } from "./live";

const configuration = (origin: URL) =>
  OperationHttpServer.configurationLayer({
    publicOrigin: origin.origin,
    trustedOrigins: [origin.origin],
    csrfHeader: "x-auth-csrf",
    csrfValue: "operation",
    maximumBodyBytes: 16_384,
    maximumUrlBytes: 4096,
    cookies: OperationHttpServer.cookieConfiguration({
      prefix: "sql-example-",
      secure: origin.protocol === "https:",
    }),
    native: {
      modeHeader: "x-auth-mode",
      requestHeaders: OperationHttpServer.headerConfiguration("x-auth-request-"),
      responseHeaders: OperationHttpServer.headerConfiguration("x-auth-response-"),
      // Public-client admission marker, not authentication. PKCE and session
      // credentials supply authority; deployments also own ingress rate limits.
      authorize: (request) =>
        request.headers.get("x-auth-client") === "yielded-native" &&
        request.headers.get("content-type")?.startsWith("application/json")
          ? Effect.void
          : Effect.fail(OperationHttp.OperationHttpError.make({ reason: "origin" })),
    },
  });

const invocation = OperationHttpServer.invocationLayer(
  Effect.fnUntraced(function* (request, credentials) {
    if (
      new URL(request.url).pathname === handoff.routes.describe.path ||
      request.headers.has("x-auth-mode") ||
      credentials.session === undefined
    )
      return Operations.guest;

    const session = yield* (yield* AppAuth.sessions.SessionStrategy)
      .verify(credentials.session)
      .pipe(
        Effect.mapError(() => OperationHttp.OperationHttpError.make({ reason: "credentials" })),
      );

    return {
      _tag: "Authenticated" as const,
      subjectId: session.subjectId,
      assurance: session.assurance,
    };
  }),
);

export const browserLoginRoutes = (origin: URL) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const returnUrl = yield* Config.option(Config.String("AUTH_IOS_RETURN_URL"));

      const browserLogin = BrowserLogin.make(AppAuth.sessions, {
        basePath: "/auth/browser-login",
        clients: [
          {
            clientId: "electron",
            displayName: "Yielded Electron example",
            returnUrl: "dev.yielded.auth://callback",
            browserSession: "confirm",
          },
          {
            clientId: "ios",
            displayName: "Yielded iOS example",
            returnUrl: Option.getOrElse(returnUrl, () => "dev.yielded.auth.ios://callback"),
            browserSession: Option.isSome(returnUrl) ? "automatic" : "confirm",
          },
        ],
      });

      return Layer.unwrap(
        Effect.gen(function* () {
          const login = yield* browserLogin.http;
          const native = yield* OperationHttpServer.make(nativeSession);

          return HttpRouter.addAll([
            ...Object.values(browserLogin.routes).map((route) =>
              HttpRouter.route(
                "POST",
                route.path as `/${string}`,
                Effect.gen(function* () {
                  return HttpServerResponse.fromWeb(
                    yield* login.handle(
                      yield* HttpServerRequest.toWeb(yield* HttpServerRequest.HttpServerRequest),
                    ),
                  );
                }),
              ),
            ),
            ...Object.values(nativeSession.routes).map((route) =>
              HttpRouter.route(
                "POST",
                route.path as `/${string}`,
                Effect.gen(function* () {
                  const request = yield* HttpServerRequest.toWeb(
                    yield* HttpServerRequest.HttpServerRequest,
                  );

                  if (request.headers.get("x-auth-mode") !== "native")
                    return HttpServerResponse.empty({ status: 403 });

                  return HttpServerResponse.fromWeb(yield* native.handle(request));
                }),
              ),
            ),
          ]);
        }),
      ).pipe(
        HttpRouter.provideRequest(
          Layer.mergeAll(
            AppAuth.sessions.sessionHandlersLayer,
            browserLogin.layer.pipe(Layer.provide(BrowserLoginPersistence.layer)),
          ),
        ),
        Layer.provide(Layer.mergeAll(configuration(origin), invocation)),
        Layer.provide(NativeSessionLive),
      );
    }),
  );
