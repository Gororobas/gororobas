import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { OAuthServerPersistence } from "@yielded/auth-persistence";
import * as OAuthServer from "@yielded/auth/OAuthServer";
import * as Strava from "@yielded/auth/Strava";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { HttpMiddleware, HttpRouter, HttpServerRequest } from "effect/http";
import { SqlClient } from "effect/sql";

import { makeExample } from "./oauth-application";

const oauth = OAuthServer.make("mcp", { scopes: ["athlete:read"] });

const toolkit = Toolkit.make(
  Tool.make("connected_athlete", {
    description: "Identify the athlete who authorized this MCP client.",
    success: Schema.Struct({ subjectId: Schema.String }),
    failure: OAuthServer.InvalidToken,
  }),
);

const handlers = toolkit.toLayer({
  connected_athlete: Effect.fn("StravaMcp.connectedAthlete")(function* () {
    const access = yield* OAuthServer.CurrentAccess;

    if (access === undefined) return yield* OAuthServer.InvalidToken.make({});

    // Applications resolve this subject's permitted connection from trusted storage
    // before using the connected access service. Never take a grant ID from tool input.
    return { subjectId: access.subjectId };
  }),
});

const runtime = Layer.unwrap(
  Effect.gen(function* () {
    const origin = yield* Config.String("APP_ORIGIN").pipe(
      Config.withDefault("http://localhost:3000"),
    );

    const clientId = yield* Config.String("STRAVA_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("STRAVA_CLIENT_SECRET");
    const athleteId = yield* Config.String("STRAVA_ATHLETE_ID");
    const sessionKey = yield* Config.Redacted("SESSION_KEY");
    const transactionKey = yield* Config.Redacted("OAUTH_TRANSACTION_KEY");
    const tokenKey = yield* Config.Redacted("OAUTH_TOKEN_KEY");
    const issuerKey = yield* Config.Redacted("MCP_SIGNING_KEY");
    const mcpClientId = yield* Config.String("MCP_CLIENT_ID");
    const mcpRedirectUri = yield* Config.String("MCP_REDIRECT_URI");

    const keyring = (material: Redacted.Redacted<string>) => ({
      activeKeyId: "v1",
      keys: [{ id: "v1", material }],
    });

    const database = Layer.effectDiscard(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        // The example owns this file. Production applications apply each migration once.
        for (const migration of [OAuthServerPersistence.migration]) {
          yield* sql.unsafe(migration.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"));
        }
      }),
    ).pipe(Layer.provideMerge(SqliteClient.layer({ filename: "strava-mcp.sqlite" })));

    const profile = Strava.accessProfile({ clientId, scopes: ["activity:read_all"] });

    const login = makeExample({
      origin,
      profile,
      provider: Strava.provider({ clientId, clientSecret, access: profile }),
      issuer: "https://www.strava.com",
      externalSubject: athleteId,
      subjectId: `strava:${athleteId}`,
      filename: "strava-mcp-auth-v2.sqlite",
      sessionKeys: keyring(sessionKey),
      transactionKeys: keyring(transactionKey),
      tokenKeys: keyring(tokenKey),
      returnTarget: oauth.paths.authorize,
    });

    const identity = Layer.effect(
      oauth.Identity,
      Effect.gen(function* () {
        const auth = yield* login.AppAuth;

        return oauth.Identity.of({
          current: Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;

            const cookie =
              request.cookies[
                new URL(origin).protocol === "https:"
                  ? "__Host-effect-auth-session"
                  : "effect-auth-session"
              ];

            if (cookie === undefined) return undefined;

            return yield* auth.verifySession(Redacted.make(cookie)).pipe(
              Effect.map((session) => session.subjectId),
              Effect.catchTag("SessionInvalid", () => Effect.succeed(undefined)),
              Effect.mapError(() => OAuthServer.Unavailable.make({})),
            );
          }),
        });
      }),
    ).pipe(Layer.provide(login.live));

    const authorization = oauth
      .layer({
        origin,
        resource: `${origin}/mcp`,
        loginPath: "/login",
        keys: keyring(issuerKey),
        clients: [{ clientId: mcpClientId, name: "My MCP client", redirectUris: [mcpRedirectUri] }],
      })
      .pipe(
        Layer.provide(identity),
        Layer.provide(OAuthServerPersistence.layer.pipe(Layer.provide(database))),
      );

    const mcp = McpServer.toolkit(toolkit).pipe(
      Layer.provide(handlers),
      Layer.provide(
        McpServer.layerHttp({
          name: "Strava",
          version: "1.0.0",
          path: "/mcp",
          protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25],
          allowedOrigins: [new URL(mcpRedirectUri).origin],
        }),
      ),
      Layer.provide(oauth.middleware(["athlete:read"]).layer),
    );

    return Layer.mergeAll(mcp, oauth.routes, login.routes).pipe(
      Layer.provide(authorization),
      Layer.provide(
        HttpRouter.middleware(
          HttpMiddleware.cors({
            allowedOrigins: [new URL(mcpRedirectUri).origin],
            allowedMethods: ["GET", "POST", "OPTIONS"],
            exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
          }),
        ).layer,
      ),
    );
  }),
);

// OAuth requests/responses contain credentials. Keep their URLs out of access logs/traces.
HttpRouter.serve(runtime, { disableLogger: true }).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port: 3000 })),
  Layer.provide(Layer.succeed(HttpMiddleware.TracerDisabledWhen, () => true)),
  Layer.provide(BunServices.layer),
  Layer.launch,
  BunRuntime.runMain,
);
