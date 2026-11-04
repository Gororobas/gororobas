import * as BunCrypto from "@effect/platform-bun/BunCrypto";
import { KdfAdmission } from "@yielded/auth/Password";
import { Layer } from "effect";

// Share admission across requests in these Bun examples.
export const CryptoLive = Layer.merge(BunCrypto.layer, KdfAdmission.layer());
