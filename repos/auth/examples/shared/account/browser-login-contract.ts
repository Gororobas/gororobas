import { BrowserLoginContract, OperationHttp } from "@yielded/auth";

import { AuthApi } from "./contract";

export const handoff = BrowserLoginContract.make(
  AuthApi.sessions.moduleId,
  AuthApi.sessions.Session,
  {
    basePath: "/auth/browser-login",
  },
);

export const nativeSession = OperationHttp.make({
  session: OperationHttp.route(AuthApi.sessions.operations.Verify, {
    path: "/auth/native/session",
    credentials: { credential: "session" },
    allowInternal: true,
  }),
  signOut: OperationHttp.route(AuthApi.sessions.operations.SignOut, {
    path: "/auth/native/sign-out",
    credentials: { credential: "session" },
    allowInternal: true,
  }),
});
