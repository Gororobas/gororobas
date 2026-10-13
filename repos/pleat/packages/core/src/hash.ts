// NOTE: class names are part of the server/client contract. A page rendered
// on the server is hydrated by a client that recomputes every class name, so
// the hash must give identical output in every JavaScript runtime. cyrb53 is a
// pure function of the UTF-16 code units, with no seed and no platform input.
const cyrb53 = (input: string): number => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const HASH_LENGTH = 8

/** A short, stable, CSS-identifier-safe digest of `input`. */
export const digest = (input: string): string =>
  cyrb53(input).toString(36).padStart(HASH_LENGTH, '0').slice(-HASH_LENGTH)

/** A 32-bit integer hash of `input`, for Effect's `Hash` protocol. */
export const hash32 = (input: string): number => cyrb53(input) | 0
