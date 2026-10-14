import { Context, type Effect, Schema, type Scope } from "effect";

import type { OperationError } from "./Errors";

/** SHA-1 exists for interoperability with TOTP, not new signature designs. */
export const Algorithm = Schema.Literals(["SHA-1", "SHA-256", "SHA-384", "SHA-512"]);
export type Algorithm = typeof Algorithm.Type;

export const KeyInput = Schema.Struct({
  algorithm: Algorithm,
  key: Schema.Redacted(Schema.Uint8Array, { disallowJsonEncode: true }),
});

export type KeyInput = typeof KeyInput.Type;

export const Input = Schema.Struct({
  ...KeyInput.fields,
  data: Schema.Uint8Array,
});

export type Input = typeof Input.Type;

export const VerifyInput = Schema.Struct({ ...Input.fields, tag: Schema.Uint8Array });
export type VerifyInput = typeof VerifyInput.Type;

/** An imported, nonextractable key, usable only while its owning Scope is open. */
export interface Key {
  readonly sign: (data: Uint8Array) => Effect.Effect<Uint8Array, OperationError>;
  readonly verify: (data: Uint8Array, tag: Uint8Array) => Effect.Effect<boolean, OperationError>;
}

export class Hmac extends Context.Service<
  Hmac,
  {
    /** Snapshot and validate once. Closing the Scope joins native work and releases the key. */
    readonly importKey: (input: KeyInput) => Effect.Effect<Key, OperationError, Scope.Scope>;
    readonly sign: (input: Input) => Effect.Effect<Uint8Array, OperationError>;
    /** A wrong tag is false; a key or backend failure stays in the error channel. */
    readonly verify: (input: VerifyInput) => Effect.Effect<boolean, OperationError>;
  }
>()("@yielded/crypto/Hmac") {}
