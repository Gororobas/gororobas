import * as Auth from "@yielded/auth/Auth";
import * as Http from "@yielded/auth/Http";
import * as Password from "@yielded/auth/Password";
import * as Sessions from "@yielded/auth/Sessions";

import { AuthApi } from "./server-contract";

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful(),
  strategies: { password: Password.make() },
  defaultStrategy: "password",
});

export const AuthRoutes = Http.layer(AppAuth, { origin: "https://app.example.com" });
