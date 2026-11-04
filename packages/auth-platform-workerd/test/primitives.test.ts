import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as Schema from "effect/Schema";
import { expect } from "vite-plus/test";

import { argon2 } from "../src/internal/argon2";
import { argon2Vector as vector } from "./vectors";
const bytes = Schema.decodeSync(Schema.Uint8ArrayFromHex);

it.effect("derives RFC9106 Argon2id v19 with lanes, secret and associated data", () =>
  Effect.gen(function* () {
    const password = bytes(vector.passwordHex);

    const derived = yield* argon2({
      password,
      salt: bytes(vector.saltHex),
      secret: bytes(vector.secretHex),
      associatedData: bytes(vector.associatedDataHex),
      memoryKiB: vector.memoryKiB,
      passes: vector.iterations,
      parallelism: vector.parallelism,
      length: vector.lengthBytes,
    });

    expect(Hex.encode(derived)).toBe(vector.expectedHex);
    expect(Hex.encode(password)).toBe(vector.passwordHex);
  }),
);
