import { describe, expect, it } from "@effect/vitest"
import { ContentLanguage } from "@gororobas/domain"
import {
  PublicationCommentNotFoundError,
  Handle,
  UnauthorizedError,
  type PublicationSourceData,
  type SourcePublicationCommentData,
  type TiptapDocument,
} from "@gororobas/domain"
import { resolveSessionFromAuthSubjectId } from "@gororobas/server/session-service"
import { DateTime, Effect, Layer, Option, Schema } from "effect"

import { PublicationCommentsRepository } from "../../src/publication-comments/repository.js"
import { PublicationCommentsService } from "../../src/publication-comments/service.js"
import { PublicationsRepository } from "../../src/publications/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer, withSession } from "../test-helpers.js"

const PublicationsRepositoryLayer = Layer.effect(
  PublicationsRepository,
  PublicationsRepository.make,
).pipe(Layer.provide(TestLayer))
const PublicationCommentsRepositoryLayer = Layer.effect(
  PublicationCommentsRepository,
  PublicationCommentsRepository.make,
).pipe(Layer.provide(TestLayer))

const PublicationCommentsServiceLayer = Layer.effect(
  PublicationCommentsService,
  PublicationCommentsService.make,
).pipe(
  Layer.provide(Layer.mergeAll(PublicationsRepositoryLayer, PublicationCommentsRepositoryLayer)),
)

const TestLayerWithPublicationCommentsService = Layer.mergeAll(
  TestLayer,
  PublicationsRepositoryLayer,
  PublicationCommentsRepositoryLayer,
  PublicationCommentsServiceLayer,
)

const makeDocument = (text: string): TiptapDocument => ({
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  type: "doc",
  version: 1,
})

const makeHandle = Schema.decodeSync(Handle)

const makePostSourceData = (input: {
  content: TiptapDocument
  handle: string
  ownerProfileId: PublicationSourceData["metadata"]["ownerProfileId"]
  publishedAt: PublicationSourceData["metadata"]["publishedAt"]
}): PublicationSourceData => ({
  sourceContent: input.content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" },
  metadata: {
    handle: makeHandle(input.handle),
    kind: "POST",
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    visibility: "PUBLIC",
  },
})

const makePublicationCommentSourceData = (
  content: TiptapDocument,
): SourcePublicationCommentData => ({
  sourceContent: content,
  sourceLanguage: ContentLanguage.make("pt"),
})

describe("PublicationCommentsService", () => {
  it.effect(
    "createPublicationComment persists a publication comment linked to the publication",
    () =>
      Effect.gen(function* () {
        const service = yield* PublicationCommentsService
        const publicationsRepository = yield* PublicationsRepository
        const publicationCommentsRepository = yield* PublicationCommentsRepository

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

        const publicationCommentId = yield* withSession(
          service.createPublicationComment({
            content: makePublicationCommentSourceData(makeDocument("Primeiro comentario")),
            publicationId,
          }),
          yield* resolveSessionFromAuthSubjectId(person.id),
        )

        const row =
          yield* publicationCommentsRepository.findPublicationCommentRowById(publicationCommentId)
        expect(Option.isSome(row)).toBe(true)
        expect(Option.getOrThrow(row).publicationId).toBe(publicationId)
        expect(Option.getOrThrow(row).ownerProfileId).toBe(person.id)
      }).pipe(Effect.provide(TestLayerWithPublicationCommentsService)),
  )

  it.effect("updatePublicationComment denies updates from non-owners", () =>
    Effect.gen(function* () {
      const service = yield* PublicationCommentsService
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

      const publicationCommentId = yield* withSession(
        service.createPublicationComment({
          content: makePublicationCommentSourceData(makeDocument("Comentario original")),
          publicationId,
        }),
        yield* resolveSessionFromAuthSubjectId(owner.id),
      )

      const publicationComment = yield* service.getPublicationCommentById(publicationCommentId)

      const result = yield* withSession(
        service.updatePublicationComment({
          publicationCommentId,
          sourceContent: makeDocument("Edited"),
          expectedCurrentRevisionId: publicationComment.currentRevisionId,
        }),
        yield* resolveSessionFromAuthSubjectId(other.id),
      ).pipe(Effect.flip)

      expect(result).toBeInstanceOf(UnauthorizedError)
    }).pipe(Effect.provide(TestLayerWithPublicationCommentsService)),
  )

  it.effect("deletePublicationComment removes a publication comment for the owner", () =>
    Effect.gen(function* () {
      const service = yield* PublicationCommentsService
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

      const publicationCommentId = yield* withSession(
        service.createPublicationComment({
          content: makePublicationCommentSourceData(makeDocument("Comentario para deletar")),
          publicationId,
        }),
        yield* resolveSessionFromAuthSubjectId(person.id),
      )

      yield* withSession(
        service.deletePublicationComment(publicationCommentId),
        yield* resolveSessionFromAuthSubjectId(person.id),
      )

      const deleted = yield* service
        .getPublicationCommentById(publicationCommentId)
        .pipe(Effect.flip)
      expect(deleted).toBeInstanceOf(PublicationCommentNotFoundError)
    }).pipe(Effect.provide(TestLayerWithPublicationCommentsService)),
  )
})
