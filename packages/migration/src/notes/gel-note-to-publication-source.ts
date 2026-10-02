import { PostSourceData, PublicationId, TagId, WikiArticleId } from "@gororobas/domain"
import { Effect, Schema } from "effect"

import { migrateRichText } from "../migrate-rich-text.js"
import { GelNoteWithRelations } from "../schemas/gel/entities.js"
import { ensureMappedId, MigrationContext } from "../services/migration-context.js"
import { gelNoteToPublication } from "./gel-note-to-publication.js"

class MissingNoteOwner extends Schema.TaggedError<MissingNoteOwner>()("MissingNoteOwner", {
  message: Schema.String,
}) {}

export const gelNoteToPublicationSource = Effect.fn("gelNoteToPublicationSource")(function* (
  note: GelNoteWithRelations,
) {
  const context = yield* MigrationContext
  const post = yield* gelNoteToPublication(note)
  if (!note.created_by)
    return yield* Effect.fail(new MissingNoteOwner({ message: `Note ${note.handle} has no owner` }))
  const ownerProfileId = yield* context.resolveId(note.created_by.id, "Profile")
  const content = yield* migrateRichText(post.content)
  const publication = yield* Schema.decodeUnknownEffect(PostSourceData)({
    metadata: {
      kind: "POST",
      handle: note.handle,
      ownerProfileId,
      publishedAt: note.published_at.toISOString(),
      visibility: post.visibility,
    },
    locales: {
      pt: {
        content,
        originalLocale: "pt",
        translationSource: "ORIGINAL",
        translatedAtCrdtFrontier: null,
      },
    },
  })
  return publication
})

export const noteMigrationReferences = Effect.fn("noteMigrationReferences")(function* (
  note: GelNoteWithRelations,
) {
  const context = yield* MigrationContext
  const id = yield* context
    .resolveId(note.id, "Publication")
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(PublicationId)))
  const tagIds = yield* Effect.forEach(
    note.types,
    (type) =>
      ensureMappedId({ id: `note-type:${type}` }, "Tag").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(TagId)),
      ),
    { concurrency: 1 },
  )
  const wikiArticleIds = yield* Effect.forEach(
    note.related_to_vegetables,
    (plant) =>
      context
        .resolveId(plant.id, "WikiArticle")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WikiArticleId))),
    { concurrency: 1 },
  )
  return { id, tagIds, wikiArticleIds }
})
