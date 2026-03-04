import { Context, Layer } from "effect"

import type { Auth } from "./better-auth.js"

export class AuthService extends Context.Tag("AuthService")<AuthService, Auth>() {
  static make = (auth: Auth) => Layer.succeed(AuthService, auth)
}
