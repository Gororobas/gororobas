import { describe, expect, it } from "@effect/vitest"
import { ContentLanguage } from "@gororobas/domain"
import {
  CommentConcurrentUpdateError,
  InvalidCrdtUpdateError,
  CommentCrdt,
  CommentId,
  LoroDocUpdate,
  snapshotToLoroDoc,
  Handle,
  SourceCommentData,
  SystemCommit,
  TiptapDocument,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"

import {
  HumanCrdtUpdate,
  SystemUpsertTranslation,
} from "../../src/comments/comment-repository-inputs.js"
import { findCommentCrdtSnapshotById } from "../../src/comments/queries.js"
import { CommentsRepository } from "../../src/comments/repository.js"
import { PublicationsRepository } from "../../src/publications/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

const CommentsRepositoryTestLayer = Layer.effect(CommentsRepository, CommentsRepository.make).pipe(
  Layer.provide(TestLayer),
)
const PublicationsRepositoryTestLayer = Layer.effect(
  PublicationsRepository,
  PublicationsRepository.make,
).pipe(Layer.provide(TestLayer))

const TestLayerWithRepositories = Layer.mergeAll(
  TestLayer,
  CommentsRepositoryTestLayer,
  PublicationsRepositoryTestLayer,
)

const makeDocument = (text: string): TiptapDocument =>
  TiptapDocument.make({
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    type: "doc",
    version: 1,
  })

const makeClientUpdate = Effect.fn(function* (commentId: CommentId, text: string) {
  const snapshot = Option.getOrThrow(yield* findCommentCrdtSnapshotById(commentId)).crdtSnapshot
  const document = snapshotToLoroDoc(snapshot)
  const version = document.version()

  yield* CommentCrdt.applyEdit(document, {
    _tag: "SetCommentSourceContent",

    content: makeDocument(text),
  })

  return LoroDocUpdate.make(document.export({ from: version, mode: "update" }))
})

const makeHandle = Schema.decodeSync(Handle)

const makeCommentSourceData = (content: TiptapDocument): SourceCommentData => ({
  sourceContent: content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" },
})

describe("CommentsRepository", () => {
  it.effect("createComment persists projection row and first commit", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsRepository
      const publications = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationId = yield* publications.createPublication({
        createdById: person.id,
        sourceData: {
          sourceContent: makeDocument("Publication base"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
          metadata: {
            handle: makeHandle(`pc-${person.id.slice(0, 8)}-b`),
            kind: "POST",
            ownerProfileId: profile.id,
            publishedAt: now,
            visibility: "PUBLIC",
          },
        },
      })

      const commentId = yield* comments.createComment({
        createdById: person.id,
        ownerProfileId: profile.id,
        parentCommentId: null,
        publicationId,
        sourceData: makeCommentSourceData(makeDocument("Primeiro comentario")),
      })

      const row = yield* comments.findCommentRowById(commentId)
      expect(Option.isSome(row)).toBe(true)

      const content = yield* comments.findCommentContentByIdAndLanguage({
        commentId,
        language: "pt",
      })
      expect(Option.isSome(content)).toBe(true)
      expect(Option.getOrThrow(content).content).toEqual(makeDocument("Primeiro comentario"))

      const commits = yield* comments.listCommentCommitRowsByCommentIdAsc(commentId)
      expect(commits).toHaveLength(1)
      expect(commits[0]?.createdById).toBe(person.id)
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )

  it.effect("updateComment applies human content update and appends commit", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsRepository
      const publications = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationId = yield* publications.createPublication({
        createdById: person.id,
        sourceData: {
          sourceContent: makeDocument("Publication base"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
          metadata: {
            handle: makeHandle(`pc-${person.id.slice(0, 8)}-u`),
            kind: "POST",
            ownerProfileId: profile.id,
            publishedAt: now,
            visibility: "PUBLIC",
          },
        },
      })

      const commentId = yield* comments.createComment({
        createdById: person.id,
        ownerProfileId: profile.id,
        parentCommentId: null,
        publicationId,
        sourceData: makeCommentSourceData(makeDocument("Antes")),
      })

      const beforeUpdate = yield* comments.findCommentRowById(commentId)
      expect(Option.isSome(beforeUpdate)).toBe(true)

      const snapshot = Option.getOrThrow(yield* findCommentCrdtSnapshotById(commentId)).crdtSnapshot
      const invalidDocument = snapshotToLoroDoc(snapshot)
      const version = invalidDocument.version()
      invalidDocument.getMap("unexpected").set("value", "untrusted")

      const invalidUpdate = yield* Effect.flip(
        comments.updateComment(
          HumanCrdtUpdate.make({
            authorId: person.id,
            commentId,
            crdtUpdate: LoroDocUpdate.make(
              invalidDocument.export({ from: version, mode: "update" }),
            ),
            expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
          }),
        ),
      )

      expect(invalidUpdate).toBeInstanceOf(InvalidCrdtUpdateError)
      expect(yield* comments.findCommentRowById(commentId)).toEqual(beforeUpdate)
      expect(Option.getOrThrow(yield* findCommentCrdtSnapshotById(commentId)).crdtSnapshot).toEqual(
        snapshot,
      )
      expect(yield* comments.listCommentCommitRowsByCommentIdAsc(commentId)).toHaveLength(1)

      yield* comments.updateComment(
        HumanCrdtUpdate.make({
          authorId: person.id,
          commentId,
          crdtUpdate: yield* makeClientUpdate(commentId, "Depois"),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
        }),
      )

      const content = yield* comments.findCommentContentByIdAndLanguage({
        commentId,
        language: "pt",
      })
      expect(Option.isSome(content)).toBe(true)
      expect(Option.getOrThrow(content).content).toEqual(makeDocument("Depois"))

      const commits = yield* comments.listCommentCommitRowsByCommentIdAsc(commentId)
      expect(commits).toHaveLength(2)
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )

  it.effect("updateComment rejects stale expected frontier", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsRepository
      const publications = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationId = yield* publications.createPublication({
        createdById: person.id,
        sourceData: {
          sourceContent: makeDocument("Publication base"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
          metadata: {
            handle: makeHandle(`pc-${person.id.slice(0, 8)}-s`),
            kind: "POST",
            ownerProfileId: profile.id,
            publishedAt: now,
            visibility: "PUBLIC",
          },
        },
      })

      const commentId = yield* comments.createComment({
        createdById: person.id,
        ownerProfileId: profile.id,
        parentCommentId: null,
        publicationId,
        sourceData: makeCommentSourceData(makeDocument("Versao 1")),
      })

      const row = yield* comments.findCommentRowById(commentId)
      expect(Option.isSome(row)).toBe(true)
      const expectedCurrentCrdtFrontier = Option.getOrThrow(row).currentCrdtFrontier

      yield* comments.updateComment(
        HumanCrdtUpdate.make({
          authorId: person.id,
          commentId,
          crdtUpdate: yield* makeClientUpdate(commentId, "Versao 2"),
          expectedCurrentCrdtFrontier,
        }),
      )

      const staleUpdate = comments.updateComment(
        HumanCrdtUpdate.make({
          authorId: person.id,
          commentId,
          crdtUpdate: yield* makeClientUpdate(commentId, "Versao 3"),
          expectedCurrentCrdtFrontier,
        }),
      )

      yield* Effect.flip(staleUpdate).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(CommentConcurrentUpdateError)
          }),
        ),
      )
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )

  it.effect("updateComment with SystemUpsertTranslation writes translated language", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsRepository
      const publications = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationId = yield* publications.createPublication({
        createdById: person.id,
        sourceData: {
          sourceContent: makeDocument("Publication base"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
          metadata: {
            handle: makeHandle(`pc-${person.id.slice(0, 8)}-t`),
            kind: "POST",
            ownerProfileId: profile.id,
            publishedAt: now,
            visibility: "PUBLIC",
          },
        },
      })

      const commentId = yield* comments.createComment({
        createdById: person.id,
        ownerProfileId: profile.id,
        parentCommentId: null,
        publicationId,
        sourceData: makeCommentSourceData(makeDocument("Texto original")),
      })

      const beforeTranslation = yield* comments.findCommentRowById(commentId)
      expect(Option.isSome(beforeTranslation)).toBe(true)

      yield* comments.updateComment(
        SystemUpsertTranslation.make({
          commentId,
          commit: SystemCommit.make({
            model: "translation/test",
            workflowName: "CommentTranslationWorkflow",
            workflowVersion: "test",
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          sourceCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          sourceLanguage: ContentLanguage.make("pt"),
          targetLanguage: "en",
          translatedContent: makeDocument("Translated comment"),
        }),
      )

      const translatedContent = yield* comments.findCommentContentByIdAndLanguage({
        commentId,
        language: "en",
      })
      expect(Option.isSome(translatedContent)).toBe(true)
      expect(Option.getOrThrow(translatedContent).content).toEqual(
        makeDocument("Translated comment"),
      )
      const sourceCrdtFrontier = Option.getOrThrow(beforeTranslation).currentCrdtFrontier
      const afterEnglish = Option.getOrThrow(yield* comments.findCommentRowById(commentId))

      yield* comments.updateComment(
        SystemUpsertTranslation.make({
          commentId,
          commit: SystemCommit.make({
            model: "translation/test",
            workflowName: "CommentTranslationWorkflow",
            workflowVersion: "test",
          }),
          expectedCurrentCrdtFrontier: afterEnglish.currentCrdtFrontier,
          sourceCrdtFrontier,
          sourceLanguage: ContentLanguage.make("pt"),
          targetLanguage: "es",
          translatedContent: makeDocument("Comentario traducido"),
        }),
      )

      const translated = yield* CommentCrdt.read(
        snapshotToLoroDoc(
          Option.getOrThrow(yield* findCommentCrdtSnapshotById(commentId)).crdtSnapshot,
        ),
      )

      const translationLanguages = ["en", "es"] as const

      translationLanguages.forEach((language) => {
        const translation = translated.translations[language]
        expect(
          translation !== "original" ? translation?.translatedAtCrdtFrontier : undefined,
        ).toEqual(sourceCrdtFrontier)
      })

      yield* comments.updateComment(
        HumanCrdtUpdate.make({
          commentId,
          authorId: person.id,
          expectedCurrentCrdtFrontier: Option.getOrThrow(
            yield* comments.findCommentRowById(commentId),
          ).currentCrdtFrontier,
          crdtUpdate: yield* makeClientUpdate(commentId, "Original editado"),
        }),
      )

      const afterEdit = Option.getOrThrow(yield* comments.findCommentRowById(commentId))

      const staleError = yield* comments
        .updateComment(
          SystemUpsertTranslation.make({
            commentId,
            commit: SystemCommit.make({
              model: "translation/test",
              workflowName: "CommentTranslationWorkflow",
              workflowVersion: "test",
            }),
            expectedCurrentCrdtFrontier: afterEdit.currentCrdtFrontier,
            sourceCrdtFrontier,
            sourceLanguage: ContentLanguage.make("pt"),
            targetLanguage: "en",
            translatedContent: makeDocument("Stale result"),
          }),
        )
        .pipe(Effect.flip)

      expect(staleError).toBeInstanceOf(CommentConcurrentUpdateError)
      const preserved = Option.getOrThrow(
        yield* comments.findCommentContentByIdAndLanguage({ commentId, language: "en" }),
      )
      expect(preserved.content).toEqual(makeDocument("Translated comment"))
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )
})
