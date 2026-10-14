/**
 * Adapted from noble-ciphers, Copyright (c) 2022 Paul Miller.
 * MIT; source revision 785181b0772ba84afbe812025714163e4e48262f.
 * Poly1305 arithmetic derives from the public-domain poly1305-donna implementation.
 * See ../../THIRD_PARTY_NOTICES.md for source mapping and licenses.
 */
import { Poly1305 } from "./poly1305";

const rotl = (word: number, shift: number): number => (word << shift) | (word >>> (32 - shift));

function chachaCore(
  s: Uint32Array,
  k: Uint32Array,
  n: Uint32Array,
  out: Uint32Array,
  cnt: number,
  rounds = 20,
): void {
  let y00 = s[0],
    y01 = s[1],
    y02 = s[2],
    y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
    y04 = k[0],
    y05 = k[1],
    y06 = k[2],
    y07 = k[3], // Key      Key     Key     Key
    y08 = k[4],
    y09 = k[5],
    y10 = k[6],
    y11 = k[7], // Key      Key     Key     Key
    y12 = cnt,
    y13 = n[0],
    y14 = n[1],
    y15 = n[2]; // Counter  Counter	Nonce   Nonce

  // Save state to temporary variables
  let x00 = y00,
    x01 = y01,
    x02 = y02,
    x03 = y03,
    x04 = y04,
    x05 = y05,
    x06 = y06,
    x07 = y07,
    x08 = y08,
    x09 = y09,
    x10 = y10,
    x11 = y11,
    x12 = y12,
    x13 = y13,
    x14 = y14,
    x15 = y15;

  for (let r = 0; r < rounds; r += 2) {
    x00 = (x00 + x04) | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = (x08 + x12) | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = (x00 + x04) | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = (x08 + x12) | 0;
    x04 = rotl(x04 ^ x08, 7);

    x01 = (x01 + x05) | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = (x09 + x13) | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = (x01 + x05) | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = (x09 + x13) | 0;
    x05 = rotl(x05 ^ x09, 7);

    x02 = (x02 + x06) | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = (x10 + x14) | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = (x02 + x06) | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = (x10 + x14) | 0;
    x06 = rotl(x06 ^ x10, 7);

    x03 = (x03 + x07) | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = (x11 + x15) | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = (x03 + x07) | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = (x11 + x15) | 0;
    x07 = rotl(x07 ^ x11, 7);

    x00 = (x00 + x05) | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = (x10 + x15) | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = (x00 + x05) | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = (x10 + x15) | 0;
    x05 = rotl(x05 ^ x10, 7);

    x01 = (x01 + x06) | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = (x11 + x12) | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = (x01 + x06) | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = (x11 + x12) | 0;
    x06 = rotl(x06 ^ x11, 7);

    x02 = (x02 + x07) | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = (x08 + x13) | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = (x02 + x07) | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = (x08 + x13) | 0;
    x07 = rotl(x07 ^ x08, 7);

    x03 = (x03 + x04) | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = (x09 + x14) | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = (x03 + x04) | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = (x09 + x14) | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  // Write output
  let oi = 0;

  out[oi++] = (y00 + x00) | 0;
  out[oi++] = (y01 + x01) | 0;
  out[oi++] = (y02 + x02) | 0;
  out[oi++] = (y03 + x03) | 0;
  out[oi++] = (y04 + x04) | 0;
  out[oi++] = (y05 + x05) | 0;
  out[oi++] = (y06 + x06) | 0;
  out[oi++] = (y07 + x07) | 0;
  out[oi++] = (y08 + x08) | 0;
  out[oi++] = (y09 + x09) | 0;
  out[oi++] = (y10 + x10) | 0;
  out[oi++] = (y11 + x11) | 0;
  out[oi++] = (y12 + x12) | 0;
  out[oi++] = (y13 + x13) | 0;
  out[oi++] = (y14 + x14) | 0;
  out[oi++] = (y15 + x15) | 0;
}
/**
 * hchacha hashes key and nonce into key' and nonce' for xchacha20.
 */
function hchacha(s: Uint32Array, k: Uint32Array, i: Uint32Array, out: Uint32Array): void {
  let x00 = s[0],
    x01 = s[1],
    x02 = s[2],
    x03 = s[3],
    x04 = k[0],
    x05 = k[1],
    x06 = k[2],
    x07 = k[3],
    x08 = k[4],
    x09 = k[5],
    x10 = k[6],
    x11 = k[7],
    x12 = i[0],
    x13 = i[1],
    x14 = i[2],
    x15 = i[3];

  for (let r = 0; r < 20; r += 2) {
    x00 = (x00 + x04) | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = (x08 + x12) | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = (x00 + x04) | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = (x08 + x12) | 0;
    x04 = rotl(x04 ^ x08, 7);

    x01 = (x01 + x05) | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = (x09 + x13) | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = (x01 + x05) | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = (x09 + x13) | 0;
    x05 = rotl(x05 ^ x09, 7);

    x02 = (x02 + x06) | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = (x10 + x14) | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = (x02 + x06) | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = (x10 + x14) | 0;
    x06 = rotl(x06 ^ x10, 7);

    x03 = (x03 + x07) | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = (x11 + x15) | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = (x03 + x07) | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = (x11 + x15) | 0;
    x07 = rotl(x07 ^ x11, 7);

    x00 = (x00 + x05) | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = (x10 + x15) | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = (x00 + x05) | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = (x10 + x15) | 0;
    x05 = rotl(x05 ^ x10, 7);

    x01 = (x01 + x06) | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = (x11 + x12) | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = (x01 + x06) | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = (x11 + x12) | 0;
    x06 = rotl(x06 ^ x11, 7);

    x02 = (x02 + x07) | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = (x08 + x13) | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = (x02 + x07) | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = (x08 + x13) | 0;
    x07 = rotl(x07 ^ x08, 7);

    x03 = (x03 + x04) | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = (x09 + x14) | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = (x03 + x04) | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = (x09 + x14) | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;

  out[oi++] = x00;
  out[oi++] = x01;
  out[oi++] = x02;
  out[oi++] = x03;
  out[oi++] = x12;
  out[oi++] = x13;
  out[oi++] = x14;
  out[oi++] = x15;
}

const sigma = Uint32Array.from([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
const padding = new Uint8Array(16);

interface State {
  readonly key: Uint32Array;
  readonly nonce: Uint32Array;
  readonly words: Uint32Array;
  readonly stream: Uint8Array;
  readonly streamView: DataView;
}

const readWords = (data: Uint8Array, words: Uint32Array): void => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i < words.length; i++) words[i] = view.getUint32(i * 4, true);
};

function withState<A>(key: Uint8Array, nonce: Uint8Array, operation: (state: State) => A): A {
  const original = new Uint32Array(8);
  const extendedNonce = new Uint32Array(4);

  const stream = new Uint8Array(64);

  const state: State = {
    key: new Uint32Array(8),
    nonce: new Uint32Array(3),
    words: new Uint32Array(16),
    stream,
    streamView: new DataView(stream.buffer),
  };

  try {
    readWords(key, original);
    readWords(nonce.subarray(0, 16), extendedNonce);
    hchacha(sigma, original, extendedNonce, state.key);
    // XChaCha uses HChaCha(key, nonce[0..16]), then 0 || nonce[16..24].
    const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);

    state.nonce[1] = view.getUint32(16, true);
    state.nonce[2] = view.getUint32(20, true);

    return operation(state);
  } finally {
    original.fill(0);
    extendedNonce.fill(0);
    state.key.fill(0);
    state.nonce.fill(0);
    state.words.fill(0);
    state.stream.fill(0);
  }
}

const blockAt = (state: State, counter: number): void => {
  chachaCore(sigma, state.key, state.nonce, state.words, counter);
  const view = state.streamView;

  for (let i = 0; i < 16; i++) view.setUint32(i * 4, state.words[i], true);
};

const xor = (state: State, data: Uint8Array, out: Uint8Array): void => {
  for (let offset = 0, counter = 1; offset < data.length; offset += 64, counter++) {
    blockAt(state, counter);
    const length = Math.min(64, data.length - offset);

    for (let i = 0; i < length; i++) out[offset + i] = data[offset + i] ^ state.stream[i];
  }
};

const padded = (mac: Poly1305, data: Uint8Array): void => {
  mac.update(data);
  const remainder = data.length % 16;

  if (remainder !== 0) mac.update(padding.subarray(remainder));
};

const tag = (state: State, ciphertext: Uint8Array, additionalData: Uint8Array): Uint8Array => {
  const lengths = new Uint8Array(16);
  const view = new DataView(lengths.buffer);

  // RFC 8439 authenticates little-endian 64-bit byte lengths, AAD first.
  view.setUint32(0, additionalData.length >>> 0, true);
  view.setUint32(4, Math.floor(additionalData.length / 0x100000000), true);
  view.setUint32(8, ciphertext.length >>> 0, true);
  view.setUint32(12, Math.floor(ciphertext.length / 0x100000000), true);
  blockAt(state, 0);
  const mac = new Poly1305(state.stream.subarray(0, 32));

  try {
    padded(mac, additionalData);
    padded(mac, ciphertext);

    return mac.update(lengths).digest();
  } finally {
    mac.destroy();
    lengths.fill(0);
    state.stream.fill(0);
  }
};

export const encrypt = (
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array =>
  withState(key, nonce, (state) => {
    const out = new Uint8Array(plaintext.length + 16);
    const ciphertext = out.subarray(0, plaintext.length);

    try {
      xor(state, plaintext, ciphertext);
      const authentication = tag(state, ciphertext, additionalData);

      out.set(authentication, plaintext.length);
      authentication.fill(0);

      return out;
    } catch (error) {
      out.fill(0);
      // oxlint-disable-next-line effect/no-untyped-throw -- Synchronous primitive rethrows the original host failure after wiping secret buffers; the Effect adapter classifies it.
      throw error;
    }
  });

/** Authenticate the complete input before allocating or producing plaintext. */
export const decrypt = (
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData: Uint8Array,
  sealed: Uint8Array,
): Uint8Array | undefined =>
  withState(key, nonce, (state) => {
    const ciphertext = sealed.subarray(0, -16);
    const authentication = tag(state, ciphertext, additionalData);
    let difference = 0;

    for (let i = 0; i < 16; i++) difference |= authentication[i] ^ sealed[ciphertext.length + i];
    authentication.fill(0);
    if (difference !== 0) return undefined;
    const out = new Uint8Array(ciphertext.length);

    try {
      xor(state, ciphertext, out);

      return out;
    } catch (error) {
      out.fill(0);
      // oxlint-disable-next-line effect/no-untyped-throw -- Synchronous primitive rethrows the original host failure after wiping secret buffers; the Effect adapter classifies it.
      throw error;
    }
  });
