import { Effect } from "effect";

import { AuthenticationFailed, InvalidInput } from "../Errors";
import type { XChaCha } from "./aead";
import { decrypt, encrypt } from "./xchacha-core";

// Counter zero derives the MAC key; payload blocks use the remaining uint32 values.
const maximumPlaintextBytes = 0xffffffff * 64;

export const xchacha: XChaCha = {
  encrypt: Effect.fnUntraced(function* ({ key, nonce, additionalData, data }) {
    if (data.length > maximumPlaintextBytes) return yield* InvalidInput.make({ reason: "data" });

    return encrypt(key, nonce, additionalData, data);
  }),
  decrypt: Effect.fnUntraced(function* ({ key, nonce, additionalData, data }) {
    if (data.length - 16 > maximumPlaintextBytes)
      return yield* InvalidInput.make({ reason: "data" });

    const plaintext = decrypt(key, nonce, additionalData, data);

    if (plaintext === undefined) return yield* AuthenticationFailed.make({});

    return plaintext;
  }),
};
