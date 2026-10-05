import type { Effect } from "effect";
import { Context } from "effect";

import type { OperationFetchClient } from "../http-operation/client";
import type { AnyRoute, RouteFailure, RouteInput, RouteSuccess } from "../http-operation/contract";
import type { OperationHttpError } from "../http-operation/errors";

/** Each workflow invocation owns one generation fence. Device work stays
 * interruptible; its final authentication call and subject publication settle together. */
export class AuthAtomWorkflow extends Context.Service<
  AuthAtomWorkflow,
  {
    readonly call: OperationFetchClient["call"];
    /** Check after browser/device work before making the next operation call. */
    readonly current: Effect.Effect<void, OperationHttpError>;
    readonly completeAuthentication: <Route extends AnyRoute>(
      route: Route,
      input: RouteInput<Route>,
      subject: (value: RouteSuccess<Route>) => string | null | undefined,
    ) => Effect.Effect<
      RouteSuccess<Route>,
      RouteFailure<Route> | OperationHttpError,
      | Route["operation"]["rpc"]["successSchema"]["DecodingServices"]
      | Route["operation"]["rpc"]["errorSchema"]["DecodingServices"]
    >;
  }
>()("effect-auth/AuthAtomWorkflow") {}
