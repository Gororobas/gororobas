import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as NodeCrypto from "@yielded/crypto/platform-node";
import * as Portable from "@yielded/crypto/Portable";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Layer } from "effect";

export const backends = [
  { name: "WebCrypto", extended: false, layer: WebCrypto.layer(globalThis.crypto.subtle) },
  { name: "Portable", extended: true, layer: Portable.layer(globalThis.crypto.subtle) },
  { name: "NodeCrypto", extended: true, layer: NodeCrypto.layer() },
].map((backend) => ({
  ...backend,
  layer: backend.layer.pipe(Layer.provide(KdfAdmission.layer())),
}));

export const utf8 = (value: string) => new TextEncoder().encode(value);
