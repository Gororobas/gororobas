import { Context, Effect, Layer } from "effect";

import { type OperationError, UnsupportedAlgorithm } from "../Errors";

export interface ScryptParameters {
  readonly password: Uint8Array<ArrayBuffer>;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelism: number;
  readonly length: number;
  readonly maximumMemoryBytes: number;
}

/** Raw derivation selected by a platform Layer; Kdf owns validation and admission. */
export class ScryptBackend extends Context.Service<
  ScryptBackend,
  {
    readonly derive: (input: ScryptParameters) => Effect.Effect<Uint8Array, OperationError>;
  }
>()("@yielded/crypto/internal/scrypt-backend") {}

export const layerUnsupported = Layer.succeed(ScryptBackend, {
  derive: () => Effect.fail(UnsupportedAlgorithm.make({})),
});
