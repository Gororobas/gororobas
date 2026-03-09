import { customAlphabet, urlAlphabet } from "nanoid/non-secure"

import { TiptapDocument } from "../../rich-text/domain.js"
import { tiptapToText } from "../../rich-text/tiptap-to-text.js"
import { Handle } from "../primitives.js"
import { stringToHandle, truncate } from "./strings.js"

const nanoid = customAlphabet(urlAlphabet, 10)

/** Transforms a piece of content into a human-readable URL with a unique ID at the end */
export function contentToHandle(content: TiptapDocument) {
  return Handle.makeUnsafe(
    `${truncate(stringToHandle(tiptapToText(content)), 30)}-${nanoid(8).toLowerCase()}`,
  )
}
