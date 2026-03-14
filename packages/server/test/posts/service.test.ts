import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  UnauthorizedError,
  type SourcePostData,
  type TiptapDocument,
  type TiptapNode,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"

import { PostsRepository } from "../../src/posts/repository.js"
import { PostsService } from "../../src/posts/service.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { makeAccountSession } from "../session-builders.js"
import { insertPersonWithDependencies, TestLayer, withSession } from "../test-helpers.js"

const PostsRepositoryLayer = Layer.effect(PostsRepository, PostsRepository.make).pipe(
  Layer.provide(TestLayer),
)

const PostsServiceLayer = Layer.effect(PostsService, PostsService.make).pipe(
  Layer.provide(PostsRepositoryLayer),
)

const TestLayerWithPostsService = Layer.mergeAll(TestLayer, PostsRepositoryLayer, PostsServiceLayer)

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

const makeNoteSourceData = (input: {
  content: TiptapDocument
  handle: string
  ownerProfileId: SourcePostData["metadata"]["ownerProfileId"]
  publishedAt: SourcePostData["metadata"]["publishedAt"]
}): SourcePostData => ({
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
    kind: "NOTE",
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    visibility: "PUBLIC",
  },
})

describe("PostsService", () => {
  it.effect("updatePost denies edits from non-owners", () =>
    Effect.gen(function* () {
      const service = yield* PostsService
      const repository = yield* PostsRepository

      const owner = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const ownerProfile = yield* makeProfileFixture({ id: owner.id })
      yield* insertPersonWithDependencies({ person: owner, profile: ownerProfile })

      const other = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const otherProfile = yield* makeProfileFixture({ id: other.id })
      yield* insertPersonWithDependencies({ person: other, profile: otherProfile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        createdById: owner.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Nota do dono"),
          handle: `svc-post-${owner.id.slice(0, 8)}`,
          ownerProfileId: ownerProfile.id,
          publishedAt: now,
        }),
      })

      const before = yield* repository.findPostRowById(postId)
      expect(Option.isSome(before)).toBe(true)

      const result = yield* withSession(
        service.updatePost({
          content: makeDocument("Tentativa sem permissao"),
          expectedCurrentCrdtFrontier: Option.getOrThrow(before).currentCrdtFrontier,
          postId,
        }),
        makeAccountSession(other.id),
      ).pipe(Effect.flip)

      expect(result).toBeInstanceOf(UnauthorizedError)
    }).pipe(Effect.provide(TestLayerWithPostsService)),
  )

  it.effect("updatePost updates post content with a fresh frontier", () =>
    Effect.gen(function* () {
      const service = yield* PostsService
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        createdById: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Antes"),
          handle: `service-post-${person.id.slice(0, 8)}`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const before = yield* repository.findPostRowById(postId)
      expect(Option.isSome(before)).toBe(true)

      yield* withSession(
        service.updatePost({
          content: makeDocument("Depois"),
          expectedCurrentCrdtFrontier: Option.getOrThrow(before).currentCrdtFrontier,
          postId,
        }),
        makeAccountSession(person.id),
      )

      const handle = Option.getOrThrow(yield* repository.findPostRowById(postId)).handle
      const page = yield* repository.findPostPageData({ handle, locale: "pt" })
      expect(Option.isSome(page)).toBe(true)
      expect(Option.getOrThrow(page).content).toEqual(makeDocument("Depois"))
    }).pipe(Effect.provide(TestLayerWithPostsService)),
  )
})
