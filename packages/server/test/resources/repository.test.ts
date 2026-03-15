import { describe, expect, it } from "@effect/vitest"
import { Handle, SourceResourceData } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Layer, Option, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import { ResourcesRepository } from "../../src/resources/repository.js"
import {
  makePersonFixture,
  makeProfileFixture,
  personWithProfileArbitrary,
  sourceResourceDataArbitrary,
} from "../fixtures.js"
import {
  DATABASE_PROPERTY_TEST_CONFIG,
  insertPersonWithDependencies,
  TestLayer,
} from "../test-helpers.js"

const ResourcesRepositoryTestLayer = Layer.effect(
  ResourcesRepository,
  ResourcesRepository.make,
).pipe(Layer.provide(TestLayer))
const TestLayerWithRepository = Layer.mergeAll(TestLayer, ResourcesRepositoryTestLayer)

const makeHandle = (value: string) => Schema.decodeUnknownSync(Handle)(value)

const makeResourceSourceData = (input: {
  title: string
  handle: string
  url: string
}): SourceResourceData =>
  SourceResourceData.makeUnsafe({
    locales: {
      pt: {
        title: input.title,
        description: null,
        creditLine: null,
        originalLocale: "pt",
        translationSource: "ORIGINAL",
      },
    },
    metadata: {
      format: "BOOK",
      handle: makeHandle(input.handle),
      thumbnailImageId: null,
      url: input.url,
      urlState: "UNCHECKED",
    },
  })

const withNormalizedResourceData = (input: {
  personId: string
  sourceData: SourceResourceData
}): SourceResourceData => {
  const fallbackLocalizedData = {
    title: `Título ${input.personId.slice(0, 8)}`,
    description: null,
    creditLine: null,
    originalLocale: "pt" as const,
    translationSource: "ORIGINAL" as const,
  }

  return SourceResourceData.makeUnsafe({
    ...input.sourceData,
    metadata: {
      ...input.sourceData.metadata,
      handle: makeHandle(`resource-${input.personId.slice(0, 8)}-property`),
      thumbnailImageId: null,
      url: `https://example.com/${input.personId}/property`,
    },
    locales: {
      ...input.sourceData.locales,
      pt:
        input.sourceData.locales.pt ??
        input.sourceData.locales.en ??
        input.sourceData.locales.es ??
        fallbackLocalizedData,
    },
  })
}

describe("ResourcesRepository", () => {
  it.effect("createResource persists materialized row and first approved revision", () =>
    Effect.gen(function* () {
      const resources = yield* ResourcesRepository

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const resourceId = yield* resources.createResource({
        createdById: person.id,
        sourceData: makeResourceSourceData({
          title: "A Terra Dá",
          handle: `resource-${person.id.slice(0, 8)}`,
          url: `https://example.com/${person.id}`,
        }),
      })

      const row = yield* resources.findResourceRowById(resourceId)
      expect(Option.isSome(row)).toBe(true)

      const translations = yield* resources.listResourceTranslationRowsByResourceId(resourceId)
      expect(translations).toHaveLength(1)
      expect(translations[0]?.title).toBe("A Terra Dá")
    }).pipe(Effect.provide(TestLayerWithRepository)),
  )

  it.effect("createResource does not persist partial state when handle is duplicated", () =>
    Effect.gen(function* () {
      const resources = yield* ResourcesRepository
      const sql = yield* SqlClient.SqlClient

      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id })
      yield* insertPersonWithDependencies({ person, profile })

      const duplicatedHandle = `resource-${person.id.slice(0, 8)}-duplicate`

      yield* resources.createResource({
        createdById: person.id,
        sourceData: makeResourceSourceData({
          title: "Primeiro recurso",
          handle: duplicatedHandle,
          url: `https://example.com/${person.id}/duplicate-1`,
        }),
      })

      const secondCreationFailed = yield* resources
        .createResource({
          createdById: person.id,
          sourceData: makeResourceSourceData({
            title: "Segundo recurso",
            handle: duplicatedHandle,
            url: `https://example.com/${person.id}/duplicate-2`,
          }),
        })
        .pipe(
          Effect.as(false),
          Effect.catch(() => Effect.succeed(true)),
        )

      expect(secondCreationFailed).toBe(true)

      const { count: resourcesCount } = yield* SqlSchema.findOne({
        Request: Schema.Null,
        Result: Schema.Struct({ count: Schema.Number }),
        execute: () => sql`SELECT COUNT(*) as count FROM resources`,
      })(null)

      const { count: resourceCrdtsCount } = yield* SqlSchema.findOne({
        Request: Schema.Null,
        Result: Schema.Struct({ count: Schema.Number }),
        execute: () => sql`SELECT COUNT(*) as count FROM resource_crdts`,
      })(null)

      const { count: revisionsCount } = yield* SqlSchema.findOne({
        Request: Schema.Null,
        Result: Schema.Struct({ count: Schema.Number }),
        execute: () => sql`SELECT COUNT(*) as count FROM resource_revisions`,
      })(null)

      expect(resourcesCount).toBe(1)
      expect(resourceCrdtsCount).toBe(1)
      expect(revisionsCount).toBe(1)
    }).pipe(Effect.provide(TestLayerWithRepository)),
  )

  it.effect("createRevision creates pending revision and approval updates materialized title", () =>
    Effect.gen(function* () {
      const resources = yield* ResourcesRepository

      const editor = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const editorProfile = yield* makeProfileFixture({ id: editor.id })
      yield* insertPersonWithDependencies({ person: editor, profile: editorProfile })

      const moderator = yield* makePersonFixture({ accessLevel: "MODERATOR" })
      const moderatorProfile = yield* makeProfileFixture({ id: moderator.id })
      yield* insertPersonWithDependencies({ person: moderator, profile: moderatorProfile })

      const resourceId = yield* resources.createResource({
        createdById: editor.id,
        sourceData: makeResourceSourceData({
          title: "Título original",
          handle: `resource-${editor.id.slice(0, 8)}-pending`,
          url: `https://example.com/${editor.id}/pending`,
        }),
      })

      const rowBeforeRevision = Option.getOrThrow(yield* resources.findResourceRowById(resourceId))
      const revisionId = yield* resources.createRevision({
        createdById: editor.id,
        resourceId,
        expectedCurrentCrdtFrontier: rowBeforeRevision.currentCrdtFrontier,
        title: "Título revisado",
      })

      const revision = yield* resources.findRevisionById(revisionId)
      expect(Option.isSome(revision)).toBe(true)
      expect(Option.getOrThrow(revision).evaluation).toBe("PENDING")

      yield* resources.evaluateRevision({
        revisionId,
        evaluatedById: moderator.id,
        evaluation: "APPROVED",
      })

      const revisionsAfterApproval = yield* resources.findRevisionById(revisionId)
      expect(Option.getOrThrow(revisionsAfterApproval).evaluation).toBe("APPROVED")

      const translations = yield* resources.listResourceTranslationRowsByResourceId(resourceId)
      expect(translations.find((row) => row.locale === "pt")?.title).toBe("Título revisado")
    }).pipe(Effect.provide(TestLayerWithRepository)),
  )

  it.effect("rejecting revision keeps materialized resource unchanged", () =>
    Effect.gen(function* () {
      const resources = yield* ResourcesRepository

      const editor = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const editorProfile = yield* makeProfileFixture({ id: editor.id })
      yield* insertPersonWithDependencies({ person: editor, profile: editorProfile })

      const moderator = yield* makePersonFixture({ accessLevel: "MODERATOR" })
      const moderatorProfile = yield* makeProfileFixture({ id: moderator.id })
      yield* insertPersonWithDependencies({ person: moderator, profile: moderatorProfile })

      const resourceId = yield* resources.createResource({
        createdById: editor.id,
        sourceData: makeResourceSourceData({
          title: "Título inicial",
          handle: `resource-${editor.id.slice(0, 8)}-rejected`,
          url: `https://example.com/${editor.id}/rejected`,
        }),
      })

      const row = Option.getOrThrow(yield* resources.findResourceRowById(resourceId))
      const revisionId = yield* resources.createRevision({
        createdById: editor.id,
        resourceId,
        expectedCurrentCrdtFrontier: row.currentCrdtFrontier,
        title: "Título incorreto",
      })

      yield* resources.evaluateRevision({
        revisionId,
        evaluatedById: moderator.id,
        evaluation: "REJECTED",
      })

      const translations = yield* resources.listResourceTranslationRowsByResourceId(resourceId)
      expect(translations.find((entry) => entry.locale === "pt")?.title).toBe("Título inicial")
    }).pipe(Effect.provide(TestLayerWithRepository)),
  )

  it.effect("property: resource round-trip through SQL preserves materialized metadata", () =>
    assertPropertyEffect(
      FastCheck.tuple(personWithProfileArbitrary, sourceResourceDataArbitrary).map(
        ([personWithProfile, sourceData]) => ({ personWithProfile, sourceData }),
      ),
      ({ personWithProfile, sourceData }) =>
        Effect.gen(function* () {
          const resources = yield* ResourcesRepository
          const { person, profile } = personWithProfile
          yield* insertPersonWithDependencies({ person, profile })

          const normalizedResourceData = withNormalizedResourceData({
            personId: person.id,
            sourceData,
          })

          const resourceId = yield* resources.createResource({
            createdById: person.id,
            sourceData: normalizedResourceData,
          })

          const row = yield* resources.findResourceRowById(resourceId)
          if (Option.isNone(row)) return false

          const byHandle = yield* resources.findResourceRowByHandle(Option.getOrThrow(row).handle)
          if (Option.isNone(byHandle)) return false

          const translations = yield* resources.listResourceTranslationRowsByResourceId(resourceId)
          const ptTranslation = translations.find((entry) => entry.locale === "pt")

          return (
            Option.getOrThrow(byHandle).id === resourceId &&
            ptTranslation?.title === normalizedResourceData.locales.pt?.title
          )
        }).pipe(Effect.provide(TestLayerWithRepository)),
      DATABASE_PROPERTY_TEST_CONFIG,
    ),
  )
})
