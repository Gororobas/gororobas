/**
 * Tests repository layer methods for tags, including:
 * - Query methods (findById, findByHandle, findByName, findAll)
 * - Property-based tests for SQL round-trip invariants
 */
import { describe, expect, it } from "@effect/vitest"
import { Handle, IdGen, TagRow } from "@gororobas/domain"
import { assertPropertyEffect, deepEquals } from "@gororobas/domain/testing"
import { Effect, Layer, Option, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { v7 } from "uuid"

import { AppSqlTest } from "../../src/sql.js"
import { TagsRepository } from "../../src/tags/repository.js"
import { DATABASE_PROPERTY_TEST_CONFIG } from "../test-helpers.js"

const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

const TestLayer = Layer.mergeAll(IdGenTest, Layer.effect(TagsRepository, TagsRepository.make)).pipe(
  Layer.provideMerge(AppSqlTest),
)

const tagRowArbitrary = Schema.toArbitrary(TagRow).map((tag) => ({
  ...tag,
  cluster: null,
  createdById: null,
  description: null,
  names: {
    en: `name-${tag.handle}`,
    es: `nombre-${tag.handle}`,
    pt: `nome-${tag.handle}`,
  },
}))

const uniqueTagRowsArbitrary = FastCheck.array(tagRowArbitrary, {
  minLength: 1,
  maxLength: 10,
}).filter(
  (tags) =>
    new Set(tags.map((tag) => tag.id)).size === tags.length &&
    new Set(tags.map((tag) => tag.handle)).size === tags.length,
)

describe("TagsRepository", () => {
  describe("findById", () => {
    it.effect("preserves data through SQL round-trip", () =>
      assertPropertyEffect(
        tagRowArbitrary,
        (tag) =>
          Effect.gen(function* () {
            const repo = yield* TagsRepository
            yield* repo.insertRow(tag)

            const result = yield* repo.findById(tag.id)
            if (Option.isNone(result)) return false

            return deepEquals(Option.getOrThrow(result), tag)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("findByHandle", () => {
    it.effect("returns persisted tag for arbitrary valid handles", () =>
      assertPropertyEffect(
        tagRowArbitrary,
        (tag) =>
          Effect.gen(function* () {
            const repo = yield* TagsRepository
            yield* repo.insertRow(tag)

            const result = yield* repo.findByHandle(tag.handle)
            if (Option.isNone(result)) return false

            return deepEquals(Option.getOrThrow(result), tag)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("returns None when handle does not exist", () =>
      assertPropertyEffect(
        Schema.toArbitrary(Handle),
        (handle) =>
          Effect.gen(function* () {
            const repo = yield* TagsRepository
            const result = yield* repo.findByHandle(handle)
            return Option.isNone(result)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("findAll", () => {
    it.effect("returns tags ordered by handle", () =>
      assertPropertyEffect(
        uniqueTagRowsArbitrary,
        (tags) =>
          Effect.gen(function* () {
            const repo = yield* TagsRepository
            yield* Effect.forEach(tags, (tag) => repo.insertRow(tag), { concurrency: "unbounded" })

            const persisted = yield* repo.findAll()
            const expectedHandles = tags
              .map((tag) => tag.handle)
              .slice()
              .sort()

            return (
              persisted.length === tags.length &&
              deepEquals(
                persisted.map((tag) => tag.handle),
                expectedHandles,
              )
            )
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("findByName", () => {
    it.effect("returns matching tag id and handle for arbitrary names", () =>
      assertPropertyEffect(
        tagRowArbitrary,
        (tag) =>
          Effect.gen(function* () {
            const repo = yield* TagsRepository
            yield* repo.insertRow(tag)

            const pattern = `%${tag.names.pt.toLowerCase()}%`
            const result = yield* repo.findByName(pattern)

            if (Option.isNone(result)) return false
            const found = Option.getOrThrow(result)
            return found.id === tag.id && found.handle === tag.handle
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("returns None when no tag name matches the pattern", () =>
      Effect.gen(function* () {
        const repo = yield* TagsRepository
        const result = yield* repo.findByName("%non-existent-tag-name%")
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
