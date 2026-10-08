import { describe, expect, it } from "@effect/vitest"
import { PublicationCommentConcurrentUpdateError, ContentLanguage } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Option, Schema, Record, Array as EffectArray, Order } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"

import { listPublicationCommentTranslationRowsByPublicationCommentId } from "../../src/publication-comments/queries.js"
import { TestLayerWithRepositories, fixture, makeDocument } from "./fixtures.js"

describe("PublicationCommentsRepository", () => {
  it.effect("replaces source text without retaining content in revision history", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.NonEmptyString),
      predicate: (text) =>
        Effect.gen(function* () {
          const { publicationComments, person, publicationCommentId } = yield* fixture
          const before = Option.getOrThrow(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          )
          expect(before.editCount).toBe(0)
          expect(before.editedAt).toBeNull()

          const update = {
            publicationCommentId,
            authorId: person.id,
            expectedCurrentRevisionId: before.currentRevisionId,
            sourceContent: makeDocument(`Edited ${text}`),
          }

          yield* publicationComments.updatePublicationComment(update)
          const edited = Option.getOrThrow(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          )
          expect(edited.sourceLanguage).toBe("und")

          yield* publicationComments.setPublicationCommentSourceLanguage({
            publicationCommentId,
            sourceRevisionId: edited.currentRevisionId,
            sourceLanguage: ContentLanguage.make("en-US"),
          })

          const after = Option.getOrThrow(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          )
          expect(after.sourceContent).toEqual(update.sourceContent)
          expect(after.sourceLanguage).toBe("en-US")

          expect(
            Option.getOrThrow(
              yield* publicationComments.findPublicationCommentContentByIdAndLanguage({
                publicationCommentId,
                language: "en",
              }),
            ).content,
          ).toEqual(update.sourceContent)

          expect(after.editCount).toBe(1)
          expect(after.editedAt).toEqual(after.updatedAt)
          expect(after.createdAt).toEqual(before.createdAt)
          const sql = yield* SqlClient.SqlClient
          const revisions =
            yield* sql`SELECT * FROM publication_comment_content_revisions WHERE publication_comment_id = ${publicationCommentId}`
          expect(revisions).toHaveLength(2)

          revisions.forEach((revision) => {
            expect(EffectArray.sort(Record.keys(revision), Order.String)).toEqual([
              "createdAt",
              "createdById",
              "id",
              "publicationCommentId",
            ])
          })

          yield* publicationComments.updatePublicationComment({
            ...update,
            expectedCurrentRevisionId: after.currentRevisionId,
          })

          expect(
            yield* publicationComments.listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc(
              publicationCommentId,
            ),
          ).toHaveLength(2)

          expect(
            yield* publicationComments.updatePublicationComment(update).pipe(Effect.flip),
          ).toBeInstanceOf(PublicationCommentConcurrentUpdateError)
          expect(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          ).toEqual(Option.some(after))
          yield* publicationComments.deletePublicationComment(publicationCommentId)

          expect(
            yield* publicationComments.listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc(
              publicationCommentId,
            ),
          ).toEqual([])

          return true
        }).pipe(Effect.provide(TestLayerWithRepositories)),
    }),
  )

  it.effect(
    "ties translations to the source revision, removes them on edits, and rejects stale results",
    () =>
      Effect.gen(function* () {
        const { publicationComments, person, publicationCommentId } = yield* fixture
        const before = Option.getOrThrow(
          yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
        )

        const translation = {
          publicationCommentId,
          sourceRevisionId: before.currentRevisionId,
          translations: [{ language: "en" as const, content: makeDocument("Private translation") }],
        }

        yield* publicationComments.upsertPublicationCommentTranslations(translation)
        yield* publicationComments.upsertPublicationCommentTranslations({
          ...translation,
          translations: [{ language: "es", content: makeDocument("Private translation") }],
        })
        yield* publicationComments.upsertPublicationCommentTranslations(translation)
        expect(
          yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
        ).toEqual(Option.some(before))

        expect(
          yield* publicationComments.listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc(
            publicationCommentId,
          ),
        ).toHaveLength(1)

        const rows =
          yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId)
        expect(rows).toHaveLength(2)
        rows.forEach((row) => expect(row.translatedAtRevisionId).toBe(before.currentRevisionId))

        expect(
          Option.getOrThrow(
            yield* publicationComments.findPublicationCommentContentByIdAndLanguage({
              publicationCommentId,
              language: "en",
            }),
          ).content,
        ).toEqual(translation.translations[0]?.content)

        yield* publicationComments.updatePublicationComment({
          publicationCommentId,
          authorId: person.id,
          expectedCurrentRevisionId: before.currentRevisionId,
          sourceContent: makeDocument("New source"),
        })

        expect(
          yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId),
        ).toEqual([])

        expect(
          yield* publicationComments
            .upsertPublicationCommentTranslations(translation)
            .pipe(Effect.flip),
        ).toBeInstanceOf(PublicationCommentConcurrentUpdateError)

        expect(
          Option.isNone(
            yield* publicationComments.findPublicationCommentContentByIdAndLanguage({
              publicationCommentId,
              language: "en",
            }),
          ),
        ).toBe(true)

        expect(
          Option.getOrThrow(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          ).sourceContent,
        ).toEqual(makeDocument("New source"))

        yield* publicationComments.upsertPublicationCommentTranslations({
          ...translation,
          sourceRevisionId: Option.getOrThrow(
            yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
          ).currentRevisionId,
        })

        yield* publicationComments.deletePublicationComment(publicationCommentId)
        expect(
          yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId),
        ).toEqual([])
      }).pipe(Effect.provide(TestLayerWithRepositories)),
  )
})
