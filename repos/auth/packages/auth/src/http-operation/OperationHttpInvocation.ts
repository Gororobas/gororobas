import { Context, Effect, Layer } from "effect";

import type { SessionApiError } from "../auth/session";
import type { AuthInvocation } from "../operations/context";
import type { OperationHttpError } from "./errors";
import type { HttpCredentials } from "./models";

export class OperationHttpInvocation extends Context.Service<
  OperationHttpInvocation,
  {
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
      const services = yield* Effect.context<R>();

      return {
        resolve: (request: Request, credentials: HttpCredentials) =>
          resolve(request, credentials).pipe(Effect.provide(services)),
      };
    }),
  );
