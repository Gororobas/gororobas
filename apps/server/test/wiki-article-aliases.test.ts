import { expect, it } from "@effect/vitest"
import { WikiArticleEditableData, WikiPlantCultivarArticle } from "@gororobas/domain"
import { Effect, Layer, Schema } from "effect"
import { WorkflowEngine } from "effect/workflow"

import { listWikiArticleAliases } from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { seedPerson, TestLayer } from "./test-helpers.js"

it.effect("indexes cultivar scientific names without indexing their authored state labels", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make

    const create = (article: WikiArticleEditableData) =>
      repository.createWikiArticle(
        { wikiArticle: article, createdById: person.id, status: "PUBLISHED" },
        { enrichment: "skip" },
      )

    const translations = {
      pt: { commonNames: [{ id: "testname0001", name: "Milho" }] },
    } as const

    const parentPlantId = yield* create(
      yield* Schema.decodeEffect(WikiArticleEditableData)({
        kind: "PLANT",
        attributes: { scientificNames: [{ id: "sciencename1", value: "Zea mays" }] },
        translations,
      }),
    )

    const states = [
      { _tag: "Unknown" },
      { _tag: "Inherit" },
      { _tag: "Value", value: ["Zea mays var. rugosa", "Zea saccharata"] },
    ] as const

    const cultivarIds = yield* Effect.forEach(
      states,
      (scientificNames) =>
        create(
          WikiPlantCultivarArticle.EditableArticle.make({
            kind: "PLANT_CULTIVAR",
            attributes: WikiPlantCultivarArticle.EditableAttributes.make({
              parentPlantId,
              scientificNames,
            }),
            translations: {
              pt: Schema.decodeSync(WikiPlantCultivarArticle.EditableTranslation)(translations.pt),
            },
          }),
        ),
      { concurrency: 1 },
    )

    const aliases = yield* listWikiArticleAliases()
    const namesOf = (id: (typeof cultivarIds)[number]) =>
      aliases.filter((alias) => alias.wikiArticleId === id).map((alias) => alias.alias)

    expect(namesOf(parentPlantId)).toContain("Zea mays")

    cultivarIds.forEach((id, index) => {
      const names = namesOf(id)
      expect(names.some((name) => ["Unknown", "Inherit", "Value"].includes(name))).toBe(false)
      expect(names.filter((name) => name.startsWith("Zea"))).toEqual(
        index === 2 ? expect.arrayContaining([...states[2].value]) : [],
      )
    })
  }).pipe(Effect.provide(Layer.mergeAll(WorkflowEngine.layerMemory, TestLayer))),
)
