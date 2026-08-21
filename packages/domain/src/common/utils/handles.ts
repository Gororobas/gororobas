import { TiptapDocument } from "../../rich-text/domain.js"
import { tiptapToText } from "../../rich-text/tiptap-to-text.js"
import { Handle } from "../primitives.js"
import { truncate } from "./strings.js"

/**
 * Makes a string URL-friendly.
 * Removes special characters, spaces, upper-cased letters.
 */
export const stringToHandle = (str: string) =>
  Handle.makeEffect(
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
      .trim(),
  )

/** Transforms a piece of content into a human-readable URL with a unique ID at the end */
export const richTextToHandle = (content: TiptapDocument) =>
  stringToHandle(truncate(tiptapToText(content), 30))
