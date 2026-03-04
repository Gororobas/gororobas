import { Handle } from "../primitives.js"

/**
 * Limits a string to a certain length for UI or SEO purposes.
 *
 * Dive further: https://hdoro.dev/javascript-truncation
 */
export function truncate(str: string, maxLength: number) {
  if (str.length < maxLength) {
    return str
  }

  if (maxLength < 0) return ""

  // To prevent truncating in the middle of words, let's get
  // the position of the first whitespace after the truncation
  const firstWhitespaceAfterTruncation = str.slice(maxLength).search(/\s/) + maxLength

  return `${str.slice(0, firstWhitespaceAfterTruncation)}...`
}

export function capitalize(str: string, allWords = true): string {
  if (typeof str !== "string" || !str[0]) {
    return str
  }

  if (allWords) {
    return str
      .split(" ")
      .map((word) => capitalize(word, false))
      .join(" ")
  }

  return `${str[0].toUpperCase()}${str.slice(1) || ""}`
}

/**
 * Makes a string URL-friendly.
 * Removes special characters, spaces, upper-cased letters.
 */
export function stringToHandle(str: string) {
  return (
    str
      .toString()
      .normalize("NFD") // split an accented letter in the base letter and the acent
      // Replace unicode characters, such as accents
      .replace(/[\u0300-\u036f\u0023]/g, "") // remove all previously split accents
      .toLowerCase()
      // Replace any character that isn't accepted
      .replace(/[^a-z0-9 -]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/-$/g, "")
      .replace(/^-/g, "")
      .trim() as Handle
  )
}
