import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  LoroDocSnapshot,
  LoroDocUpdate,
  PublicationCrdtRow,
  PublicationSourceDataStorageLoro,
  UnauthorizedError,
  type PublicationSourceData,
  type TiptapDocument,
  type TiptapNode,
  sourcePublicationDataToCrdtStorage,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { DateTime, Effect, Layer, Option, Schema, Struct } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Mirror } from "loro-mirror"

import { PublicationsRepository } from "../../src/publications/repository.js"
import { PublicationsService } from "../../src/publications/service.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { makeAccountSession } from "../session-builders.js"
import { insertPersonWithDependencies, TestLayer, withSession } from "../test-helpers.js"

const PublicationsRepositoryLayer = Layer.effect(
  PublicationsRepository,
  PublicationsRepository.make,
).pipe(Layer.provide(TestLayer))

const PublicationsServiceLayer = Layer.effect(PublicationsService, PublicationsService.make).pipe(
  Layer.provide(PublicationsRepositoryLayer),
)

const TestLayerWithPublicationsService = Layer.mergeAll(
  TestLayer,
  PublicationsRepositoryLayer,
  PublicationsServiceLayer,
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

describe("PublicationsService", () => {
  it.effect("updatePublication denies edits from non-owners", () =>
    Effect.gen(function* () {
      const service = yield* PublicationsService
      const repository = yield* PublicationsRepository
      const sql = yield* SqlClient.SqlClient

      const owner = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const ownerProfile = yield* makeProfileFixture({ id: owner.id })
      yield* insertPersonWithDependencies({ person: owner, profile: ownerProfile })

      const other = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const otherProfile = yield* makeProfileFixture({ id: other.id })
      yield* insertPersonWithDependencies({ person: other, profile: otherProfile })

      const now = yield* DateTime.now
      const sourceData = makePostSourceData({
        content: makeDocument("Nota do dono"),
        handle: `svc-publication-${owner.id.slice(0, 8)}`,
        ownerProfileId: ownerProfile.id,
        publishedAt: now,
      })
      const publicationId = yield* repository.createPublication({
        createdById: owner.id,
        sourceData,
      })

      const before = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(before)).toBe(true)
      const snapshotRows = Schema.decodeUnknownSync(Schema.Array(PublicationCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${publicationId}`,
      )
      expect(snapshotRows).toHaveLength(1)
      const snapshot = snapshotRows[0]
      expect(snapshot).toBeDefined()
      if (snapshot === undefined) return
      const ptLocale = sourceData.locales.pt
      expect(ptLocale).toBeDefined()
      if (ptLocale === undefined) return

      const result = yield* withSession(
        service.updatePublication({
          crdtUpdate: makePublicationCrdtUpdate({
            nextSourceData: {
              ...sourceData,
              locales: {
                ...sourceData.locales,
                pt: {
                  ...ptLocale,
                  content: makeDocument("Tentativa sem permissao"),
                },
              },
            },
            snapshot: snapshot.crdtSnapshot,
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(before).currentCrdtFrontier,
          publicationId,
        }),
        makeAccountSession(other.id),
      ).pipe(Effect.flip)

      expect(result).toBeInstanceOf(UnauthorizedError)
    }).pipe(Effect.provide(TestLayerWithPublicationsService)),
  )

  it.effect("updatePublication updates publication content with a fresh frontier", () =>
    Effect.gen(function* () {
      const service = yield* PublicationsService
      const repository = yield* PublicationsRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const now = yield* DateTime.now
      const sourceData = makePostSourceData({
        content: makeDocument("Antes"),
        handle: `service-publication-${person.id.slice(0, 8)}`,
        ownerProfileId: profile.id,
        publishedAt: now,
      })
      const publicationId = yield* repository.createPublication({
        createdById: person.id,
        sourceData,
      })

      const before = yield* repository.findPublicationRowById(publicationId)
      expect(Option.isSome(before)).toBe(true)
      const snapshotRows = Schema.decodeUnknownSync(Schema.Array(PublicationCrdtSnapshotRow))(
        yield* sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${publicationId}`,
      )
      expect(snapshotRows).toHaveLength(1)
      const snapshot = snapshotRows[0]
      expect(snapshot).toBeDefined()
      if (snapshot === undefined) return
      const ptLocale = sourceData.locales.pt
      expect(ptLocale).toBeDefined()
      if (ptLocale === undefined) return

      yield* withSession(
        service.updatePublication({
          crdtUpdate: makePublicationCrdtUpdate({
            nextSourceData: {
              ...sourceData,
              locales: {
                ...sourceData.locales,
                pt: {
                  ...ptLocale,
                  content: makeDocument("Depois"),
                },
              },
            },
            snapshot: snapshot.crdtSnapshot,
          }),
          expectedCurrentCrdtFrontier: Option.getOrThrow(before).currentCrdtFrontier,
          publicationId,
        }),
        makeAccountSession(person.id),
      )

      const handle = Option.getOrThrow(
        yield* repository.findPublicationRowById(publicationId),
      ).handle
      const page = yield* repository.findPublicationPageData({ handle, locale: "pt" })
      expect(Option.isSome(page)).toBe(true)
      expect(Option.getOrThrow(page).content).toEqual(makeDocument("Depois"))
    }).pipe(Effect.provide(TestLayerWithPublicationsService)),
  )
})
