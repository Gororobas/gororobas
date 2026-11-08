import { describe, expect, it } from "@effect/vitest"
import {
  PublicationCommentConcurrentUpdateError,
  ContentLanguage,
  isDeletedPublicationComment,
  ProfileId,
  type PublicationCommentId,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Option, Schema, Record, Array as EffectArray, Order } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"

import { listPublicationCommentTranslationRowsByPublicationCommentId } from "../../src/publication-comments/queries.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies } from "../test-helpers.js"
import { TestLayerWithRepositories, fixture, makeDocument } from "./fixtures.js"

/** A thread: each comment answers an earlier one (or the publication), then some get deleted. */
const ThreadScenario = Schema.Struct({
  comments: Schema.Array(
    Schema.Struct({ answers: Schema.Int, isByOtherPerson: Schema.Boolean }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  deletions: Schema.Array(Schema.Int).check(Schema.isMaxLength(8)),
})

type ThreadComment = Readonly<{ id: PublicationCommentId; parentId: PublicationCommentId | null }>

describe("PublicationCommentsRepository", () => {
  it.effect(
    "deleting comments keeps every reply that remains, under tombstones of its deleted ancestors",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(ThreadScenario),
        predicate: (scenario) =>
          Effect.gen(function* () {
            const { publicationComments, person, publicationCommentId } = yield* fixture
            const root =
              yield* publicationComments.getActivePublicationComment(publicationCommentId)
            const otherPerson = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
            yield* insertPersonWithDependencies({
              person: otherPerson,
              profile: yield* makeProfileFixture({ id: otherPerson.id }),
            })

            // Answering 0 is answering the publication; k is answering the kth comment so far.
            const thread = yield* Effect.reduce(
              scenario.comments.entries(),
              (): ReadonlyArray<ThreadComment> => [{ id: root.id, parentId: null }],
              (created, [index, comment]) =>
                Effect.gen(function* () {
                  const answered = Math.abs(comment.answers) % (index + 2)

                  const parentId =
                    answered === 0
                      ? null
                      : Option.getOrNull(
                          Option.map(EffectArray.get(created, answered - 1), ({ id }) => id),
                        )

                  const author = comment.isByOtherPerson ? otherPerson : person

                  const id = yield* publicationComments.createPublicationComment({
                    createdById: author.id,
                    ownerProfileId: ProfileId.make(author.id),
                    parentPublicationCommentId: parentId,
                    publicationId: root.publicationId,
                    sourceData: {
                      sourceContent: makeDocument(`Comment ${index}`),
                      sourceLanguage: ContentLanguage.make("pt"),
                    },
                  })

                  return [...created, { id, parentId }]
                }),
            )

            const deleted = EffectArray.dedupe(
              EffectArray.getSomes(
                scenario.deletions.map((index) =>
                  Option.map(
                    EffectArray.get(thread, Math.abs(index) % thread.length),
                    ({ id }) => id,
                  ),
                ),
              ),
            )

            yield* Effect.forEach(deleted, publicationComments.deletePublicationComment, {
              concurrency: 1,
              discard: true,
            })

            const ancestorsOf = (id: PublicationCommentId): ReadonlyArray<PublicationCommentId> => {
              const parentId = thread.find((comment) => comment.id === id)?.parentId ?? null
              return parentId === null ? [] : [parentId, ...ancestorsOf(parentId)]
            }
            const hasLiveReplies = (id: PublicationCommentId) =>
              thread.some(
                (comment) => !deleted.includes(comment.id) && ancestorsOf(comment.id).includes(id),
              )

            const remaining = yield* publicationComments.listPublicationCommentRowsByPublicationId(
              root.publicationId,
            )

            return thread.every(({ id }) => {
              const row = remaining.find((candidate) => candidate.id === id)
              if (!deleted.includes(id)) {
                return row !== undefined && !isDeletedPublicationComment(row)
              }
              if (!hasLiveReplies(id)) return row === undefined

              return (
                row !== undefined &&
                isDeletedPublicationComment(row) &&
                row.ownerProfileId === null &&
                row.sourceContent === null
              )
            })
          }).pipe(Effect.provide(TestLayerWithRepositories)),
      }),
  )

  it.effect("replaces source text without retaining content in revision history", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.NonEmptyString),
      predicate: (text) =>
        Effect.gen(function* () {
          const { publicationComments, person, publicationCommentId } = yield* fixture
          const before =
            yield* publicationComments.getActivePublicationComment(publicationCommentId)
          expect(before.editCount).toBe(0)
          expect(before.editedAt).toBeNull()

          const update = {
            publicationCommentId,
            authorId: person.id,
            expectedCurrentRevisionId: before.currentRevisionId,
            sourceContent: makeDocument(`Edited ${text}`),
          }

          yield* publicationComments.updatePublicationComment(update)
          const edited =
            yield* publicationComments.getActivePublicationComment(publicationCommentId)
          expect(edited.sourceLanguage).toBe("und")

          yield* publicationComments.setPublicationCommentSourceLanguage({
            publicationCommentId,
            sourceRevisionId: edited.currentRevisionId,
            sourceLanguage: ContentLanguage.make("en-US"),
          })

          const after = yield* publicationComments.getActivePublicationComment(publicationCommentId)
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
        const before = yield* publicationComments.getActivePublicationComment(publicationCommentId)

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
          (yield* publicationComments.getActivePublicationComment(publicationCommentId))
            .sourceContent,
        ).toEqual(makeDocument("New source"))

        yield* publicationComments.upsertPublicationCommentTranslations({
          ...translation,
          sourceRevisionId: (yield* publicationComments.getActivePublicationComment(
            publicationCommentId,
          )).currentRevisionId,
        })

        yield* publicationComments.deletePublicationComment(publicationCommentId)
        expect(
          yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId),
        ).toEqual([])
      }).pipe(Effect.provide(TestLayerWithRepositories)),
  )
})
