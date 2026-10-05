/* eslint-disable import/extensions -- Noble public ESM entrypoints. */
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { TokenDigest } from "@yielded/auth/Schema";
import { Base64Url } from "effect/encoding";
const encoder = new TextEncoder();

export const randomId = () => Base64Url.encode(randomBytes(32));

export const digest = (value: string) =>
  TokenDigest.make(Base64Url.encode(sha256(encoder.encode(value))));
