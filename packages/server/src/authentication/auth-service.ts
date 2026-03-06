import { Layer, ServiceMap } from "effect"

import type { Auth } from "./better-auth.js"

export class AuthService extends ServiceMap.Service<AuthService, Auth>()("AuthService") {
  static make = (auth: Auth) => Layer.succeed(AuthService, auth)
}
