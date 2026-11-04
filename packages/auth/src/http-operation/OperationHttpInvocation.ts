import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { SessionApiError } from "../auth/session";
import { withoutObservability } from "../internal/diagnostics";
import type { AuthInvocation } from "../operations/context";
import type { SessionCacheOwner } from "../sessions/cookieCache";
import type { OperationHttpError } from "./errors";
import type { HttpCredentials } from "./models";

export class OperationHttpInvocation extends Context.Service<
  OperationHttpInvocation,
  SessionCacheOwner & {
    /** A public action resolves caller identity only when its local method needs it. */
    readonly request?: (
      request: Request,
      credentials: HttpCredentials,
    ) => Effect.Effect<AuthInvocation, SessionApiError>;
    readonly resolve: (
      request: Request,
      credentials: HttpCredentials,
    ) => Effect.Effect<AuthInvocation, OperationHttpError>;
  }
>()("effect-auth/OperationHttpInvocation") {}

export const invocationLayer = <R>(
  resolve: (
    request: Request,
    credentials: HttpCredentials,
  ) => Effect.Effect<AuthInvocation, OperationHttpError, R>,
) =>
  Layer.effect(
    OperationHttpInvocation,
    Effect.gen(function* () {
      const services = (yield* Effect.context<R>()).pipe(withoutObservability);

      return {
        resolve: (request: Request, credentials: HttpCredentials) =>
          resolve(request, credentials).pipe(Effect.provide(services)),
      };
    }),
  );
