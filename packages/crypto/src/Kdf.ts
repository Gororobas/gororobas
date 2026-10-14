import { Context, type Effect, type Redacted, Schema } from "effect";

import type { KdfBusy, OperationError } from "./Errors";

const positive = Schema.Int.check(Schema.isGreaterThan(0));
const uint32 = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0xffffffff }));
const bytes = Schema.Uint8Array;
const secret = Schema.Redacted(bytes, { disallowJsonEncode: true });
const argon2Bytes = bytes.check(Schema.isMaxLength(0xffffffff));
const argon2Secret = Schema.Redacted(argon2Bytes, { disallowJsonEncode: true });

export const Argon2idInput = Schema.Struct({
  password: argon2Secret,
  salt: argon2Bytes.check(Schema.isMinLength(8)),
  memoryKiB: uint32,
  passes: uint32,
  parallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0xffffff })),
  length: Schema.Int.check(Schema.isBetween({ minimum: 4, maximum: 0xffffffff })),
  secret: Schema.optionalKey(argon2Secret),
  associatedData: Schema.optionalKey(argon2Bytes),
});

export type Argon2idInput = typeof Argon2idInput.Type;

export const ScryptInput = Schema.Struct({
  password: secret,
  salt: bytes,
  cost: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 0x80000000 })),
  blockSize: uint32,
  parallelism: uint32,
  length: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0x7fffffff })),
});

export type ScryptInput = typeof ScryptInput.Type;

export const Pbkdf2Input = Schema.Struct({
  password: secret,
  salt: bytes,
  // Native Node/Bun PBKDF2 accepts a positive signed 32-bit iteration count.
  iterations: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0x7fffffff })),
  // WebCrypto takes an unsigned 32-bit bit count; this API takes whole bytes.
  length: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0x1fffffff })),
});

export type Pbkdf2Input = typeof Pbkdf2Input.Type;

export const HkdfInput = Schema.Struct({
  key: secret,
  salt: bytes,
  info: bytes.check(Schema.isMaxLength(1024)),
  length: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 255 * 32 })),
});

export type HkdfInput = typeof HkdfInput.Type;

/** Resource ceilings, not a password-strength policy. Limits apply per permit.
 * Scrypt bounds its allocation by maximumMemoryKiB and N*r*p/8 by
 * maximumMemoryPasses. maximumPasses/maximumParallelism apply to Argon2id.
 */
export const Limits = Schema.Struct({
  maximumMemoryKiB: positive,
  maximumPasses: positive,
  maximumParallelism: positive,
  maximumMemoryPasses: positive,
  maximumIterations: positive,
  maximumInputBytes: positive,
  maximumOutputBytes: positive,
});

export type Limits = typeof Limits.Type;

export const defaultLimits: Limits = Object.freeze({
  maximumMemoryKiB: 65536,
  maximumPasses: 6,
  maximumParallelism: 4,
  maximumMemoryPasses: 131072,
  maximumIterations: 1000000,
  maximumInputBytes: 65536,
  maximumOutputBytes: 1024,
});

/**
 * Byte-preserving derivation; no text normalization, PHC parsing or password policy.
 * Argon2id uses version 19; PBKDF2 and HKDF use SHA-256. Scrypt names N/r/p as
 * cost/blockSize/parallelism. A backend captures shared
 * KdfAdmission when its Layer is built and retains admission until work and cleanup
 * finish, including when a native operation cannot be cancelled.
 */
export class Kdf extends Context.Service<
  Kdf,
  {
    readonly argon2id: (
      input: Argon2idInput,
    ) => Effect.Effect<Redacted.Redacted<Uint8Array>, OperationError | KdfBusy>;
    readonly scrypt: (
      input: ScryptInput,
    ) => Effect.Effect<Redacted.Redacted<Uint8Array>, OperationError | KdfBusy>;
    readonly pbkdf2: (
      input: Pbkdf2Input,
    ) => Effect.Effect<Redacted.Redacted<Uint8Array>, OperationError | KdfBusy>;
    readonly hkdf: (
      input: HkdfInput,
    ) => Effect.Effect<Redacted.Redacted<Uint8Array>, OperationError | KdfBusy>;
  }
>()("@yielded/crypto/Kdf") {}
