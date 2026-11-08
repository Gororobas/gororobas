import { Sessions, Operations, Hooks } from "@yielded/auth"
import { makeSessionHttpContract } from "@yielded/auth/SessionContract"
import { Context, Schema } from "effect"
import { HttpApiMiddleware } from "effect/http-api"

import { SessionContext } from "../authorization/session.js"
import {
  AuthenticationSession,
  authenticationNamespace,
  sessionCookieName,
} from "./auth-contract.js"

export const AuthenticationHttp = makeSessionHttpContract(
  authenticationNamespace,
  AuthenticationSession,
  { cookieName: sessionCookieName },
)

/**
 * The account a client's write is meant for. Clients send it with every write made on someone's
 * behalf, and the API refuses the write when the session cookie belongs to anyone else: another
 * tab may have switched accounts since the client last looked.
 */
export const EXPECTED_SUBJECT_HEADER = "x-gororobas-subject"

/** A write without the app's origin and CSRF header, such as a form another site submits. */
export class UntrustedWriteError extends Schema.TaggedError<UntrustedWriteError>()(
  "UntrustedWriteError",
  {},
  { httpApiStatus: 403 },
) {}

export class SessionSubjectMismatchError extends Schema.TaggedError<SessionSubjectMismatchError>()(
  "SessionSubjectMismatchError",
  {},
  { httpApiStatus: 401 },
) {}

/**
 * Every write request runs in one transaction, which also re-reads the writer's roles (see
 * `SessionContext`). Endpoints that receive or process large bodies would hold the write lock for
 * that long: they opt out, and open their own transactions around their checks and writes.
 */
export const OutsideWriteTransaction = Context.Reference<boolean>(
  "gororobas/OutsideWriteTransaction",
  { defaultValue: () => false },
)

export class ApiAuthentication extends HttpApiMiddleware.Service<
  ApiAuthentication,
  { provides: SessionContext }
>()("ApiAuthentication", {
  error: [
    Sessions.SessionError,
    Operations.OperationBoundaryError,
    Hooks.HookDenied,
    UntrustedWriteError,
    SessionSubjectMismatchError,
  ],
}) {}
