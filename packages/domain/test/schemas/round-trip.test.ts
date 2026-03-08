/**
 * Schema round-trip property tests.
 *
 * These tests validate that schemas correctly encode and decode values
 * without data loss, ensuring data integrity across the application stack.
 */
import { describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"

import {
  AccountRow,
  OAuthAccountRow,
  SessionRow,
  VerificationRow,
} from "../../src/authentication/domain.js"
import { Handle, TimestampColumn } from "../../src/common/primitives.js"
import { ImageRow } from "../../src/media/domain.js"
import { OrganizationRow } from "../../src/organizations/domain.js"
import { PersonRow } from "../../src/people/domain.js"
import {
  PostCommitRow,
  PostCrdtRow,
  PostRow,
  PostTagRow,
  PostTranslationRow,
  PostVegetableRow,
} from "../../src/posts/domain.js"
import { ProfileRow } from "../../src/profiles/domain.js"
import { SuggestedTagRow, SuggestedTagSourceRow, TagRow } from "../../src/tags/domain.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import { VegetableRow, VegetableTranslationRow } from "../../src/vegetables/domain.js"

const rowSchemas = [
  { name: "AccountRow", schema: AccountRow },
  { name: "PersonRow", schema: PersonRow },
  { name: "ProfileRow", schema: ProfileRow },
  { name: "SessionRow", schema: SessionRow },
  { name: "OAuthAccountRow", schema: OAuthAccountRow },
  { name: "VerificationRow", schema: VerificationRow },
  { name: "ImageRow", schema: ImageRow },
  { name: "OrganizationRow", schema: OrganizationRow },
  { name: "PostRow", schema: PostRow },
  { name: "PostCrdtRow", schema: PostCrdtRow },
  { name: "PostCommitRow", schema: PostCommitRow },
  { name: "PostTranslationRow", schema: PostTranslationRow },
  { name: "PostTagRow", schema: PostTagRow },
  { name: "PostVegetableRow", schema: PostVegetableRow },
  { name: "TagRow", schema: TagRow },
  { name: "SuggestedTagRow", schema: SuggestedTagRow },
  { name: "SuggestedTagSourceRow", schema: SuggestedTagSourceRow },
  { name: "VegetableRow", schema: VegetableRow },
  { name: "VegetableTranslationRow", schema: VegetableTranslationRow },
] as const

describe("Schema Round-Trip Properties", () => {
  describe("Property 1: Schema Round-Trip Preservation", () => {
    // Generate tests for all Row schemas using factory pattern
    for (const { name, schema } of rowSchemas) {
      it.effect(`${name} round-trip preserves data`, () =>
        // Feature: people-profiles-testing-strategy, Property 1: Schema Round-Trip Preservation
        assertPropertyEffect(Schema.toArbitrary(schema), (original) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(schema)(original)
            const decoded = yield* Schema.decodeEffect(schema)(encoded)

            // Use custom deepEquals that handles Uint8Array, DateTime, and other special types
            return deepEquals(original, decoded)
          }),
        ),
      )
    }

    it.effect("Handle validation and transformation round-trip", () =>
      // Feature: people-profiles-testing-strategy, Property 1: Schema Round-Trip Preservation
      assertPropertyEffect(Schema.toArbitrary(Handle), (original) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(Handle)(original)
          const decoded = yield* Schema.decodeEffect(Handle)(encoded)

          // Strings can use direct equality
          return original === decoded
        }),
      ),
    )

    it.effect("TimestampColumn encoding/decoding round-trip", () =>
      // Feature: people-profiles-testing-strategy, Property 1: Schema Round-Trip Preservation
      assertPropertyEffect(Schema.toArbitrary(TimestampColumn), (original) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(TimestampColumn)(original)
          const decoded = yield* Schema.decodeEffect(TimestampColumn)(encoded)

          // Use DateTime.Equivalence for DateTime comparison
          return DateTime.Equivalence(original, decoded)
        }),
      ),
    )
  })

  describe("Property 2: Nullable Fields Preserve Null", () => {
    it.effect("PersonRow nullable fields preserve null values", () =>
      // Feature: people-profiles-testing-strategy, Property 2: Nullable Fields Preserve Null
      assertPropertyEffect(Schema.toArbitrary(PersonRow), (original) =>
        Effect.gen(function* () {
          // Create version with null nullable fields
          const withNulls = PersonRow.makeUnsafe({
            ...original,
            accessSetAt: null,
            accessSetById: null,
          })

          const encoded = yield* Schema.encodeEffect(PersonRow)(withNulls)
          const decoded = yield* Schema.decodeEffect(PersonRow)(encoded)

          return decoded.accessSetAt === null && decoded.accessSetById === null
        }),
      ),
    )

    it.effect("ProfileRow nullable fields preserve null values", () =>
      // Feature: people-profiles-testing-strategy, Property 2: Nullable Fields Preserve Null
      assertPropertyEffect(Schema.toArbitrary(ProfileRow), (original) =>
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
      ),
    )
  })

  describe("Property 4: Nested Schema Composition", () => {
    it.effect("ProfileRow preserves nested TimestampedStruct fields", () =>
      // Feature: people-profiles-testing-strategy, Property 4: Nested Schema Composition
      assertPropertyEffect(Schema.toArbitrary(ProfileRow), (original) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(ProfileRow)(original)
          const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

          // Verify nested timestamp fields are preserved
          const createdAtMatch = DateTime.Equivalence(original.createdAt, decoded.createdAt)
          const updatedAtMatch = DateTime.Equivalence(original.updatedAt, decoded.updatedAt)

          return createdAtMatch && updatedAtMatch
        }),
      ),
    )

    it.effect("ProfileRow preserves all nested schema fields together", () =>
      // Feature: people-profiles-testing-strategy, Property 4: Nested Schema Composition
      assertPropertyEffect(Schema.toArbitrary(ProfileRow), (original) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(ProfileRow)(original)
          const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

          // Use custom deepEquals for structural equality
          return deepEquals(original, decoded)
        }),
      ),
    )
  })
})
