import { describe, it } from "@effect/vitest"
import { languageFallbackOrder, SupportedLanguage } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

import { orderByLanguagePreference } from "../src/db/language-preference.js"
import { TestLayer } from "./test-helpers.js"

const sortByLanguagePreference = SqlSchema.findAll({
  Request: Schema.Struct({
    requested: SupportedLanguage,
    available: Schema.Array(SupportedLanguage),
  }),
  Result: Schema.Struct({ language: SupportedLanguage }),
  execute: ({ requested, available }) =>
    SqlClient.use((sql) => {
      const translations = sql.join(
        " UNION ALL ",
        false,
      )(available.map((language) => sql`SELECT ${language} AS language`))
      return sql`
        SELECT language FROM (${translations}) AS translation
        ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "translation.language", language: requested })}
      `
    }),
})

describe("language preference", () => {
  it.layer(TestLayer)((it) => {
    it.effect("SQL sorts any set of translations the way languageFallbackOrder does", () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.all({
          requested: Arbitrary.schema(SupportedLanguage),
          available: Arbitrary.schema(Schema.Array(SupportedLanguage).check(Schema.isMinLength(1))),
        }),
        predicate: ({ requested, available }) =>
          Effect.gen(function* () {
            const rows = yield* sortByLanguagePreference({ requested, available })
            const expected = languageFallbackOrder(requested).flatMap((language) =>
              available.filter((candidate) => candidate === language),
            )
            return rows.map((row) => row.language).join() === expected.join()
          }),
      }),
    )
  })
})
