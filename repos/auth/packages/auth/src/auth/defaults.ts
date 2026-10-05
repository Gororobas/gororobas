import type { Context } from "effect";
import { Crypto, Effect, Layer, Option } from "effect";

import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { layerCryptoWeb, SubtleCrypto } from "../WebCrypto";

/** Keep explicitly supplied services. Shared Layer values also share their resources. */
export const defaultLayer = <I, S, E, R>(
  service: Context.Key<I, S>,
  fallback: Layer.Layer<I, E, R>,
): Layer.Layer<I, E, R> =>
  Layer.unwrap(
    Effect.map(Effect.serviceOption(service), (current) =>
      Option.isSome(current) ? Layer.succeed(service, current.value) : fallback,
    ),
  );

export const cryptoLayer = Layer.mergeAll(
  defaultLayer(Crypto.Crypto, layerCryptoWeb),
  defaultLayer(SubtleCrypto, SubtleCrypto.layerWeb),
);

export const hooksLayer = defaultLayer(LifecycleHooks, LifecycleHooks.empty);
