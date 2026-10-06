/**
 * Schema round-trip property tests.
 *
 * These tests validate that schemas correctly encode and decode values
 * without data loss, ensuring data integrity across the application stack.
 */
import { describe, it } from "@effect/vitest"
import {
  WikiArticleEditableData,
  WikiArticleEditableTranslation,
  WikiArticleTranslationMaterializedRow,
} from "@gororobas/domain"
import { DateTime, Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { AuthenticationSession } from "../../src/authentication/auth-contract.js"
import { AccountRow } from "../../src/authentication/domain.js"
import { Handle, TimestampColumn } from "../../src/common/primitives.js"
import { MediaAssetRow } from "../../src/media-assets/domain.js"
import { OrganizationRow } from "../../src/organizations/domain.js"
import { PersonRow } from "../../src/people/domain.js"
import { ProfileRow } from "../../src/profiles/domain.js"
import {
  PublicationCommitRow,
  PublicationCrdtRow,
  PublicationRow,
  PublicationTagRow,
  PublicationTranslationRow,
} from "../../src/publications/domain.js"
import { SuggestedTagRow, SuggestedTagSourceRow, TagRow } from "../../src/tags/domain.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import {
  WikiArticleCrdtRow,
  WikiArticleHandleMaterializedRow,
  WikiArticleMaterializedRow,
  WikiArticleRevisionRow,
} from "../../src/wiki/wiki-article.js"

const rowSchemas = [
  { name: "AccountRow", schema: AccountRow },
  { name: "MediaAssetRow", schema: MediaAssetRow },
  { name: "OrganizationRow", schema: OrganizationRow },
  { name: "PersonRow", schema: PersonRow },
  { name: "ProfileRow", schema: ProfileRow },
  { name: "PublicationCommitRow", schema: PublicationCommitRow },
  { name: "PublicationCrdtRow", schema: PublicationCrdtRow },
  { name: "PublicationRow", schema: PublicationRow },
  { name: "PublicationTagRow", schema: PublicationTagRow },
  { name: "PublicationTranslationRow", schema: PublicationTranslationRow },
  { name: "AuthenticationSession", schema: AuthenticationSession },
  { name: "SuggestedTagRow", schema: SuggestedTagRow },
  { name: "SuggestedTagSourceRow", schema: SuggestedTagSourceRow },
  { name: "TagRow", schema: TagRow },
  { name: "WikiArticleCrdtRow", schema: WikiArticleCrdtRow },
  { name: "WikiArticleHandleRow", schema: WikiArticleHandleMaterializedRow },
  { name: "WikiArticleMaterializedRow", schema: WikiArticleMaterializedRow },
  { name: "WikiArticleRevisionRow", schema: WikiArticleRevisionRow },
  { name: "WikiArticleTranslationMaterializedRow", schema: WikiArticleTranslationMaterializedRow },
  { name: "WikiArticleEditableTranslation", schema: WikiArticleEditableTranslation },
  { name: "WikiArticleEditableData", schema: WikiArticleEditableData },
] as const

describe("Schema Round-Trip Properties", () => {
  describe("Property 1: Schema Round-Trip Preservation", () => {
    rowSchemas.forEach(({ name, schema }) => {
      it.effect(`${name} round-trip preserves data`, () =>
        assertPropertyEffect({
          arbitrary: Arbitrary.schema(schema),
          predicate: (original) =>
            Effect.gen(function* () {
              const encoded = yield* Schema.encodeEffect(schema)(original)
              const decoded = yield* Schema.decodeEffect(schema)(encoded)

              return deepEquals(original, decoded)
            }),
        }),
      )
    })

    it.effect("MediaAssetRow rejects a mismatched format and metadata", () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(MediaAssetRow),
        predicate: (row) =>
          Effect.sync(
            () =>
              !Schema.is(Schema.toType(MediaAssetRow))({
                ...row,
                format: row.format === "IMAGE" ? "AUDIO" : "IMAGE",
              }),
          ),
      }),
    )

    it.effect("Handle validation and transformation round-trip", () =>
      // Feature: people-profiles-testing-strategy, Property 1: Schema Round-Trip Preservation
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(Handle),
        predicate: (original) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(Handle)(original)
            const decoded = yield* Schema.decodeEffect(Handle)(encoded)

            // Strings can use direct equality
            return original === decoded
          }),
      }),
    )

    it.effect("TimestampColumn encoding/decoding round-trip", () =>
      // Feature: people-profiles-testing-strategy, Property 1: Schema Round-Trip Preservation
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(TimestampColumn),
        predicate: (original) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(TimestampColumn)(original)
            const decoded = yield* Schema.decodeEffect(TimestampColumn)(encoded)

            // Use DateTime.Equivalence for DateTime comparison
            return DateTime.Equivalence(original, decoded)
          }),
      }),
    )
  })

  describe("Property 2: Nullable Fields Preserve Null", () => {
    it.effect("PersonRow nullable fields preserve null values", () =>
      // Feature: people-profiles-testing-strategy, Property 2: Nullable Fields Preserve Null
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(PersonRow),
        predicate: (original) =>
          Effect.gen(function* () {
            // Create version with null nullable fields
            const withNulls = PersonRow.make({
              ...original,
              accessSetAt: null,
              accessSetById: null,
            })

            const encoded = yield* Schema.encodeEffect(PersonRow)(withNulls)
            const decoded = yield* Schema.decodeEffect(PersonRow)(encoded)

            return decoded.accessSetAt === null && decoded.accessSetById === null
          }),
      }),
    )

    it.effect("ProfileRow nullable fields preserve null values", () =>
      // Feature: people-profiles-testing-strategy, Property 2: Nullable Fields Preserve Null
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(ProfileRow),
        predicate: (original) =>
          Effect.gen(function* () {
            // Create version with null nullable fields
            const withNulls = {
              ...original,
              bio: null,
              location: null,
              photoId: null,
            }

            const encoded = yield* Schema.encodeEffect(ProfileRow)(withNulls)
            const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

            return decoded.bio === null && decoded.location === null && decoded.photoId === null
          }),
      }),
    )
  })

  describe("Property 4: Nested Schema Composition", () => {
    it.effect("ProfileRow preserves nested TimestampedStruct fields", () =>
      // Feature: people-profiles-testing-strategy, Property 4: Nested Schema Composition
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(ProfileRow),
        predicate: (original) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(ProfileRow)(original)
            const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

            // Verify nested timestamp fields are preserved
            const createdAtMatch = DateTime.Equivalence(original.createdAt, decoded.createdAt)
            const updatedAtMatch = DateTime.Equivalence(original.updatedAt, decoded.updatedAt)

            return createdAtMatch && updatedAtMatch
          }),
      }),
    )

    it.effect("ProfileRow preserves all nested schema fields together", () =>
      // Feature: people-profiles-testing-strategy, Property 4: Nested Schema Composition
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(ProfileRow),
        predicate: (original) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(ProfileRow)(original)
            const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

            // Use custom deepEquals for structural equality
            return deepEquals(original, decoded)
          }),
      }),
    )
  })
})
