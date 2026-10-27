/** A word in a text, folded so case and accents don't matter, with its original offsets. */
export interface Word {
  readonly value: string
  readonly start: number
  readonly end: number
}

/** Case- and accent-insensitive words, with their offsets in the original text. */
export const words = (text: string): ReadonlyArray<Word> =>
  Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    value: match[0].normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("und"),
    start: match.index,
    end: match.index + match[0].length,
  }))
