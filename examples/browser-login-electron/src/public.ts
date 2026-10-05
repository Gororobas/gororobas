import { Schema } from "effect";

import { AuthApi } from "../../shared/account/contract";

export const channel = "yielded:auth";

export const Action = Schema.Literals([
  "session",
  "signIn",
  "resume",
  "cancel",
  "reconcile",
  "signOut",
]);

export type Action = typeof Action.Type;

export class DesktopError extends Schema.TaggedError<DesktopError>()("DesktopError", {
  reason: Schema.Literals([
    "unavailable",
    "storage",
    "busy",
    "cancelled",
    "callback",
    "expired",
    "indeterminate",
    "sign-out",
    "request",
  ]),
}) {}

export const State = Schema.Struct({
  session: Schema.NullOr(AuthApi.sessions.Session),
  attempt: Schema.Literals(["none", "waiting", "indeterminate"]),
});

export const Reply = Schema.Union([
  Schema.TaggedStruct("Success", { value: State }),
  Schema.TaggedStruct("Failure", { error: DesktopError }),
]);

// Only these argument-free capabilities cross the isolated preload bridge.
export interface Bridge {
  readonly session: () => Promise<unknown>;
  readonly signIn: () => Promise<unknown>;
  readonly resume: () => Promise<unknown>;
  readonly cancel: () => Promise<unknown>;
  readonly reconcile: () => Promise<unknown>;
  readonly signOut: () => Promise<unknown>;
}

declare global {
  interface Window {
    readonly auth: Bridge;
  }
}
