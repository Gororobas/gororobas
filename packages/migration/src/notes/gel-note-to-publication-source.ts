import { ContentLanguage } from "@gororobas/domain"
import { PublicationId, WikiArticleId } from "@gororobas/domain"
import { Effect, Schema } from "effect"

import { migrateRichText } from "../migrate-rich-text.js"
import { GelNoteWithRelations, MigratedPublication } from "../schemas/gel/entities.js"
import { ensureMappedId, MigrationContext } from "../services/migration-context.js"
import { noteTypeGelId } from "../tags/source-gel-tags.js"
import { gelNoteToPublication } from "./gel-note-to-publication.js"

class MissingNoteOwner extends Schema.TaggedError<MissingNoteOwner>()("MissingNoteOwner", {
  message: Schema.String,
}) {}

export const gelNoteToPublicationSource = Effect.fn("gelNoteToPublicationSource")(function* (
  note: GelNoteWithRelations,
) {
  const context = yield* MigrationContext
  const post = yield* gelNoteToPublication(note)
  if (!note.created_by) {
    return yield* new MissingNoteOwner({ message: `Note ${note.handle} has no owner` })
  }
  const ownerProfileId = yield* context.resolveId(note.created_by.id, "Profile")
  const content = yield* migrateRichText(post.content)

  const publication = yield* Schema.decodeEffect(MigratedPublication)({
    handle: note.handle,
    ownerProfileId,
    publishedAt: note.published_at.toISOString(),
    visibility: post.visibility,
    sourceData: {
      metadata: { kind: "POST" },
      sourceContent: content,
      sourceLanguage: ContentLanguage.make("pt"),
      translations: { pt: "original" },
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
    .pipe(Effect.flatMap(Schema.decodeEffect(PublicationId)))

  const noteTypeConceptIds = yield* Effect.forEach(
    note.types,
    (type) =>
      ensureMappedId({ id: noteTypeGelId(type) }, "Tag").pipe(
        Effect.flatMap(Schema.decodeEffect(WikiArticleId)),
      ),
    { concurrency: 1 },
  )

  const plantIds = yield* Effect.forEach(
    note.related_to_vegetables,
    (plant) =>
      context
        .resolveId(plant.id, "WikiArticle")
        .pipe(Effect.flatMap(Schema.decodeEffect(WikiArticleId))),
    { concurrency: 1 },
  )

  return { id, wikiArticleIds: [...noteTypeConceptIds, ...plantIds] }
})
