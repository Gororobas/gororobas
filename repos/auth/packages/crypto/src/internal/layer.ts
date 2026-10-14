import { Context, Effect, Layer } from "effect";

import { Aead } from "../Aead";
import { Hmac } from "../Hmac";
import { defaultLimits, Kdf, Limits } from "../Kdf";
import { Signature } from "../Signature";
import { makeAead, type XChaCha } from "./aead";
import { decode } from "./common";
import { makeHmac } from "./hmac";
import { type Argon2, makeKdf } from "./kdf";
import { makeSignature } from "./signature";

export const makeCryptoLayer = (subtle: SubtleCrypto, xchacha?: XChaCha) =>
  Layer.syncContext(() =>
    Context.make(Aead, makeAead(subtle, xchacha)).pipe(
      Context.add(Hmac, makeHmac(subtle)),
      Context.add(Signature, makeSignature(subtle)),
    ),
  );

export const makeKdfLayer = (subtle: SubtleCrypto, input: Partial<Limits>, argon2?: Argon2) => {
  const snapshot = { ...defaultLimits, ...input };

  return Layer.effect(Kdf)(
    Effect.gen(function* () {
      const limits = yield* decode(Limits, snapshot, "parameters");

      return yield* makeKdf(subtle, limits, argon2);
    }),
  );
};

export const makeLayer = (
  subtle: SubtleCrypto,
  input: Partial<Limits>,
  extensions: {
    readonly argon2?: Argon2;
    readonly xchacha?: XChaCha;
  } = {},
) =>
  Layer.merge(
    makeCryptoLayer(subtle, extensions.xchacha),
    makeKdfLayer(subtle, input, extensions.argon2),
  );
