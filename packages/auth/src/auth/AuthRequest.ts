import { Context, type Effect } from "effect";

import type { HookDenied } from "../hooks/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthResolvedCall } from "../operations/credentials";
import type { SessionApiError } from "./session";

/** Supplied by the host for one request or native workflow, never a shared auth Layer.
 * @effect-leakable-service
 */
export class AuthRequest extends Context.Service<
  AuthRequest,
  AuthResolvedCall & {
    /** Set by the trusted named action declaration while its implementation executes. */
    readonly actionMode?: "query" | "mutation";
    /** Host admission runs before mutation side effects; absent for trusted local callers. */
    readonly beforeMutation?: Effect.Effect<void, HookDenied>;
    /** HTTP adapters resolve caller authority only when an authentication method needs it. */
    readonly resolveInvocation?: Effect.Effect<AuthInvocation, SessionApiError>;
  }
>()("effect-auth/AuthRequest") {}
