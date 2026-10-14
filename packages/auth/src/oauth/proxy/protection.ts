import { Effect, Layer, Schema } from "effect";

import { encodeUtf8, payloadEncryption } from "../encryption/payload";
import { OAuthUnavailable } from "../signInErrors";
import type { OAuthTransactionKeyring } from "../transactionKeyring";
import {
  ConfigurationError,
  Envelope,
  FlowContext,
  Payload,
  Protector,
  Unavailable,
} from "./models";

/** Callback-server-only keys. Participating environments never receive these keys. */
export const protectorLayer = (keys: OAuthTransactionKeyring) =>
  Layer.effect(
    Protector,
    payloadEncryption(
      {
        context: FlowContext,
        plaintext: Payload,
        envelope: Envelope,
        format: "oauth-proxy-xchacha20poly1305-v1",
        maximumPlaintextBytes: 131072,
        aad: Effect.fnUntraced(function* (context, keyId) {
          const encoded = yield* Schema.encodeEffect(
            Schema.fromJsonString(
              Schema.Tuple([
                Schema.Literal("effect-auth/oauth-proxy/v1"),
                Schema.String,
                FlowContext,
              ]),
            ),
          )(["effect-auth/oauth-proxy/v1", keyId, context]).pipe(
            Effect.mapError(() => OAuthUnavailable.make({})),
          );

          return yield* encodeUtf8(encoded, 16384);
        }),
        validate: (_context, payload) => Effect.succeed(payload),
      },
      keys,
    ).pipe(
      Effect.map((protector) =>
        Protector.of({
          seal: (context, payload) =>
            protector.seal(context, payload).pipe(Effect.mapError(() => Unavailable.make({}))),
          open: (context, envelope) =>
            protector.open(context, envelope).pipe(Effect.mapError(() => Unavailable.make({}))),
        }),
      ),
      Effect.mapError(() => ConfigurationError.make({})),
    ),
  );
