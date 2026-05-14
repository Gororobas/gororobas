import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  LoroDocSnapshot,
  LoroDocUpdate,
  PostCrdtRow,
  PostSourceDataStorageLoro,
  UnauthorizedError,
  type PostSourceData,
  type TiptapDocument,
  type TiptapNode,
  sourcePostDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema, Struct } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Mirror } from "loro-mirror"

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
const PostCrdtSnapshotRow = PostCrdtRow.mapFields(Struct.pick(["crdtSnapshot"]))

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

const makePostCrdtUpdate = (input: {
  nextSourceData: PostSourceData
  snapshot: LoroDocSnapshot
}) => {
  const currentDoc = snapshotToLoroDoc(input.snapshot)
  const nextDoc = currentDoc.fork()
  const store = new Mirror({
    doc: nextDoc,
    schema: PostSourceDataStorageLoro,
  })

  store.setState(() => sourcePostDataToCrdtStorage(input.nextSourceData))
  store.dispose()

  return Schema.decodeUnknownSync(LoroDocUpdate)(
    nextDoc.export({
      from: currentDoc.version(),
      mode: "update",
    }),
  )
}

const makeNoteSourceData = (input: {
  content: TiptapDocument
  handle: string
  ownerProfileId: PostSourceData["metadata"]["ownerProfileId"]
  publishedAt: PostSourceData["metadata"]["publishedAt"]
}): PostSourceData => ({
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
      const sql = yield* SqlClient.SqlClient

      const owner = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const ownerProfile = yield* makeProfileFixture({ id: owner.id })
      yield* insertPersonWithDependencies({ person: owner, profile: ownerProfile })

      const other = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const otherProfile = yield* makeProfileFixture({ id: other.id })
      yield* insertPersonWithDependencies({ person: other, profile: otherProfile })

      const now = yield* DateTime.now
      const sourceData = makeNoteSourceData({
        content: makeDocument("Nota do dono"),
        handle: `svc-post-${owner.id.slice(0, 8)}`,
        ownerProfileId: ownerProfile.id,
        publishedAt: now,
      })
      const postId = yield* repository.createPost({
        createdById: owner.id,
        sourceData,
      })

      const before = yield* repository.findPostRowById(postId)
      expect(Option.isSome(before)).toBe(true)
      const snapshotRows = Schema.decodeUnknownSync(Schema.Array(PostCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${postId}`,
      )
      expect(snapshotRows).toHaveLength(1)
      const snapshot = snapshotRows[0]!

      const result = yield* withSession(
        service.updatePost({
          crdtUpdate: makePostCrdtUpdate({
            nextSourceData: {
              ...sourceData,
              locales: {
                ...sourceData.locales,
                pt: {
                  ...sourceData.locales.pt!,
                  content: makeDocument("Tentativa sem permissao"),
                },
              },
            },
            snapshot: snapshot.crdtSnapshot,
          }),
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
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makeNoteSourceData({
        content: makeDocument("Antes"),
        handle: `service-post-${person.id.slice(0, 8)}`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const postId = yield* repository.createPost({
        createdById: person.id,
        sourceData,
      })

      const before = yield* repository.findPostRowById(postId)
      expect(Option.isSome(before)).toBe(true)
      const snapshotRows = Schema.decodeUnknownSync(Schema.Array(PostCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${postId}`,
      )
      expect(snapshotRows).toHaveLength(1)
      const snapshot = snapshotRows[0]!

      yield* withSession(
        service.updatePost({
          crdtUpdate: makePostCrdtUpdate({
            nextSourceData: {
              ...sourceData,
              locales: {
                ...sourceData.locales,
                pt: {
                  ...sourceData.locales.pt!,
                  content: makeDocument("Depois"),
                },
              },
            },
            snapshot: snapshot.crdtSnapshot,
          }),
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
