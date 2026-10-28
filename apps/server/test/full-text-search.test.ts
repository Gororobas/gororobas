import { describe, expect, it } from "@effect/vitest"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { editDistance, fullTextQueryTerms, rankBySimilarity } from "../src/db/full-text-search.js"
import { ProfilesRepository } from "../src/profiles/repository.js"
import { makePersonFixture, makeProfileFixture } from "./fixtures.js"
import {
  DATABASE_PROPERTY_TEST_CONFIG,
  insertPersonWithDependencies,
  TestLayer,
} from "./test-helpers.js"

describe("full-text search", () => {
  it.effect("queries only hold letters and digits, so they can be inlined in SQL", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.String),
      predicate: (text) =>
        Effect.succeed(
          fullTextQueryTerms(text).every((term) => /^[\p{L}\p{N}]{3,}$/u.test(term)) &&
            fullTextQueryTerms(text).length <= 12,
        ),
    }),
  )

  it.effect("edit distance is a symmetric count of edits, where swapping neighbors is one", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.all({
        word: Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[a-z]{2,12}$/))),
        other: Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[a-z]{0,12}$/))),
        at: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 }))),
      }),
      predicate: ({ word, other, at }) => {
        const index = Math.min(at, word.length - 2)
        const swapped = `${word.slice(0, index)}${word[index + 1]}${word[index]}${word.slice(index + 2)}`

        return Effect.succeed(
          editDistance(word, word) === 0 &&
            editDistance(word, other) === editDistance(other, word) &&
            editDistance(word, other) <= Math.max(word.length, other.length) &&
            editDistance(word, swapped) === (swapped === word ? 0 : 1),
        )
      },
    }),
  )

  it("tolerates typos in every term, ranking closer candidates first", () => {
    const rank = (text: string) =>
      rankBySimilarity({
        text,
        candidates: ["pitomba", "tomate", "tomate cereja", "batata doce"],
        words: (candidate) => candidate,
      })

    expect(rank("tomte")).toEqual(["tomate", "tomate cereja"])
    expect(rank("tomte cerja")).toEqual(["tomate cereja"])
    expect(rank("batata dose")).toEqual(["batata doce"])
    expect(rank("xyzw")).toEqual([])
  })

  it.effect("finds a profile by any part of its name, whatever its case and accents", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.all({
        // Latin letters without "ß", which uppercases to "SS"
        name: Arbitrary.schema(
          Schema.String.check(Schema.isPattern(/^[A-Za-zÀ-ÖØ-Þà-öø-ÿ]{3,16}$/u)),
        ),
        start: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 13 }))),
        uppercase: Arbitrary.schema(Schema.Boolean),
      }),
      predicate: ({ name, start, uppercase }) =>
        Effect.gen(function* () {
          const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
          const profile = yield* makeProfileFixture({ id: person.id, name })
          yield* insertPersonWithDependencies({ person, profile })

          const from = Math.min(start, name.length - 3)
          const part = name.slice(from, from + 3)

          const profiles = yield* ProfilesRepository.use((repository) =>
            repository.searchProfiles({
              text: uppercase ? part.toUpperCase() : part.toLowerCase(),
            }),
          )

          return profiles.some(({ id }) => id === profile.id)
        }).pipe(Effect.provide(TestLayer)),
      options: DATABASE_PROPERTY_TEST_CONFIG,
    }),
  )

  it.effect("matches words, not trigrams scattered through a text", () =>
    Effect.gen(function* () {
      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      // Holds every trigram of "bananna": ban, ana, nan, ann and nna
      const profile = yield* makeProfileFixture({ id: person.id, name: "Ana Banco Nanna" })
      yield* insertPersonWithDependencies({ person, profile })

      expect(
        yield* ProfilesRepository.use((repository) =>
          repository.searchProfiles({ text: "bananna" }),
        ),
      ).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("keeps profile search current as names change", () =>
    Effect.gen(function* () {
      const repository = yield* ProfilesRepository
      const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
      const profile = yield* makeProfileFixture({ id: person.id, name: "João Semente" })
      yield* insertPersonWithDependencies({ person, profile })

      expect((yield* repository.searchProfiles({ text: "joao" })).map(({ id }) => id)).toEqual([
        profile.id,
      ])

      yield* repository.updateProfileRow({
        id: profile.id,
        name: "Maria Semente",
        updatedAt: profile.updatedAt,
      })

      expect(yield* repository.searchProfiles({ text: "joao" })).toEqual([])
      expect((yield* repository.searchProfiles({ text: "mraia" })).map(({ id }) => id)).toEqual([
        profile.id,
      ])
      expect((yield* repository.searchProfiles({ text: "maria" })).map(({ id }) => id)).toEqual([
        profile.id,
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})
