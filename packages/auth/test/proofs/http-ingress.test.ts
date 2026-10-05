import { it } from "@effect/vitest";
import {
  Auth,
  AuthContract,
  Email,
  Http,
  OperationHttp,
  OperationHttpServer,
  Proofs,
  Sessions,
} from "@yielded/auth";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vite-plus/test";

const origin = "https://example.test";

const app = Auth.make("test/http-proof-ingress", {
  claims: Schema.Struct({}),
  sessions: Sessions.stateful(),
  strategies: { email: Email.makeCode() },
});

const requestOperation = app.strategies.email.operations.Request;
const cookies = OperationHttpServer.cookieConfiguration({ prefix: "__Host-test-", secure: true });

export const operationServer = OperationHttpServer.make(
  OperationHttp.make({
    request: OperationHttp.route(requestOperation, {
      path: "/auth/request",
      credentials: { requestBinding: "request-binding" },
    }),
  }),
);

const configuration = Layer.merge(
  OperationHttpServer.configurationLayer({
    publicOrigin: origin,
    trustedOrigins: [origin],
    cookies,
    csrfHeader: "x-effect-auth-csrf",
    csrfValue: "1",
    maximumBodyBytes: 65536,
    maximumUrlBytes: 8192,
  }),
  OperationHttpServer.invocationLayer(() => Effect.succeed({ _tag: "Guest" })),
);

const proofRequest = () =>
  new Request(`${origin}/auth/request`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-effect-auth-csrf": "1",
      cookie: `${cookies["request-binding"].name}=binding`,
    },
    body: JSON.stringify({
      payload: {
        flowId: "flow",
        requestId: "request",
        email: "person@example.test",
        returnTarget: "/",
        locale: "en",
      },
    }),
  });

// Requested security regression: one shared HTTP server must authorize each
// current caller, even when its construction environment contained another caller.
it.effect("resolves proof ingress from each HTTP invocation instead of shared construction", () =>
  Effect.gen(function* () {
    const seen: string[] = [];
    let entered = 0;

    const handlers = yield* Layer.build(
      requestOperation.handlerLayer(() =>
        Effect.sync(() => {
          entered++;
        }).pipe(Effect.andThen(Email.EmailUnavailable.make({}))),
      ),
    );

    const limiter = Proofs.HostIngressLimiter.of({
      check: ({ networkKey }) =>
        Effect.gen(function* () {
          const network = Redacted.value(networkKey);

          seen.push(network);
          if (network === "blocked") return yield* Proofs.ProofIngressDenied.make({});
        }),
    });

    const server = yield* operationServer.pipe(
      Effect.provide(configuration),
      Effect.provide(handlers),
      Effect.provideService(Proofs.HostIngressLimiter, limiter),
      Effect.provideService(
        Proofs.ProofRequestContext,
        Effect.succeed({ networkKey: Redacted.make("startup") }),
      ),
    );

    const call = (network: string) =>
      server
        .handle(proofRequest())
        .pipe(
          Effect.provide(handlers),
          Effect.provideService(Proofs.HostIngressLimiter, limiter),
          Effect.provideService(
            Proofs.ProofRequestContext,
            Effect.succeed({ networkKey: Redacted.make(network) }),
          ),
        );

    const denied = yield* call("blocked");
    const admitted = yield* call("allowed");

    expect(denied.status).toBe(400);
    expect(yield* Effect.promise(() => denied.json())).toMatchObject({
      _tag: "Failure",
      error: { _tag: "EmailRejected" },
    });
    expect(admitted.status).toBe(400);
    expect(yield* Effect.promise(() => admitted.json())).toMatchObject({
      _tag: "Failure",
      error: { _tag: "EmailUnavailable" },
    });
    expect(entered).toBe(1);
    expect(seen).toEqual(["blocked", "allowed"]);
  }).pipe(Effect.scoped),
);

const contract = AuthContract.make("test/http-invocation", {
  claims: Schema.Struct({}),
  actions: () => ({
    observe: AuthContract.action({
      payload: Schema.Void,
      success: Schema.Literal("accepted"),
      error: Proofs.ProofUnavailable,
      mode: "query",
    }),
    health: AuthContract.action({
      payload: Schema.Void,
      success: Schema.Literal("healthy"),
      error: Schema.Never,
      mode: "query",
    }),
  }),
});

class HttpAuth extends Context.Service<
  HttpAuth,
  Auth.SessionApi<typeof contract.sessions.Session.Type> & {
    readonly observe: () => Effect.Effect<
      "accepted",
      Proofs.ProofUnavailable,
      Proofs.ProofRequestContext
    >;
    readonly health: () => Effect.Effect<"healthy">;
  }
>()("test/HttpAuth") {}

export const makeHttp = (seen: string[]) => {
  const unusedSession = () => Effect.die("This request does not use a session");

  const layer = Layer.succeed(HttpAuth, {
    verifySession: unusedSession,
    getSession: unusedSession,
    requireSession: unusedSession,
    signOut: unusedSession,
    renewSession: unusedSession,
    observe: () =>
      Effect.gen(function* () {
        const context = yield* yield* Proofs.ProofRequestContext;

        seen.push(Redacted.value(context.networkKey));

        return "accepted" as const;
      }),
    health: () => Effect.succeed("healthy" as const),
  });

  return Http.make(Object.assign(HttpAuth, { contract, sessions: contract.sessions, layer }), {
    origin,
  });
};

it.effect("uses each HTTP peer by default and preserves a trusted caller override", () =>
  Effect.gen(function* () {
    const seen: string[] = [];
    const http = makeHttp(seen);

    const handle = yield* HttpRouter.toHttpEffect(
      http.routes().pipe(Layer.provide(http.layer)),
    ).pipe(Effect.provide(HttpServer.layerServices));

    for (const network of ["first-network", "second-network"]) {
      const request = HttpServerRequest.fromWeb(
        new Request(`${origin}/auth/observe`, {
          headers: { "x-forwarded-for": "forged-peer", forwarded: "for=forged-peer" },
        }),
      ).modify({
        remoteAddress: Option.some(network),
      });

      const response = yield* handle.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      );

      const web = HttpServerResponse.toWeb(response);

      expect(web.status).toBe(200);
      expect(yield* Effect.promise(() => web.json())).toEqual({
        _tag: "Success",
        value: "accepted",
      });
    }
    const withoutPeer = HttpServerRequest.fromWeb(new Request(`${origin}/auth/observe`));

    const overridden = yield* handle.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, withoutPeer),
      Effect.provideService(
        Proofs.ProofRequestContext,
        Effect.succeed({ networkKey: Redacted.make("trusted-proxy-client") }),
      ),
    );

    expect(overridden.status).toBe(200);
    expect(seen).toEqual(["first-network", "second-network", "trusted-proxy-client"]);

    const missingPeer = yield* handle.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, withoutPeer),
    );

    expect(yield* Effect.promise(() => HttpServerResponse.toWeb(missingPeer).json())).toMatchObject(
      {
        _tag: "Failure",
        error: { _tag: "ProofUnavailable" },
      },
    );

    const unrelated = yield* handle.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request(`${origin}/auth/health`)),
      ),
    );

    expect(unrelated.status).toBe(200);
  }).pipe(Effect.scoped),
);
