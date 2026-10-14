import { Context, type Effect, type Redacted } from "effect";

import type { HookDenied } from "../hooks/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthResolvedCall } from "../operations/credentials";
import type { SessionCacheCommand } from "../sessions/cookieCache";
import type { SessionUnavailable } from "../sessions/errors";
import type { SessionApiError } from "./session";

/** Supplied by the host for one request or native workflow, never a shared auth Layer.
 * @effect-leakable-service
 */
export class AuthRequest extends Context.Service<
  AuthRequest,
  AuthResolvedCall & {
    /** Set by the trusted named action declaration while its implementation executes. */
    readonly actionMode?: "query" | "mutation";
    /** Browser mutation binding; snapshots require a valid incoming generation. */
    readonly sessionCacheGeneration?: Redacted.Redacted<string>;
    /** Establish a missing browser binding without issuing a snapshot in the same response. */
    readonly initializeSessionCache?: Effect.Effect<void, SessionUnavailable>;
    /** Cookie snapshots are private read responses, separate from credential issuance. */
    readonly sessionCacheCommandSink?: (command: SessionCacheCommand) => Effect.Effect<void>;
    /** Host admission runs before mutation side effects; absent for trusted local callers. */
    readonly beforeMutation?: Effect.Effect<void, HookDenied>;
    /** HTTP adapters resolve caller authority only when an authentication method needs it. */
    readonly resolveInvocation?: Effect.Effect<AuthInvocation, SessionApiError>;
  }
>()("effect-auth/AuthRequest") {}
