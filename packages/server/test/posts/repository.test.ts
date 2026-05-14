import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  InvalidCrdtUpdateError,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PostSourceDataStorageLoro,
  PostConcurrentUpdateError,
  PostCrdtRow,
  SystemCommit,
  type PostSourceData,
  type TiptapDocument,
  type TiptapNode,
  sourcePostDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { DateTime, Effect, Equal, Layer, Option, Schema, Struct } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Mirror } from "loro-mirror"

import { HumanCrdtUpdate, SystemUpsertTranslation } from "../../src/posts/post-repository-inputs.js"
import { PostsRepository } from "../../src/posts/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

const PostsRepositoryTestLayer = Layer.effect(PostsRepository, PostsRepository.make).pipe(
  Layer.provide(TestLayer),
)
const TestLayerWithPostsRepository = Layer.mergeAll(TestLayer, PostsRepositoryTestLayer)
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

const applyUpdateToSnapshot = (input: { crdtUpdate: LoroDocUpdate; snapshot: LoroDocSnapshot }) => {
  const doc = snapshotToLoroDoc(input.snapshot)
  const importStatus = doc.import(input.crdtUpdate)
  expect(importStatus.success).toBeTruthy()
  return doc
}

const getPtContentFromStorageJson = (json: unknown) => {
  const storage = json as {
    locales?: {
      pt?: {
        content?: string
      }
    }
  }

  return storage.locales?.pt?.content ? JSON.parse(storage.locales.pt.content) : undefined
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

const makeEventSourceData = (input: {
  content: TiptapDocument
  endDate: PostSourceData["metadata"]["publishedAt"]
  handle: string
  locationOrUrl: string | null
  ownerProfileId: PostSourceData["metadata"]["ownerProfileId"]
  publishedAt: PostSourceData["metadata"]["publishedAt"]
  startDate: PostSourceData["metadata"]["publishedAt"]
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
        createdById: person.id,
        sourceData,
      })

      const post = yield* repository.findPostRowById(postId)
      expect(Option.isSome(post)).toBe(true)
      expect(Option.getOrThrow(post).handle).toBe(sourceData.metadata.handle)

      const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
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
    "updatePost with HumanCrdtUpdate appends replayable commit and rematerializes note content",
    () =>
      Effect.gen(function* () {
        const repository = yield* PostsRepository
        const sql = yield* SqlClient.SqlClient

        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        const now = yield* DateTime.now
        const initialSourceData = makeNoteSourceData({
          content: makeDocument("Antes"),
          handle: `post-${person.id.slice(0, 8)}-update`,
          ownerProfileId: profile.id,
          publishedAt: now,
        })
        const postId = yield* repository.createPost({
          createdById: person.id,
          sourceData: initialSourceData,
        })

        const beforeUpdate = yield* repository.findPostRowById(postId)
        expect(Option.isSome(beforeUpdate)).toBe(true)
        const beforeSnapshotRows = Schema.decodeUnknownSync(Schema.Array(PostCrdtSnapshotRow))(
          yield* sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${postId}`,
        )
        expect(beforeSnapshotRows).toHaveLength(1)
        const beforeSnapshot = beforeSnapshotRows[0]!
        const nextSourceData: PostSourceData = {
          ...initialSourceData,
          locales: {
            ...initialSourceData.locales,
            pt: {
              ...initialSourceData.locales.pt!,
              content: makeDocument("Depois"),
            },
          },
        }
        const crdtUpdate = makePostCrdtUpdate({
          nextSourceData,
          snapshot: beforeSnapshot.crdtSnapshot,
        })

        yield* repository.updatePost(
          HumanCrdtUpdate.make({
            authorId: person.id,
            crdtUpdate,
            expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
            postId,
          }),
        )

        const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
        expect(commits).toHaveLength(2)
        expect(commits[1]?.createdById).toBe(person.id)
        expect(commits[1]?.fromCrdtFrontier).toEqual(
          Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
        )

        const replayedDoc = applyUpdateToSnapshot({
          crdtUpdate: commits[1]!.crdtUpdate,
          snapshot: beforeSnapshot.crdtSnapshot,
        })
        expect(getPtContentFromStorageJson(replayedDoc.toJSON())).toEqual(makeDocument("Depois"))

        const row = yield* repository.findPostRowById(postId)
        expect(Option.isSome(row)).toBe(true)
        expect(
          Equal.equals(
            Option.getOrThrow(row).currentCrdtFrontier,
            LoroDocFrontier.make(replayedDoc.frontiers()),
          ),
        ).toBe(true)

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
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const postId = yield* repository.createPost({
        createdById: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Texto original"),
          handle: `post-${person.id.slice(0, 8)}-translate`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const beforeTranslation = yield* repository.findPostRowById(postId)
      expect(Option.isSome(beforeTranslation)).toBe(true)
      const beforeSnapshotRows = Schema.decodeUnknownSync(Schema.Array(PostCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${postId}`,
      )
      expect(beforeSnapshotRows).toHaveLength(1)
      const beforeSnapshot = beforeSnapshotRows[0]!

      yield* repository.updatePost(
        SystemUpsertTranslation.make({
          commit: SystemCommit.make({
            model: "translation/test",
            workflowName: "PostTranslationWorkflow",
            workflowVersion: "test",
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          postId,
          sourceLocale: "pt",
          targetLocale: "en",
          translatedContent: makeDocument("Translated text"),
        }),
      )

      const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
      expect(commits).toHaveLength(2)
      expect(commits.some((commit) => commit.createdById === null)).toBe(true)
      const replayedDoc = applyUpdateToSnapshot({
        crdtUpdate: commits[1]!.crdtUpdate,
        snapshot: beforeSnapshot.crdtSnapshot,
      })
      const replayedStorage = replayedDoc.toJSON() as {
        locales?: { en?: { content?: string; translatedAtCrdtFrontier?: string } }
      }
      expect(
        replayedStorage.locales?.en?.content
          ? JSON.parse(replayedStorage.locales.en.content)
          : undefined,
      ).toEqual(makeDocument("Translated text"))
      expect(replayedStorage.locales?.en?.translatedAtCrdtFrontier).toBe(
        JSON.stringify(Option.getOrThrow(beforeTranslation).currentCrdtFrontier),
      )

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
        createdById: person.id,
        sourceData: makeNoteSourceData({
          content: makeDocument("Texto original"),
          handle: `post-${person.id.slice(0, 8)}-frontier`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const beforeTranslation = yield* repository.findPostRowById(postId)
      expect(Option.isSome(beforeTranslation)).toBe(true)

      yield* repository.updatePost(
        SystemUpsertTranslation.make({
          commit: SystemCommit.make({
            model: "translation/test",
            workflowName: "PostTranslationWorkflow",
            workflowVersion: "test",
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          postId,
          sourceLocale: "pt",
          targetLocale: "en",
          translatedContent: makeDocument("Translated text"),
        }),
      )

      const TranslatedFrontierRow = Schema.Struct({
        translatedAtCrdtFrontier: Schema.fromJsonString(
          Schema.NullOr(Schema.Array(Schema.Unknown)),
        ),
      })
      const translationRows = Schema.decodeUnknownSync(Schema.Array(TranslatedFrontierRow))(
        yield* sql`
          SELECT translated_at_crdt_frontier
          FROM post_translations
          WHERE post_id = ${postId} AND locale = 'en'
        `,
      )

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
        createdById: person.id,
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

  it.effect("updatePost fails when expected frontier is stale", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const initialSourceData = makeNoteSourceData({
        content: makeDocument("Versao 1"),
        handle: `post-${person.id.slice(0, 8)}-stale-frontier`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const postId = yield* repository.createPost({
        createdById: person.id,
        sourceData: initialSourceData,
      })

      const initialRow = yield* repository.findPostRowById(postId)
      expect(Option.isSome(initialRow)).toBe(true)
      const expectedCurrentCrdtFrontier = Option.getOrThrow(initialRow).currentCrdtFrontier
      const initialSnapshotRows = Schema.decodeUnknownSync(Schema.Array(PostCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${postId}`,
      )
      expect(initialSnapshotRows).toHaveLength(1)
      const initialSnapshot = initialSnapshotRows[0]!
      const makeUpdateWithContent = (content: TiptapDocument) =>
        makePostCrdtUpdate({
          nextSourceData: {
            ...initialSourceData,
            locales: {
              ...initialSourceData.locales,
              pt: {
                ...initialSourceData.locales.pt!,
                content,
              },
            },
          },
          snapshot: initialSnapshot.crdtSnapshot,
        })

      yield* repository.updatePost(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: makeUpdateWithContent(makeDocument("Versao 2")),
          expectedCurrentCrdtFrontier,
          postId,
        }),
      )

      const staleUpdate = repository.updatePost(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: makeUpdateWithContent(makeDocument("Versao 3")),
          expectedCurrentCrdtFrontier,
          postId,
        }),
      )

      yield* Effect.flip(staleUpdate).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(PostConcurrentUpdateError)
          }),
        ),
      )

      const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
      expect(commits).toHaveLength(2)
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )

  it.effect("updatePost with invalid CRDT update does not persist partial changes", () =>
    Effect.gen(function* () {
      const repository = yield* PostsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makeNoteSourceData({
        content: makeDocument("Permanece"),
        handle: `post-${person.id.slice(0, 8)}-invalid-update`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const postId = yield* repository.createPost({
        createdById: person.id,
        sourceData,
      })

      const beforeUpdate = yield* repository.findPostRowById(postId)
      expect(Option.isSome(beforeUpdate)).toBe(true)

      const invalidUpdate = repository.updatePost(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: Schema.decodeUnknownSync(LoroDocUpdate)(new Uint8Array([1, 2, 3])),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
          postId,
        }),
      )

      yield* Effect.flip(invalidUpdate).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(InvalidCrdtUpdateError)
          }),
        ),
      )

      const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
      expect(commits).toHaveLength(1)

      const pageData = yield* repository.findPostPageData({
        handle: sourceData.metadata.handle,
        locale: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      expect(Option.getOrThrow(pageData).content).toEqual(makeDocument("Permanece"))
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
        createdById: person.id,
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

      const commits = yield* repository.listPostCommitRowsByPostIdAsc(postId)
      expect(commits).toHaveLength(0)
    }).pipe(Effect.provide(TestLayerWithPostsRepository)),
  )
})
