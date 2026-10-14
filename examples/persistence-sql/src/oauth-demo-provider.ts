import { OAuth, Strava } from "@yielded/auth";
import { Context, DateTime, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { callbackId, profile } from "./oauth-lifecycle-model";

const TokenResponse = Schema.Struct({
  token_type: Schema.Literal("Bearer"),
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: Schema.Int,
  athlete: Schema.Struct({ id: Schema.Int, firstname: Schema.String }),
  scope: Schema.String,
});

const Athlete = Schema.Struct({ id: Schema.Int });

const athleteId = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
);

/** Local provider transport only. Strava's real protocol still constructs requests,
 * validates replies, exchanges codes, and refreshes encrypted grants. No network I/O. */
export const DemoHttpLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) =>
    Effect.gen(function* () {
      const form = new URLSearchParams(
        request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "",
      );

      const token = request.headers.authorization?.replace("Bearer demo-access-", "");

      const external =
        form.get("code") ?? form.get("refresh_token")?.replace("demo-refresh-", "") ?? token;

      const id = yield* Schema.decodeEffect(athleteId)(external).pipe(Effect.orDie);

      const body = url.pathname.endsWith("athlete")
        ? Schema.encodeSync(Schema.fromJsonString(Athlete))({ id })
        : Schema.encodeSync(Schema.fromJsonString(TokenResponse))({
            token_type: "Bearer",
            access_token: `demo-access-${id}`,
            refresh_token: `demo-refresh-${id}`,
            expires_at: Math.floor(DateTime.toEpochMillis(yield* DateTime.now) / 1000) + 21_600,
            athlete: { id, firstname: "Demo" },
            scope: "activity:read_all",
          });

      return HttpClientResponse.fromWeb(
        request,
        new Response(body, { headers: { "content-type": "application/json" } }),
      );
    }),
  ),
);

export const DemoProviderLive = Layer.effectContext(
  Effect.gen(function* () {
    const configured = yield* Strava.provider({
      clientId: "1234",
      clientSecret: Redacted.make("public-demo-client-secret"),
      access: profile,
    }).configure({
      provider: profile.provider,
      callbacks: [
        {
          callbackId,
          redirectUri: OAuth.OAuthRedirectUri.make(
            "https://demo.example.invalid/auth/strava/callback",
          ),
        },
      ],
    });

    if (configured.connected === undefined) return yield* OAuth.OAuthUnavailable.make({});

    return Context.make(OAuth.OAuthProtocol, configured).pipe(
      Context.add(OAuth.OAuthConnectedProtocol, configured.connected),
    );
  }),
);
