import { Context, Effect, Redacted, Schema } from "effect";

import type { AuthInvocation } from "./context";
import type { AuthRevealCommand, AuthRevealCommandCollector } from "./reveals";

export type CredentialSlot =
  | "session"
  | "pending-proof"
  | "proof-continuation"
  | "registration"
  | "request-binding"
  | "session-step-up"
  | "password-intent"
  | "connected-intent";

/** Private delivery instructions. Never include these in a Schema/RPC success or lifecycle event. */
export type AuthCredentialCommand =
  | {
      readonly _tag: "Issue";
      readonly slot: CredentialSlot;
      readonly credential: Redacted.Redacted<string>;
      readonly expiresAtMillis: number;
    }
  | { readonly _tag: "Clear"; readonly slot: CredentialSlot };

/** Acceptance into a caller-owned collector, not fallible cookie or secure-store persistence. */
export type AuthCredentialCommandSink = (
  commands: ReadonlyArray<AuthCredentialCommand>,
) => Effect.Effect<void>;

/** Request-local acceptance for private credential commands. */
export class AuthCredentialCommandCollector extends Context.Service<
  AuthCredentialCommandCollector,
  AuthCredentialCommandSink
>()("effect-auth/AuthCredentialCommandCollector") {}

/** Request-local acceptance for private reveal commands. */
export class AuthRevealCommandCollectorService extends Context.Service<
  AuthRevealCommandCollectorService,
  AuthRevealCommandCollector
>()("effect-auth/AuthRevealCommandCollector") {}

export interface AuthOperationResult<A> {
  readonly value: A;
  readonly credentialCommands: ReadonlyArray<AuthCredentialCommand>;
  readonly revealCommands?: ReadonlyArray<AuthRevealCommand>;
}

export interface AuthResolvedCall {
  readonly invocation: AuthInvocation;
  /** Private incoming credentials for this request or native workflow only. */
  readonly credentials: Readonly<Partial<Record<CredentialSlot, Redacted.Redacted<string>>>>;
  readonly credentialCommandSink: AuthCredentialCommandSink;
  readonly revealCommandCollector?: AuthRevealCommandCollector;
}

const slot = Schema.Literals([
  "session",
  "pending-proof",
  "proof-continuation",
  "registration",
  "request-binding",
  "session-step-up",
  "password-intent",
  "connected-intent",
]);

const decodeCommand = Schema.decodeSync(
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Issue"),
      slot,
      credential: Schema.Redacted(Schema.String),
      expiresAtMillis: Schema.Finite,
    }),
    Schema.Struct({ _tag: Schema.Literal("Clear"), slot }),
  ]),
);

/** Package-private synchronous capture shared with the reveal operation boundary. */
export const snapshotCredentialCommands = (
  commands: ReadonlyArray<AuthCredentialCommand>,
): ReadonlyArray<AuthCredentialCommand> => {
  try {
    if (!Array.isArray(commands)) throw new globalThis.Error();
    const length = commands.length;

    if (!Number.isInteger(length) || length < 0 || length > 8) throw new globalThis.Error();
    const slots = new Set<CredentialSlot>();
    const captured: AuthCredentialCommand[] = [];

    for (let index = 0; index < length; index++) {
      const input = commands[index];
      const tag = input._tag;
      const slot = input.slot;

      const value =
        tag === "Issue"
          ? {
              _tag: tag,
              slot,
              credential: Redacted.make(Redacted.value(input.credential)),
              expiresAtMillis: input.expiresAtMillis,
            }
          : { _tag: tag, slot };

      const command = decodeCommand(value);

      if (slots.has(command.slot)) {
        throw new globalThis.Error();
      }
      slots.add(command.slot);
      captured.push(Object.freeze(command));
    }

    return Object.freeze(captured);
  } catch {
    throw new globalThis.Error("Invalid auth credential commands");
  }
};

export const validateCredentialCommands = (commands: ReadonlyArray<AuthCredentialCommand>) =>
  Effect.sync(() => snapshotCredentialCommands(commands));
