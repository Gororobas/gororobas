import { SessionContract } from "@yielded/auth";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

// Shared browser/server contracts contain no keys, storage or server implementation.
export const Claims = Schema.Struct({ displayName: Schema.String });
const sessions = SessionContract.makeSessionContract("example/session-auth/sessions", Claims);

export const SessionHttp = SessionContract.makeSessionHttpContract(
  "example/session-auth",
  sessions.Session,
  {
    cookieName: "__Host-example-session",
  },
);

export const ProfileApi = HttpApi.make("profile").add(
  HttpApiGroup.make("profile")
    .add(HttpApiEndpoint.get("current", "/me", { success: Claims }))
    .middleware(SessionHttp.RequireSession),
);
