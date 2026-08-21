import { describe, expect, it } from "@effect/vitest"
import {
  CommentNotFoundError,
  Handle,
  UnauthorizedError,
  type SourceCommentData,
  type PublicationSourceData,
  type TiptapDocument,
  type TiptapNode,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"

import { CommentsRepository } from "../../src/comments/repository.js"
import { CommentsService } from "../../src/comments/service.js"
import { PublicationsRepository } from "../../src/publications/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { makeAccountSession } from "../session-builders.js"
import { insertPersonWithDependencies, TestLayer, withSession } from "../test-helpers.js"

const PublicationsRepositoryLayer = Layer.effect(
  PublicationsRepository,
  PublicationsRepository.make,
).pipe(Layer.provide(TestLayer))
const CommentsRepositoryLayer = Layer.effect(CommentsRepository, CommentsRepository.make).pipe(
  Layer.provide(TestLayer),
)
const CommentsServiceLayer = Layer.effect(CommentsService, CommentsService.make).pipe(
  Layer.provide(Layer.mergeAll(PublicationsRepositoryLayer, CommentsRepositoryLayer)),
)

const TestLayerWithCommentsService = Layer.mergeAll(
  TestLayer,
  PublicationsRepositoryLayer,
  CommentsRepositoryLayer,
  CommentsServiceLayer,
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

const makePostSourceData = (input: {
  content: TiptapDocument
  handle: string
  ownerProfileId: PublicationSourceData["metadata"]["ownerProfileId"]
  publishedAt: PublicationSourceData["metadata"]["publishedAt"]
}): PublicationSourceData => ({
  locales: {
    pt: {
      content: input.content,
      originalLocale: "pt",
      translatedAtCrdtFrontier: null,
      translationSource: "ORIGINAL",
    },
  },
  metadata: {
    handle: makeHandle(input.handle),
    kind: "POST",
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    visibility: "PUBLIC",
  },
})

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

describe("CommentsService", () => {
  it.effect("createPublicationComment persists a comment linked to the publication", () =>
    Effect.gen(function* () {
      const service = yield* CommentsService
      const publicationsRepository = yield* PublicationsRepository
      const commentsRepository = yield* CommentsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const publicationId = yield* publicationsRepository.createPublication({
        createdById: person.id,
        sourceData: makePostSourceData({
          content: makeDocument("Publication para comentar"),
          handle: `cmt-publication-${person.id.slice(0, 8)}`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const commentId = yield* withSession(
        service.createPublicationComment({
          content: makeCommentSourceData(makeDocument("Primeiro comentario")),
          publicationId,
        }),
        makeAccountSession(person.id),
      )

      const row = yield* commentsRepository.findCommentRowById(commentId)
      expect(Option.isSome(row)).toBe(true)
      expect(Option.getOrThrow(row).publicationId).toBe(publicationId)
      expect(Option.getOrThrow(row).ownerProfileId).toBe(person.id)
    }).pipe(Effect.provide(TestLayerWithCommentsService)),
  )

  it.effect("updateComment denies updates from non-owners", () =>
    Effect.gen(function* () {
      const service = yield* CommentsService
      const publicationsRepository = yield* PublicationsRepository

      const owner = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const ownerProfile = yield* makeProfileFixture({ id: owner.id })
      yield* insertPersonWithDependencies({ person: owner, profile: ownerProfile })

      const other = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const otherProfile = yield* makeProfileFixture({ id: other.id })
      yield* insertPersonWithDependencies({ person: other, profile: otherProfile })

      const now = yield* DateTime.now
      const publicationId = yield* publicationsRepository.createPublication({
        createdById: owner.id,
        sourceData: makePostSourceData({
          content: makeDocument("Publication para comentario"),
          handle: `cmt-oth-${owner.id.slice(0, 8)}`,
          ownerProfileId: ownerProfile.id,
          publishedAt: now,
        }),
      })

      const commentId = yield* withSession(
        service.createPublicationComment({
          content: makeCommentSourceData(makeDocument("Comentario original")),
          publicationId,
        }),
        makeAccountSession(owner.id),
      )

      const comment = yield* service.getCommentById(commentId)

      const result = yield* withSession(
        service.updateComment({
          commentId,
          content: makeDocument("Tentativa de invasao"),
          expectedCurrentCrdtFrontier: comment.currentCrdtFrontier,
        }),
        makeAccountSession(other.id),
      ).pipe(Effect.flip)

      expect(result).toBeInstanceOf(UnauthorizedError)
    }).pipe(Effect.provide(TestLayerWithCommentsService)),
  )

  it.effect("deleteComment removes a comment for the owner", () =>
    Effect.gen(function* () {
      const service = yield* CommentsService
      const publicationsRepository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const publicationId = yield* publicationsRepository.createPublication({
        createdById: person.id,
        sourceData: makePostSourceData({
          content: makeDocument("Publication para apagar comentario"),
          handle: `cmt-del-${person.id.slice(0, 8)}`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const commentId = yield* withSession(
        service.createPublicationComment({
          content: makeCommentSourceData(makeDocument("Comentario para deletar")),
          publicationId,
        }),
        makeAccountSession(person.id),
      )

      yield* withSession(service.deleteComment(commentId), makeAccountSession(person.id))

      const deleted = yield* service.getCommentById(commentId).pipe(Effect.flip)
      expect(deleted).toBeInstanceOf(CommentNotFoundError)
    }).pipe(Effect.provide(TestLayerWithCommentsService)),
  )
})
