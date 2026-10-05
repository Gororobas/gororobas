import { AuthContract } from "@yielded/auth";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

// Shared with the browser: schemas and selected actions only.
export const AuthApi = AuthContract.make("example/shared-auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({ signIn: AuthContract.passwordSignIn(sessions) }),
});

// Auth joins an application's existing API and its generated OpenAPI document.
export const AppApi = HttpApi.make("example/app").add(
  HttpApiGroup.make("health").add(
    HttpApiEndpoint.get("check", "/health", { success: Schema.String }),
  ),
  AuthContract.httpGroup(AuthApi),
);
