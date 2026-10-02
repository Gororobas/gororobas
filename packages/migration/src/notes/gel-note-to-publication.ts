import { CreatePostData, PublicationVisibility } from "@gororobas/domain"
import { Effect, Schema } from "effect"

import type { GelNote } from "../schemas/gel/entities.js"

export const gelNoteToPublication = Effect.fn("gelNoteToPublication")(function* (note: GelNote) {
  const visibility = yield* Schema.decodeUnknownEffect(PublicationVisibility)(
    note.publish_status ?? (note.public ? "PUBLIC" : "PRIVATE"),
  )

  // Publications have one content document; keep the original title nodes before the body.
  return CreatePostData.make({
    locale: "pt",
    visibility,
    content: {
      ...note.title,
      content: [...note.title.content, ...(note.body?.content ?? [])],
    },
  })
})
