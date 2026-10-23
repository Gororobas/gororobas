import { describe, expect, it } from "@effect/vitest"
import {
  ResolvedExistingWikiArticleExtraction,
  SuggestedWikiArticleExtraction,
  WikiArticleCommonNameInCrdtList,
  type WikiArticleId,
  WikiPlantArticle,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Layer, Option, Record, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { WorkflowEngine } from "effect/workflow"

import { textToRichTextDocument } from "../../test/feature-test-helpers.js"
import { makePersonFixture, makeProfileFixture } from "../../test/fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../../test/test-helpers.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import { resolveWikiArticleExtraction } from "./resolve-extractions.js"

const ResolutionTestLayer = Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make).pipe(
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provideMerge(TestLayer),
)

/** Canonical names in the wiki; extractions name them with regional or differently written forms. */
const CATALOG = ["Mandioca", "Feijão-de-corda", "Abóbora", "Milho"] as const

const plant = (name: string) =>
  WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        commonNames: [
          Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "catalogname1", name }),
        ],
        content: Option.some(textToRichTextDocument(`Sobre ${name}`)),
        origin: Option.none(),
      },
    },
  })

const publishCatalog = Effect.gen(function* () {
  const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
  yield* insertPersonWithDependencies({
    person,
    profile: yield* makeProfileFixture({ id: person.id }),
  })
  const repository = yield* WikiArticlesRepository

  const entries = yield* Effect.forEach(
    CATALOG,
    (name) =>
      Effect.map(
        repository.createWikiArticle(
          { wikiArticle: plant(name), createdById: person.id, status: "PUBLISHED" },
          { enrichment: "skip" },
        ),
        (id) => [name, id] as const,
      ),
    { concurrency: 1 },
  )

  return Record.fromEntries(entries) satisfies Record<string, WikiArticleId>
})

const withoutAccents = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "")

/** Ways people and the model write the same name. */
const SpellingVariant = Schema.Literals(["as-is", "lowercase", "uppercase", "no-accents", "spaced"])

const spell = (name: string, variant: typeof SpellingVariant.Type) =>
  variant === "lowercase"
    ? name.toLowerCase()
    : variant === "uppercase"
      ? name.toUpperCase()
      : variant === "no-accents"
        ? withoutAccents(name)
        : variant === "spaced"
          ? name.replaceAll("-", " ")
          : name

describe("resolveWikiArticleExtraction", () => {
  it.effect(
    "resolves the names the model lists in its attributes, however they're written, over the text it quoted",
    () =>
      Effect.gen(function* () {
        const catalog = yield* publishCatalog

        yield* assertPropertyEffect({
          arbitrary: Arbitrary.schema(
            Schema.Struct({ name: Schema.Literals(CATALOG), variant: SpellingVariant }),
          ),
          predicate: ({ name, variant }) =>
            Effect.gen(function* () {
              // The quoted text is a dish, not the plant: only the attribute names the article.
              const resolved = yield* resolveWikiArticleExtraction({
                extractionClass: "wiki_article",
                extractionText: "pamonha fresquinha",
                attributes: { wiki_article_pt: [spell(name, variant)], wiki_article_en: ["dish"] },
              })

              return (
                Schema.is(ResolvedExistingWikiArticleExtraction)(resolved) &&
                resolved.wikiArticleId === catalog[name]
              )
            }),
        })
      }).pipe(Effect.provide(ResolutionTestLayer)),
  )

  it.effect("suggests unknown names in every language the model provided", () =>
    Effect.gen(function* () {
      yield* publishCatalog

      yield* assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            suffix: Schema.String.check(Schema.isPattern(/^[a-z]{3,10}$/)),
            languages: Schema.Struct({ hasSpanish: Schema.Boolean, hasEnglish: Schema.Boolean }),
          }),
        ),
        predicate: ({ suffix, languages }) =>
          Effect.gen(function* () {
            const pt = `planta inventada ${suffix}`

            const resolved = yield* resolveWikiArticleExtraction({
              extractionClass: "wiki_article",
              extractionText: `zzz ${suffix}`,
              attributes: {
                wiki_article_pt: [pt, "outro nome"],
                ...(languages.hasSpanish
                  ? { wiki_article_es: `planta inventada ${suffix} es` }
                  : {}),
                ...(languages.hasEnglish ? { wiki_article_en: [`made up plant ${suffix}`] } : {}),
              },
            })

            expect(Schema.is(SuggestedWikiArticleExtraction)(resolved)).toBe(true)

            return (
              Schema.is(SuggestedWikiArticleExtraction)(resolved) &&
              resolved.names.pt === pt &&
              resolved.names.es === (languages.hasSpanish ? `${pt} es` : `zzz ${suffix}`) &&
              resolved.names.en ===
                (languages.hasEnglish ? `made up plant ${suffix}` : `zzz ${suffix}`)
            )
          }),
      })
    }).pipe(Effect.provide(ResolutionTestLayer)),
  )
})
