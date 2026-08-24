import { describe, expect, it } from "@effect/vitest"
import {
  CommentConcurrentUpdateError,
  Handle,
  SourceCommentData,
  SystemCommit,
  TiptapDocument,
  TiptapNode,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"

import {
  HumanUpdatePtContent,
  SystemUpsertTranslation,
} from "../../src/comments/comment-repository-inputs.js"
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

const paragraph = (text: string): TiptapNode => ({
  content: [{ text, type: "text" }],
  type: "paragraph",
})

const makeDocument = (text: string): TiptapDocument => ({
  content: [paragraph(text)],
  type: "doc",
  version: 1,
})

const makeHandle = (value: string) => Schema.decodeUnknownSync(Handle)(value)

const makeCommentSourceData = (content: TiptapDocument): SourceCommentData => ({
  locales: {
    pt: {
      content,
      originalLocale: "pt",
      translatedAtCrdtFrontier: null,
      translationSource: "ORIGINAL",
    },
  },
})

describe("CommentsRepository", () => {
  it.effect("createComment persists materialized row and first commit", () =>
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
          locales: {
            pt: {
              content: makeDocument("Publication base"),
              originalLocale: "pt",
              translatedAtCrdtFrontier: null,
              translationSource: "ORIGINAL",
            },
          },
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

      const content = yield* comments.findCommentContentByIdAndLocale({
        commentId,
        locale: "pt",
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
          locales: {
            pt: {
              content: makeDocument("Publication base"),
              originalLocale: "pt",
              translatedAtCrdtFrontier: null,
              translationSource: "ORIGINAL",
            },
          },
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

      yield* comments.updateComment(
        HumanUpdatePtContent.make({
          authorId: person.id,
          commentId,
          content: makeDocument("Depois"),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
        }),
      )

      const content = yield* comments.findCommentContentByIdAndLocale({
        commentId,
        locale: "pt",
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
          locales: {
            pt: {
              content: makeDocument("Publication base"),
              originalLocale: "pt",
              translatedAtCrdtFrontier: null,
              translationSource: "ORIGINAL",
            },
          },
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
        HumanUpdatePtContent.make({
          authorId: person.id,
          commentId,
          content: makeDocument("Versao 2"),
          expectedCurrentCrdtFrontier,
        }),
      )

      const staleUpdate = comments.updateComment(
        HumanUpdatePtContent.make({
          authorId: person.id,
          commentId,
          content: makeDocument("Versao 3"),
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

  it.effect("updateComment with SystemUpsertTranslation writes translated locale", () =>
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
          locales: {
            pt: {
              content: makeDocument("Publication base"),
              originalLocale: "pt",
              translatedAtCrdtFrontier: null,
              translationSource: "ORIGINAL",
            },
          },
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
          sourceLocale: "pt",
          targetLocale: "en",
          translatedContent: makeDocument("Translated comment"),
        }),
      )

      const translatedContent = yield* comments.findCommentContentByIdAndLocale({
        commentId,
        locale: "en",
      })
      expect(Option.isSome(translatedContent)).toBe(true)
      expect(Option.getOrThrow(translatedContent).content).toEqual(
        makeDocument("Translated comment"),
      )
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )
})
