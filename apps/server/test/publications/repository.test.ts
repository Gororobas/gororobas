import { describe, expect, it } from "@effect/vitest"
import { ContentLanguage, CorePublicationMetadata, TiptapNodeId } from "@gororobas/domain"
import { PublicationCrdt } from "@gororobas/domain"
import {
  Handle,
  InvalidCrdtUpdateError,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PublicationConcurrentUpdateError,
  StalePublicationTranslationError,
  PublicationSourceRow,
  SystemCommit,
  PublicationSourceData,
  type TiptapDocument,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { DateTime, Effect, Equal, Layer, Option, Schema, Struct } from "effect"
import { SqlClient } from "effect/sql"

import { updatePublicationSourceRow } from "../../src/publications/mutations.js"
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
const PublicationCrdtSnapshotRow = PublicationSourceRow.mapFields(Struct.pick(["crdtSnapshot"]))

const paragraph = (text: string) => ({
  attrs: { nodeId: TiptapNodeId.make("paragraph001") },
  content: [{ text, type: "text" as const }],
  type: "paragraph" as const,
})

const makeDocument = (text: string): TiptapDocument => ({
  content: [paragraph(text)],
  type: "doc",
  version: 1,
})

const makeHandle = Schema.decodeSync(Handle)

const makePublicationCrdtUpdate = (input: {
  nextSourceData: PublicationSourceData
  snapshot: LoroDocSnapshot
}) => {
  const currentDoc = snapshotToLoroDoc(input.snapshot)
  const nextDoc = currentDoc.fork()

  Effect.runSync(
    PublicationCrdt.applyEdit(nextDoc, {
      _tag: "SetPublicationMetadata",
      value: input.nextSourceData.metadata,
    }),
  )

  Effect.runSync(
    PublicationCrdt.applyEdit(nextDoc, {
      _tag: "SetPublicationSourceContent",
      content: input.nextSourceData.sourceContent,
    }),
  )

  Effect.runSync(
    PublicationCrdt.applyEdit(nextDoc, {
      _tag: "SetPublicationSourceLanguage",
      sourceLanguage: input.nextSourceData.sourceLanguage,
    }),
  )

  const translationLanguages = ["en", "es", "pt"] as const

  translationLanguages.forEach((language) => {
    const value = input.nextSourceData.translations[language]

    Effect.runSync(
      PublicationCrdt.applyEdit(
        nextDoc,
        value
          ? { _tag: "SetPublicationTranslation", language, value }
          : { _tag: "RemovedPublicationTranslation", language },
      ),
    )
  })

  return Schema.decodeSync(LoroDocUpdate)(
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

const makePostSourceData = (content: TiptapDocument): PublicationSourceData => ({
  sourceContent: content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" },
  metadata: { kind: "POST" },
})

const makeCoreMetadata = (input: {
  handle: string
  ownerProfileId: CorePublicationMetadata["ownerProfileId"]
  publishedAt: CorePublicationMetadata["publishedAt"]
}) =>
  CorePublicationMetadata.make({
    handle: makeHandle(input.handle),
    ownerProfileId: input.ownerProfileId,
    publishedAt: input.publishedAt,
    visibility: "PUBLIC",
  })

const makePostInput = (
  input: Parameters<typeof makeCoreMetadata>[0] & { content: TiptapDocument },
) => ({
  ...makeCoreMetadata(input),
  sourceData: makePostSourceData(input.content),
})

const makeEventInput = (
  input: Parameters<typeof makeCoreMetadata>[0] & {
    content: TiptapDocument
    endDate: CorePublicationMetadata["publishedAt"]
    locationOrUrl?: string
    startDate: CorePublicationMetadata["publishedAt"]
  },
) => ({
  ...makeCoreMetadata(input),
  sourceData: {
    sourceContent: input.content,
    sourceLanguage: ContentLanguage.make("pt"),
    translations: { pt: "original" },
    metadata: {
      attendanceMode: "IN_PERSON",
      endDate: input.endDate,
      kind: "EVENT",
      locationOrUrl: input.locationOrUrl ?? null,
      startDate: input.startDate,
    },
  } satisfies PublicationSourceData,
})

describe("PublicationsRepository", () => {
  it.effect("createPublication persists projection row and first revision", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationInput = makePostInput({
        content: makeDocument("Primeira versao"),
        handle: `pub-${person.id.slice(0, 8)}`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        ...publicationInput,
      })

      const publication = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(publication)).toBe(true)
      expect(Option.getOrThrow(publication).handle).toBe(publicationInput.handle)

      const revisions =
        yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
      expect(revisions).toHaveLength(1)
      expect(revisions[0]?.createdById).toBe(person.id)

      const contributors =
        yield* repository.listPublicationContributorIdsByPublicationId(publicationId)
      expect(contributors.map((entry) => entry.createdById)).toEqual([person.id])

      const byOwner = yield* repository.listPublicationRowsByOwnerProfileId(profile.id)
      expect(byOwner).toHaveLength(1)
      expect(byOwner[0]?.id).toBe(publicationId)

      const pageData = yield* repository.findPublicationPageData({
        handle: publicationInput.handle,
        language: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      const page = Option.getOrThrow(pageData)
      expect(page.kind).toBe("POST")
      expect(page.content).toEqual(makeDocument("Primeira versao"))
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect(
    "updatePublication with HumanCrdtUpdate appends replayable revision and rebuilds projected post content",
    () =>
      Effect.gen(function* () {
        const repository = yield* PublicationsRepository
        const sql = yield* SqlClient.SqlClient

        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        const now = yield* DateTime.now

        const publicationInput = makePostInput({
          content: makeDocument("Antes"),
          handle: `pub-${person.id.slice(0, 8)}-update`,
          ownerProfileId: profile.id,
          publishedAt: now,
        })

        const publicationId = yield* repository.createPublication({
          createdById: person.id,
          ...publicationInput,
        })

        const beforeUpdate = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(beforeUpdate)).toBe(true)
        const beforeSnapshotRows = yield* Schema.decodeUnknownEffect(
          Schema.Array(PublicationCrdtSnapshotRow),
        )(yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`)
        expect(beforeSnapshotRows).toHaveLength(1)
        const beforeSnapshot = Option.getOrThrow(Option.fromNullishOr(beforeSnapshotRows[0]))

        const nextSourceData: PublicationSourceData = {
          ...publicationInput.sourceData,
          sourceContent: makeDocument("Depois"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
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

        const revisions =
          yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
        expect(revisions).toHaveLength(2)
        expect(revisions[1]?.createdById).toBe(person.id)
        expect(revisions[1]?.fromCrdtFrontier).toEqual(
          Option.getOrThrow(beforeUpdate).currentCrdtFrontier,
        )

        const replayedDoc = applyUpdateToSnapshot({
          crdtUpdate: Option.getOrThrow(Option.fromNullishOr(revisions[1])).crdtUpdate,
          snapshot: beforeSnapshot.crdtSnapshot,
        })
        expect((yield* PublicationCrdt.read(replayedDoc)).sourceContent).toEqual(
          makeDocument("Depois"),
        )

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
          language: "pt",
        })
        expect(Option.isSome(pageData)).toBe(true)
        const page = Option.getOrThrow(pageData)
        expect(page.content).toEqual(makeDocument("Depois"))
      }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect(
    "updatePublication with SystemUpsertTranslation creates system revision and translation",
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
          ...makePostInput({
            content: makeDocument("Texto original"),
            handle: `pub-${person.id.slice(0, 8)}-translate`,
            ownerProfileId: profile.id,
            publishedAt: now,
          }),
        })

        const beforeTranslation = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(beforeTranslation)).toBe(true)
        const beforeSnapshotRows = yield* Schema.decodeUnknownEffect(
          Schema.Array(PublicationCrdtSnapshotRow),
        )(yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`)
        expect(beforeSnapshotRows).toHaveLength(1)
        const beforeSnapshot = Option.getOrThrow(Option.fromNullishOr(beforeSnapshotRows[0]))

        yield* repository.updatePublication(
          SystemUpsertTranslation.make({
            commit: SystemCommit.make({
              model: "translation/test",
              workflowName: "PublicationTranslationWorkflow",
              workflowVersion: "test",
            }),
            sourceCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
            publicationId,
            sourceLanguage: ContentLanguage.make("pt"),
            targetLanguage: "en",
            translatedContent: makeDocument("Translated text"),
          }),
        )

        const revisions =
          yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
        expect(revisions).toHaveLength(2)
        expect(revisions.some((revision) => revision.createdById === null)).toBe(true)
        const replayedDoc = applyUpdateToSnapshot({
          crdtUpdate: Option.getOrThrow(Option.fromNullishOr(revisions[1])).crdtUpdate,
          snapshot: beforeSnapshot.crdtSnapshot,
        })

        const replayed = yield* PublicationCrdt.read(replayedDoc)
        expect(
          replayed.translations.en !== "original" ? replayed.translations.en?.content : undefined,
        ).toEqual(makeDocument("Translated text"))

        expect(
          replayed.translations.en !== "original"
            ? replayed.translations.en?.translatedAtCrdtFrontier
            : undefined,
        ).toEqual(Option.getOrThrow(beforeTranslation).currentCrdtFrontier)

        const row = yield* repository.findPublicationRowById(publicationId)
        expect(Option.isSome(row)).toBe(true)

        const pageData = yield* repository.findPublicationPageData({
          handle: Option.getOrThrow(row).handle,
          language: "en",
        })
        expect(Option.isSome(pageData)).toBe(true)
        const page = Option.getOrThrow(pageData)
        expect(page.content).toEqual(makeDocument("Translated text"))
      }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect(
    "translations retain their source frontier across sibling writes and reject an edited source",
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
          ...makePostInput({
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
            sourceCrdtFrontier: Option.getOrThrow(beforeTranslation).currentCrdtFrontier,
            publicationId,
            sourceLanguage: ContentLanguage.make("pt"),
            targetLanguage: "en",
            translatedContent: makeDocument("Translated text"),
          }),
        )

        const sourceCrdtFrontier = Option.getOrThrow(beforeTranslation).currentCrdtFrontier

        yield* repository.updatePublication(
          SystemUpsertTranslation.make({
            commit: SystemCommit.make({
              model: "translation/test",
              workflowName: "PublicationTranslationWorkflow",
              workflowVersion: "test",
            }),
            sourceCrdtFrontier,
            publicationId,
            sourceLanguage: ContentLanguage.make("pt"),
            targetLanguage: "es",
            translatedContent: makeDocument("Texto traducido"),
          }),
        )

        const TranslatedFrontierRow = Schema.Struct({
          translatedAtCrdtFrontier: Schema.fromJsonString(
            Schema.NullOr(Schema.Array(Schema.Unknown)),
          ),
        })

        const translationRows = yield* Schema.decodeUnknownEffect(
          Schema.Array(TranslatedFrontierRow),
        )(
          yield* sql`
          SELECT translated_at_crdt_frontier
          FROM publication_translations
          WHERE publication_id = ${publicationId} AND language IN ('en', 'es')
        `,
        )

        expect(translationRows).toHaveLength(2)
        expect(translationRows.map((row) => row.translatedAtCrdtFrontier)).toEqual([
          sourceCrdtFrontier,
          sourceCrdtFrontier,
        ])
        const frontier = translationRows[0]?.translatedAtCrdtFrontier
        expect(frontier).not.toBeNull()
        expect(frontier).not.toEqual([])
        expect(frontier).not.toEqual("[]")
        const afterSpanish = Option.getOrThrow(
          yield* repository.findPublicationRowById(publicationId),
        )
        const snapshotRows = yield* Schema.decodeUnknownEffect(
          Schema.Array(PublicationCrdtSnapshotRow),
        )(yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`)

        yield* repository.updatePublication(
          HumanCrdtUpdate.make({
            authorId: person.id,
            expectedCurrentCrdtFrontier: afterSpanish.currentCrdtFrontier,
            publicationId,
            crdtUpdate: makePublicationCrdtUpdate({
              snapshot: Option.getOrThrow(Option.fromNullishOr(snapshotRows[0])).crdtSnapshot,
              nextSourceData: makePostSourceData(makeDocument("Original editado")),
            }),
          }),
        )

        const staleError = yield* repository
          .updatePublication(
            SystemUpsertTranslation.make({
              commit: SystemCommit.make({
                model: "translation/test",
                workflowName: "PublicationTranslationWorkflow",
                workflowVersion: "test",
              }),
              sourceCrdtFrontier,
              publicationId,
              sourceLanguage: ContentLanguage.make("pt"),
              targetLanguage: "en",
              translatedContent: makeDocument("Stale result"),
            }),
          )
          .pipe(Effect.flip)

        expect(staleError).toBeInstanceOf(StalePublicationTranslationError)
      }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("createPublication projects event metadata", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const startDate = yield* DateTime.now
      const endDate = DateTime.add(startDate, { days: 1 })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        ...makeEventInput({
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

      const publicationInput = makePostInput({
        content: makeDocument("Versao 1"),
        handle: `pub-${person.id.slice(0, 8)}-stale-frontier`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        ...publicationInput,
      })

      const initialRow = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(initialRow)).toBe(true)
      const expectedCurrentCrdtFrontier = Option.getOrThrow(initialRow).currentCrdtFrontier
      const initialSnapshotRows = yield* Schema.decodeUnknownEffect(
        Schema.Array(PublicationCrdtSnapshotRow),
      )(yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`)
      expect(initialSnapshotRows).toHaveLength(1)
      const initialSnapshot = Option.getOrThrow(Option.fromNullishOr(initialSnapshotRows[0]))

      const makeUpdateWithContent = (content: TiptapDocument) =>
        makePublicationCrdtUpdate({
          nextSourceData: {
            ...publicationInput.sourceData,
            sourceContent: content,
            sourceLanguage: ContentLanguage.make("pt"),
            translations: { pt: "original" },
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

      const revisions =
        yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
      expect(revisions).toHaveLength(2)

      // The statement itself also refuses a stale frontier, independently of the in-transaction check.
      const snapshotBefore =
        yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`

      const guarded = yield* updatePublicationSourceRow({
        id: publicationId,
        crdtSnapshot: initialSnapshot.crdtSnapshot,
        expectedCrdtFrontier: expectedCurrentCrdtFrontier,
        updatedAt: yield* DateTime.now,
      })

      expect(Option.isNone(guarded)).toBe(true)
      expect(
        yield* sql`SELECT crdt_snapshot FROM publication_sources WHERE id = ${publicationId}`,
      ).toEqual(snapshotBefore)
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("updatePublication with invalid CRDT update does not persist partial changes", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationInput = makePostInput({
        content: makeDocument("Permanece"),
        handle: `pub-${person.id.slice(0, 8)}-invalid-update`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        ...publicationInput,
      })

      const beforeUpdate = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(beforeUpdate)).toBe(true)

      const invalidUpdate = repository.updatePublication(
        HumanCrdtUpdate.make({
          authorId: person.id,
          crdtUpdate: yield* Schema.decodeEffect(LoroDocUpdate)(new Uint8Array([1, 2, 3])),
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

      const revisions =
        yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
      expect(revisions).toHaveLength(1)

      const pageData = yield* repository.findPublicationPageData({
        handle: publicationInput.handle,
        language: "pt",
      })
      expect(Option.isSome(pageData)).toBe(true)
      expect(Option.getOrThrow(pageData).content).toEqual(makeDocument("Permanece"))
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )

  it.effect("deletePublication removes publication row and cascades revisions", () =>
    Effect.gen(function* () {
      const repository = yield* PublicationsRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now

      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        ...makePostInput({
          content: makeDocument("Para remover"),
          handle: `pub-${person.id.slice(0, 8)}-delete`,
          ownerProfileId: profile.id,
          publishedAt: now,
        }),
      })

      yield* repository.deletePublication(publicationId)

      const row = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isNone(row)).toBe(true)

      const revisions =
        yield* repository.listPublicationRevisionRowsByPublicationIdAsc(publicationId)
      expect(revisions).toHaveLength(0)
    }).pipe(Effect.provide(TestLayerWithPublicationsRepository)),
  )
})
