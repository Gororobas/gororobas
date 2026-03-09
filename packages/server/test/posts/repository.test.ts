import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  SystemCommit,
  type SourcePostData,
  type TiptapDocument,
  type TiptapNode,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  HumanUpdatePtContent,
  SystemUpsertTranslation,
} from "../../src/posts/post-repository-inputs.js"
import { PostsRepository } from "../../src/posts/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

const PostsRepositoryTestLayer = Layer.effect(PostsRepository, PostsRepository.make).pipe(
  Layer.provide(TestLayer),
)
const TestLayerWithPostsRepository = Layer.mergeAll(TestLayer, PostsRepositoryTestLayer)

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

const makeEventSourceData = (input: {
  content: TiptapDocument
  endDate: SourcePostData["metadata"]["publishedAt"]
  handle: string
  locationOrUrl: string | null
  ownerProfileId: SourcePostData["metadata"]["ownerProfileId"]
  publishedAt: SourcePostData["metadata"]["publishedAt"]
  startDate: SourcePostData["metadata"]["publishedAt"]
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
    attendanceMode: "IN_PERSON",
    endDate: input.endDate,
    handle: makeHandle(input.handle),
    kind: "EVENT",
    locationOrUrl: input.locationOrUrl,
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    startDate: input.startDate!,
    visibility: "PUBLIC",
  },
})

describe("PostsRepository", () => {
  it.effect("createPost persists materialized row and first commit", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makeNoteSourceData({
        content: makeDocument("Primeira versao"),
        handle: `post-${person.id.slice(0, 8)}`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })

      const postId = yield* repository.createPost({
        authorId: person.id,
        sourceData,
      })

      const post = yield* repository.findPostRowById(postId)
      expect(Option.isSome(post)).toBe(true)
      expect(Option.getOrThrow(post).handle).toBe(sourceData.metadata.handle)

      const commits = yield* repository.listPostCommitRowsByPostIdDesc(postId)
      expect(commits).toHaveLength(1)
      expect(commits[0]?.createdById).toBe(person.id)

      const contributors = yield* repository.listPostContributorIdsByPostId(postId)
      expect(contributors.map((entry) => entry.createdById)).toEqual([person.id])

      const byOwner = yield* repository.listPostRowsByOwnerProfileId(profile.id)
      expect(byOwner).toHaveLength(1)
      expect(byOwner[0]?.id).toBe(postId)

      const pageData = yield* repository.findPostPageData({
        handle: sourceData.metadata.handle,
        locale: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      const page = Option.getOrThrow(pageData)
      expect(page.kind).toBe("NOTE")
      expect(page.content).toEqual(makeDocument("Primeira versao"))
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect(
    "updatePost with HumanUpdatePtContent appends commit and rematerializes note content",
    () =>
      Effect.gen(function* () {
        const repository = yield* PostsRepository

        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        const now = yield* DateTime.now
        const postId = yield* repository.createPost({
          authorId: person.id,
          sourceData: makeNoteSourceData({
            content: makeDocument("Antes"),
            handle: `post-${person.id.slice(0, 8)}-update`,
            ownerProfileId: profile.id,
            publishedAt: now,
          }),
        })

        yield* repository.updatePost(
          HumanUpdatePtContent.makeUnsafe({
            authorId: person.id,
            content: makeDocument("Depois"),
            postId,
          }),
        )

        const commits = yield* repository.listPostCommitRowsByPostIdDesc(postId)
        expect(commits).toHaveLength(2)
        expect(commits[0]?.createdById).toBe(person.id)

        const row = yield* repository.findPostRowById(postId)
        expect(Option.isSome(row)).toBe(true)

        const pageData = yield* repository.findPostPageData({
          handle: Option.getOrThrow(row).handle,
          locale: "pt",
        })
        expect(Option.isSome(pageData)).toBe(true)
        const page = Option.getOrThrow(pageData)
        expect(page.content).toEqual(makeDocument("Depois"))
      }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect("updatePost with SystemUpsertTranslation creates system commit and translation", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        authorId: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Texto original"),
          handle: `post-${person.id.slice(0, 8)}-translate`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      yield* repository.updatePost(
        SystemUpsertTranslation.makeUnsafe({
          commit: SystemCommit.makeUnsafe({
            model: "translation/test",
            workflowName: "PostTranslationWorkflow",
            workflowVersion: "test",
          }),
          postId,
          sourceLocale: "pt",
          targetLocale: "en",
          translatedContent: makeDocument("Translated text"),
        }),
      )

      const commits = yield* repository.listPostCommitRowsByPostIdDesc(postId)
      expect(commits).toHaveLength(2)
      expect(commits.some((commit) => commit.createdById === null)).toBe(true)

      const row = yield* repository.findPostRowById(postId)
      expect(Option.isSome(row)).toBe(true)

      const pageData = yield* repository.findPostPageData({
        handle: Option.getOrThrow(row).handle,
        locale: "en",
      })
      expect(Option.isSome(pageData)).toBe(true)
      const page = Option.getOrThrow(pageData)
      expect(page.content).toEqual(makeDocument("Translated text"))
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect("updatePost with SystemUpsertTranslation stores translation frontier", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        authorId: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Texto original"),
          handle: `post-${person.id.slice(0, 8)}-frontier`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      yield* repository.updatePost(
        SystemUpsertTranslation.makeUnsafe({
          commit: SystemCommit.makeUnsafe({
            model: "translation/test",
            workflowName: "PostTranslationWorkflow",
            workflowVersion: "test",
          }),
          postId,
          sourceLocale: "pt",
          targetLocale: "en",
          translatedContent: makeDocument("Translated text"),
        }),
      )

      const findTranslatedFrontier = SqlSchema.findAll({
        Request: Schema.Struct({ postId: Schema.String }),
        Result: Schema.Struct({
          translatedAtCrdtFrontier: Schema.fromJsonString(
            Schema.NullOr(Schema.Array(Schema.Unknown)),
          ),
        }),
        execute: (request) =>
          sql`
            SELECT translated_at_crdt_frontier
            FROM post_translations
            WHERE post_id = ${request.postId} AND locale = 'en'
          `,
      })
      const translationRows = yield* findTranslatedFrontier({ postId })

      expect(translationRows).toHaveLength(1)
      const frontier = translationRows[0]?.translatedAtCrdtFrontier
      expect(frontier).not.toBeNull()
      expect(frontier).not.toEqual([])
      expect(frontier).not.toEqual("[]")
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect("createPost materializes event metadata", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const startDate = yield* DateTime.now
      const endDate = DateTime.add(startDate, { days: 1 })

      const postId = yield* repository.createPost({
        authorId: person.id,
        sourceData: makeEventSourceData({
          content: makeDocument("Feira agroecológica"),
          endDate,
          handle: `post-${person.id.slice(0, 8)}-event`,
          locationOrUrl: "Sítio Semente, Brasília",
          ownerProfileId: profile.id,
          publishedAt: startDate,
          startDate,
        }),
      })

      const row = yield* repository.findPostRowById(postId)
      expect(Option.isSome(row)).toBe(true)
      expect(Option.getOrThrow(row).kind).toBe("EVENT")
      expect(Option.getOrThrow(row).attendanceMode).toBe("IN_PERSON")
      expect(Option.getOrThrow(row).locationOrUrl).toBe("Sítio Semente, Brasília")
      expect(Option.getOrThrow(row).startDate).not.toBeNull()
      expect(Option.getOrThrow(row).endDate).not.toBeNull()
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect("deletePost removes post row and cascades commits", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        authorId: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Para remover"),
          handle: `post-${person.id.slice(0, 8)}-delete`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      yield* repository.deletePost(postId)

      const row = yield* repository.findPostRowById(postId)
      expect(Option.isNone(row)).toBe(true)

      const commits = yield* repository.listPostCommitRowsByPostIdDesc(postId)
      expect(commits).toHaveLength(0)
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )
})
