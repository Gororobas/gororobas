import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  InvalidCrdtUpdateError,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PublicationSourceDataStorageLoro,
  PublicationConcurrentUpdateError,
  PublicationCrdtRow,
  SystemCommit,
  type PublicationSourceData,
  type TiptapDocument,
  type TiptapNode,
  sourcePublicationDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { DateTime, Effect, Equal, Layer, Option, Schema, Struct } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Mirror } from "loro-mirror"

import {
  HumanCrdtUpdate,
  SystemUpsertTranslation,
} from "../../src/publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../../src/publications/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

const PublicationsRepositoryTestLayer = Layer.effect(
  PublicationsRepository,
  PublicationsRepository.make,
).pipe(Layer.provide(TestLayer))
const TestLayerWithPublicationsRepository = Layer.mergeAll(
  TestLayer,
  PublicationsRepositoryTestLayer,
)
const PublicationCrdtSnapshotRow = PublicationCrdtRow.mapFields(Struct.pick(["crdtSnapshot"]))

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

const makePublicationCrdtUpdate = (input: {
  nextSourceData: PublicationSourceData
  snapshot: LoroDocSnapshot
}) => {
  const currentDoc = snapshotToLoroDoc(input.snapshot)
  const nextDoc = currentDoc.fork()
  const store = new Mirror({
    doc: nextDoc,
    schema: PublicationSourceDataStorageLoro,
  })

  store.setState(() => sourcePublicationDataToCrdtStorage(input.nextSourceData))
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
  const storage = Schema.decodeUnknownSync(
    Schema.Struct({
      locales: Schema.optional(
        Schema.Struct({
          pt: Schema.optional(Schema.Struct({ content: Schema.optional(Schema.String) })),
        }),
      ),
    }),
  )(json)

  return Option.match(Option.fromNullishOr(storage.locales?.pt?.content), {
    onNone: () => undefined,
    onSome: (content) => Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(content),
  })
}

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

const makeEventSourceData = (input: {
  content: TiptapDocument
  endDate: PublicationSourceData["metadata"]["publishedAt"]
  handle: string
  locationOrUrl?: string
  ownerProfileId: PublicationSourceData["metadata"]["ownerProfileId"]
  publishedAt: PublicationSourceData["metadata"]["publishedAt"]
  startDate: PublicationSourceData["metadata"]["publishedAt"]
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
    attendanceMode: "IN_PERSON",
    endDate: input.endDate,
    handle: makeHandle(input.handle),
    kind: "EVENT",
    locationOrUrl: input.locationOrUrl ?? null,
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    startDate: input.startDate,
    visibility: "PUBLIC",
  },
})

describe("PublicationsRepository", () => {
  it.effect("createPublication persists materialized row and first commit", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makePostSourceData({
        content: makeDocument("Primeira versao"),
        handle: `pub-${person.id.slice(0, 8)}`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData,
      })

      const publication = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(publication)).toBe(true)
      expect(Option.getOrThrow(publication).handle).toBe(sourceData.metadata.handle)

      const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
      expect(commits).toHaveLength(1)
      expect(commits[0]?.createdById).toBe(person.id)

      const contributors =
        yield* repository.listPublicationContributorIdsByPublicationId(publicationId)
      expect(contributors.map((entry) => entry.createdById)).toEqual([person.id])

      const byOwner = yield* repository.listPublicationRowsByOwnerProfileId(profile.id)
      expect(byOwner).toHaveLength(1)
      expect(byOwner[0]?.id).toBe(publicationId)

      const pageData = yield* repository.findPublicationPageData({
        handle: sourceData.metadata.handle,
        locale: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      const page = Option.getOrThrow(pageData)
      expect(page.kind).toBe("POST")
      expect(page.content).toEqual(makeDocument("Primeira versao"))
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect(
    "updatePublication with HumanCrdtUpdate appends replayable commit and rematerializes post content",
    () =>
      Effect.gen(function* () {
        const repository = yield* PublicationsRepository
        const sql = yield* SqlClient.SqlClient

        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        const now = yield* DateTime.now
        const initialSourceData = makePostSourceData({
          content: makeDocument("Antes"),
          handle: `pub-${person.id.slice(0, 8)}-update`,
          ownerProfileId: profile.id,
          publishedAt: now,
        })
        const publicationId = yield* repository.createPublication({
          createdById: person.id,
          sourceData: initialSourceData,
        })

        const beforeUpdate = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(beforeUpdate)).toBe(true)
        const beforeSnapshotRows = Schema.decodeUnknownSync(
          Schema.Array(PublicationCrdtSnapshotRow),
        )(yield* sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${publicationId}`)
        expect(beforeSnapshotRows).toHaveLength(1)
        const beforeSnapshot = Option.getOrThrow(Option.fromNullishOr(beforeSnapshotRows[0]))
        const nextSourceData: PublicationSourceData = {
          ...initialSourceData,
          locales: {
            ...initialSourceData.locales,
            pt: {
              ...Option.getOrThrow(Option.fromNullishOr(initialSourceData.locales.pt)),
              content: makeDocument("Depois"),
            },
          },
        }
        const crdtUpdate = makePublicationCrdtUpdate({
          nextSourceData,
          snapshot: beforeSnapshot.crdtSnapshot,
        })

        yield* repository.updatePublication(
          HumanCrdtUpdate.make({
            authorId: person.id,
            crdtUpdate,
            expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
            publicationId,
          }),
        )

        const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
        expect(commits).toHaveLength(2)
        expect(commits[1]?.createdById).toBe(person.id)
        expect(commits[1]?.fromCrdtFrontier).toEqual(
          Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
        )

        const replayedDoc = applyUpdateToSnapshot({
          crdtUpdate: Option.getOrThrow(Option.fromNullishOr(commits[1])).crdtUpdate,
          snapshot: beforeSnapshot.crdtSnapshot,
        })
        expect(getPtContentFromStorageJson(replayedDoc.toJSON())).toEqual(makeDocument("Depois"))

        const row = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(row)).toBe(true)
        expect(
          Equal.equals(
            Option.getOrThrow(row).currentCrdtFrontier,
            LoroDocFrontier.make(replayedDoc.frontiers()),
          ),
        ).toBe(true)

        const pageData = yield* repository.findPublicationPageData({
          handle: Option.getOrThrow(row).handle,
          locale: "pt",
        })
        expect(Option.isSome(pageData)).toBe(true)
        const page = Option.getOrThrow(pageData)
        expect(page.content).toEqual(makeDocument("Depois"))
      }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect(
    "updatePublication with SystemUpsertTranslation creates system commit and translation",
    () =>
      Effect.gen(function* () {
        const repository = yield* PublicationsRepository
        const sql = yield* SqlClient.SqlClient

        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        const now = yield* DateTime.now
        const publicationId = yield* repository.createPublication({
          createdById: person.id,
          sourceData: makePostSourceData({
            content: makeDocument("Texto original"),
            handle: `pub-${person.id.slice(0, 8)}-translate`,
            ownerProfileId: profile.id,
            publishedAt: now,
          }),
        })

        const beforeTranslation = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(beforeTranslation)).toBe(true)
        const beforeSnapshotRows = Schema.decodeUnknownSync(
          Schema.Array(PublicationCrdtSnapshotRow),
        )(yield* sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${publicationId}`)
        expect(beforeSnapshotRows).toHaveLength(1)
        const beforeSnapshot = Option.getOrThrow(Option.fromNullishOr(beforeSnapshotRows[0]))

        yield* repository.updatePublication(
          SystemUpsertTranslation.make({
            commit: SystemCommit.make({
              model: "translation/test",
              workflowName: "PublicationTranslationWorkflow",
              workflowVersion: "test",
            }),
            expectedCurrentCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
            publicationId,
            sourceLocale: "pt",
            targetLocale: "en",
            translatedContent: makeDocument("Translated text"),
          }),
        )

        const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
        expect(commits).toHaveLength(2)
        expect(commits.some((commit) => commit.createdById === null)).toBe(true)
        const replayedDoc = applyUpdateToSnapshot({
          crdtUpdate: Option.getOrThrow(Option.fromNullishOr(commits[1])).crdtUpdate,
          snapshot: beforeSnapshot.crdtSnapshot,
        })
        const replayedStorage = Schema.decodeUnknownSync(
          Schema.Struct({
            locales: Schema.optional(
              Schema.Struct({
                en: Schema.optional(
                  Schema.Struct({
                    content: Schema.optional(Schema.String),
                    translatedAtCrdtFrontier: Schema.optional(Schema.String),
                  }),
                ),
              }),
            ),
          }),
        )(replayedDoc.toJSON())
        expect(
          Option.match(Option.fromNullishOr(replayedStorage.locales?.en?.content), {
            onNone: () => undefined,
            onSome: (content) =>
              Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(content),
          }),
        ).toEqual(makeDocument("Translated text"))
        expect(replayedStorage.locales?.en?.translatedAtCrdtFrontier).toBe(
          Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(
            Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          ),
        )

        const row = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(row)).toBe(true)

        const pageData = yield* repository.findPublicationPageData({
          handle: Option.getOrThrow(row).handle,
          locale: "en",
        })
        expect(Option.isSome(pageData)).toBe(true)
        const page = Option.getOrThrow(pageData)
        expect(page.content).toEqual(makeDocument("Translated text"))
      }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("updatePublication with SystemUpsertTranslation stores translation frontier", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData: makePostSourceData({
          content: makeDocument("Texto original"),
          handle: `pub-${person.id.slice(0, 8)}-frontier`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      const beforeTranslation = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(beforeTranslation)).toBe(true)

      yield* repository.updatePublication(
        SystemUpsertTranslation.make({
          commit: SystemCommit.make({
            model: "translation/test",
            workflowName: "PublicationTranslationWorkflow",
            workflowVersion: "test",
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
          publicationId,
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
          FROM publication_translations
          WHERE publication_id = ${publicationId} AND locale = 'en'
        `,
      )

      expect(translationRows).toHaveLength(1)
      const frontier = translationRows[0]?.translatedAtCrdtFrontier
      expect(frontier).not.toBeNull()
      expect(frontier).not.toEqual([])
      expect(frontier).not.toEqual("[]")
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("createPublication materializes event metadata", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const startDate = yield* DateTime.now
      const endDate = DateTime.add(startDate, { days: 1 })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData: makeEventSourceData({
          content: makeDocument("Feira agroecológica"),
          endDate,
          handle: `pub-${person.id.slice(0, 8)}-event`,
          locationOrUrl: "Sítio Semente, Brasília",
          ownerProfileId: profile.id,
          publishedAt: startDate,
          startDate,
        }),
      })

      const row = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(row)).toBe(true)
      expect(Option.getOrThrow(row).kind).toBe("EVENT")
      expect(Option.getOrThrow(row).attendanceMode).toBe("IN_PERSON")
      expect(Option.getOrThrow(row).locationOrUrl).toBe("Sítio Semente, Brasília")
      expect(Option.getOrThrow(row).startDate).not.toBeNull()
      expect(Option.getOrThrow(row).endDate).not.toBeNull()
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("updatePublication fails when expected frontier is stale", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const initialSourceData = makePostSourceData({
        content: makeDocument("Versao 1"),
        handle: `pub-${person.id.slice(0, 8)}-stale-frontier`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData: initialSourceData,
      })

      const initialRow = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(initialRow)).toBe(true)
      const expectedCurrentCrdtFrontier = Option.getOrThrow(initialRow).currentCrdtFrontier
      const initialSnapshotRows = Schema.decodeUnknownSync(
        Schema.Array(PublicationCrdtSnapshotRow),
      )(yield* sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${publicationId}`)
      expect(initialSnapshotRows).toHaveLength(1)
      const initialSnapshot = Option.getOrThrow(Option.fromNullishOr(initialSnapshotRows[0]))
      const makeUpdateWithContent = (content: TiptapDocument) =>
        makePublicationCrdtUpdate({
          nextSourceData: {
            ...initialSourceData,
            locales: {
              ...initialSourceData.locales,
              pt: {
                ...Option.getOrThrow(Option.fromNullishOr(initialSourceData.locales.pt)),
                content,
              },
            },
          },
          snapshot: initialSnapshot.crdtSnapshot,
        })

      yield* repository.updatePublication(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: makeUpdateWithContent(makeDocument("Versao 2")),
          expectedCurrentCrdtFrontier,
          publicationId,
        }),
      )

      const staleUpdate = repository.updatePublication(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: makeUpdateWithContent(makeDocument("Versao 3")),
          expectedCurrentCrdtFrontier,
          publicationId,
        }),
      )

      yield* Effect.flip(staleUpdate).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(PublicationConcurrentUpdateError)
          }),
        ),
      )

      const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
      expect(commits).toHaveLength(2)
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("updatePublication with invalid CRDT update does not persist partial changes", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makePostSourceData({
        content: makeDocument("Permanece"),
        handle: `pub-${person.id.slice(0, 8)}-invalid-update`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData,
      })

      const beforeUpdate = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(beforeUpdate)).toBe(true)

      const invalidUpdate = repository.updatePublication(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: Schema.decodeUnknownSync(LoroDocUpdate)(new Uint8Array([1, 2, 3])),
          expectedCurrentCrdtFrontier: Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
          publicationId,
        }),
      )

      yield* Effect.flip(invalidUpdate).pipe(
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(InvalidCrdtUpdateError)
          }),
        ),
      )

      const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
      expect(commits).toHaveLength(1)

      const pageData = yield* repository.findPublicationPageData({
        handle: sourceData.metadata.handle,
        locale: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      expect(Option.getOrThrow(pageData).content).toEqual(makeDocument("Permanece"))
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("deletePublication removes publication row and cascades commits", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData: makePostSourceData({
          content: makeDocument("Para remover"),
          handle: `pub-${person.id.slice(0, 8)}-delete`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      yield* repository.deletePublication(publicationId)

      const row = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isNone(row)).toBe(true)

      const commits = yield* repository.listPublicationCommitRowsByPublicationIdAsc(publicationId)
      expect(commits).toHaveLength(0)
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )
})
