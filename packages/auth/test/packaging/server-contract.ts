import * as AuthContract from "@yielded/auth/AuthContract";
import * as Schema from "effect/Schema";

export const AuthApi = AuthContract.make("consumer/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({ signIn: AuthContract.passwordSignIn(sessions) }),
});
