import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { defaultLayer } from "../auth/defaults";
import { PasswordHashingUnavailable } from "./errors";

/** Scrypt is separate from Effect Kdf. PasswordHashing validates costs and owns
 * the input buffers; implementations must join native work before returning.
 */
export class Scrypt extends Context.Service<
  Scrypt,
  {
    readonly derive: (input: {
      readonly password: Uint8Array;
      readonly salt: Uint8Array;
      readonly cost: number;
      readonly blockSize: number;
      readonly parallelism: number;
      readonly length: number;
      readonly maximumMemoryBytes: number;
    }) => Effect.Effect<Uint8Array, PasswordHashingUnavailable>;
  }
>()("effect-auth/password/Scrypt") {}

/** Without an explicit backend, scrypt fails closed; other password formats work. */
export const defaultScrypt = defaultLayer(
  Scrypt,
  Layer.succeed(Scrypt, {
    derive: () => Effect.fail(PasswordHashingUnavailable.make({})),
  }),
);
