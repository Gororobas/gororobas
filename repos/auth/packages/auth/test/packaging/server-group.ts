import { Auth, Http, Sessions } from "@yielded/auth";
import { Password } from "@yielded/auth/strategies";

import { AuthApi } from "./server-contract";

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful(),
  strategies: { password: Password.make() },
  defaultStrategy: "password",
});

export const AuthRoutes = Http.layer(AppAuth, { origin: "https://app.example.com" });
