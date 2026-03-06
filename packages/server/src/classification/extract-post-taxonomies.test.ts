import { BunServices } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import type { Locale, TagRow, VegetableId, VegetableRow } from "@gororobas/domain"
import { LoroDocFrontier, TiptapDocument } from "@gororobas/domain"
import { DateTime, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { join } from "node:path"

import { TagsRepository } from "../tags/repository.js"
import { VegetablesRepository } from "../vegetables/repository.js"
import { ExtractPostTaxonomiesService } from "./extract-post-taxonomies.js"
import { LangExtractService } from "./langextract-service.js"

const TEST_FRONTIER = Schema.decodeSync(LoroDocFrontier)([])

const now = Effect.runSync(DateTime.now)

const TEST_TAGS: ReadonlyArray<TagRow> = [
  {
    id: "00000000-0000-0000-0000-000000000001" as TagRow["id"],
    handle: "plantio" as TagRow["handle"],
    names: { pt: "Plantio", es: "Plantación", en: "Planting" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000002" as TagRow["id"],
    handle: "colheita" as TagRow["handle"],
    names: { pt: "Colheita", es: "Cosecha", en: "Harvest" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000003" as TagRow["id"],
    handle: "compostagem" as TagRow["handle"],
    names: { pt: "Compostagem", es: "Compostaje", en: "Composting" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000004" as TagRow["id"],
    handle: "comercializacao" as TagRow["handle"],
    names: {
      pt: "Comercialização",
      es: "Comercialización",
      en: "Commercialization",
    },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000005" as TagRow["id"],
    handle: "permacultura" as TagRow["handle"],
    names: { pt: "Permacultura", es: "Permacultura", en: "Permaculture" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000006" as TagRow["id"],
    handle: "receita" as TagRow["handle"],
    names: { pt: "Receita", es: "Receta", en: "Recipe" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000007" as TagRow["id"],
    handle: "conserva" as TagRow["handle"],
    names: { pt: "Conserva", es: "Conserva", en: "Preserving" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000008" as TagRow["id"],
    handle: "agroecologia" as TagRow["handle"],
    names: { pt: "Agroecologia", es: "Agroecología", en: "Agroecology" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000009" as TagRow["id"],
    handle: "reforma-agraria" as TagRow["handle"],
    names: {
      pt: "Reforma Agrária",
      es: "Reforma Agraria",
      en: "Land Reform",
    },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000000A" as TagRow["id"],
    handle: "irrigacao" as TagRow["handle"],
    names: { pt: "Irrigação", es: "Irrigación", en: "Irrigation" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000000B" as TagRow["id"],
    handle: "manejo" as TagRow["handle"],
    names: { pt: "Manejo", es: "Manejo", en: "Management" },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000000C" as TagRow["id"],
    handle: "soberania-alimentar" as TagRow["handle"],
    names: {
      pt: "Soberania Alimentar",
      es: "Soberanía Alimentaria",
      en: "Food Sovereignty",
    },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000000D" as TagRow["id"],
    handle: "agricultura-urbana" as TagRow["handle"],
    names: {
      pt: "Agricultura Urbana",
      es: "Agricultura Urbana",
      en: "Urban Agriculture",
    },
    createdAt: now,
    updatedAt: now,
    cluster: null,
    createdById: null,
    description: null,
  },
]

const TestTagsRepository = Layer.succeed(TagsRepository)({
  findAll: () => Effect.succeed(TEST_TAGS as Array<TagRow>),
  findById: () => Effect.succeed(Option.none()),
  findByHandle: (handle: string) =>
    Effect.succeed(Option.fromNullishOr(TEST_TAGS.find((t) => t.handle === handle))),
  findByName: (pattern: string) => {
    const searchTerm = pattern.replace(/%/g, "").toLowerCase()
    const match = TEST_TAGS.find((t) =>
      Object.values(t.names).some((name) => name && name.toLowerCase().includes(searchTerm)),
    )
    return Effect.succeed(match ? Option.some(match) : Option.none())
  },
})

const TEST_VEGETABLES: ReadonlyArray<VegetableRow> = [
  {
    id: "10000000-0000-0000-0000-000000000001" as VegetableRow["id"],
    handle: "milho",
    developmentCycleMax: 120,
    developmentCycleMin: 90,
    heightMax: 300,
    heightMin: 150,
    mainPhotoId: null,
    scientificNames: "Zea mays",
    temperatureMax: 35,
    temperatureMin: 15,
  },
  {
    id: "10000000-0000-0000-0000-000000000002" as VegetableRow["id"],
    handle: "mandioca",
    developmentCycleMax: 365,
    developmentCycleMin: 180,
    heightMax: 300,
    heightMin: 100,
    mainPhotoId: null,
    scientificNames: "Manihot esculenta",
    temperatureMax: 35,
    temperatureMin: 20,
  },
]

const TEST_VEGETABLE_SEARCHABLE_NAMES: Record<
  string,
  { vegetableId: VegetableId; handle: string }
> = {
  milho: { vegetableId: "10000000-0000-0000-0000-000000000001" as VegetableId, handle: "milho" },
  corn: { vegetableId: "10000000-0000-0000-0000-000000000001" as VegetableId, handle: "milho" },
  maiz: { vegetableId: "10000000-0000-0000-0000-000000000001" as VegetableId, handle: "milho" },
  mandioca: {
    vegetableId: "10000000-0000-0000-0000-000000000002" as VegetableId,
    handle: "mandioca",
  },
  cassava: {
    vegetableId: "10000000-0000-0000-0000-000000000002" as VegetableId,
    handle: "mandioca",
  },
  yuca: { vegetableId: "10000000-0000-0000-0000-000000000002" as VegetableId, handle: "mandioca" },
  aipim: { vegetableId: "10000000-0000-0000-0000-000000000002" as VegetableId, handle: "mandioca" },
  macaxeira: {
    vegetableId: "10000000-0000-0000-0000-000000000002" as VegetableId,
    handle: "mandioca",
  },
}

const TestVegetablesRepository = Layer.succeed(VegetablesRepository)({
  findById: () => Effect.succeed(Option.none()),
  findByHandle: (handle: string) =>
    Effect.succeed(Option.fromNullishOr(TEST_VEGETABLES.find((v) => v.handle === handle))),
  findAll: () => Effect.succeed([...TEST_VEGETABLES]),
  findBySearchableName: (pattern: string) => {
    const searchTerm = pattern.replace(/%/g, "").toLowerCase()
    const match = TEST_VEGETABLE_SEARCHABLE_NAMES[searchTerm]
    return Effect.succeed(match ? Option.some(match) : Option.none())
  },
  findTranslations: () => Effect.succeed([]),
})

const RESULTS_DIR = join(import.meta.dirname, "extraction-results")

const saveExtractionResult = (
  name: string,
  input: TiptapDocument,
  result: { vegetables: unknown; tags: unknown },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(RESULTS_DIR, { recursive: true })

    const filename = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    yield* fs.writeFileString(
      path.join(RESULTS_DIR, `${filename}.json`),
      JSON.stringify({ input, output: result }, null, 2),
    )
  })

const makeDocument = (text: string): TiptapDocument =>
  TiptapDocument.makeUnsafe({
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  })

interface ExtractionFixture {
  locale: Locale
  document: TiptapDocument
}

const FIXTURES: Record<string, ExtractionFixture> = {
  "pt: planting journal": {
    locale: "pt",
    document: makeDocument(
      "Hoje plantamos mandioca e batata-doce na agrofloresta. Usamos cobertura morta com folhas de bananeira para proteger o solo.",
    ),
  },
  "pt: harvest planning": {
    locale: "pt",
    document: makeDocument(
      "Planejamento da colheita de inverno: precisamos colher a abóbora e o milho até maio. Preparar canteiros para o plantio de alface e couve em junho. Verificar sistema de irrigação por gotejamento.",
    ),
  },
  "pt: cooking with harvest": {
    locale: "pt",
    document: makeDocument(
      "Receita de conserva de pimenta da horta comunitária. Ingredientes: pimenta dedo-de-moça, alho, cebola, vinagre e sal. Ferver os vidros para esterilizar antes de envasar.",
    ),
  },
  "pt: land access politics": {
    locale: "pt",
    document: makeDocument(
      "Assembleia do acampamento discutiu a ocupação do latifúndio improdutivo na região. A luta pela reforma agrária e soberania alimentar continua. Precisamos organizar mutirão de plantio na área conquistada.",
    ),
  },

  "es: planting and composting": {
    locale: "es",
    document: makeDocument(
      "Hoy sembramos yuca y calabaza en la milpa. Aplicamos compostaje con restos de cocina y hojas secas. El sistema de policultivo está funcionando muy bien este ciclo.",
    ),
  },
  "es: seasonal planning": {
    locale: "es",
    document: makeDocument(
      "Plan de siembra para la temporada de lluvias: preparar semilleros de tomate, chile y cebolla. Revisar las camas de cultivo y aplicar abono verde antes de trasplantar.",
    ),
  },
  "es: traditional cooking": {
    locale: "es",
    document: makeDocument(
      "Preparamos tamales con maíz de la cosecha y frijoles negros del huerto. También hicimos salsa con tomate, chile serrano y cilantro frescos de la parcela.",
    ),
  },
  "es: land sovereignty": {
    locale: "es",
    document: makeDocument(
      "La asamblea comunitaria aprobó el plan de defensa del territorio contra el monocultivo de soja. Se acordó fortalecer la soberanía alimentaria con ferias agroecológicas y bancos de semillas criollas.",
    ),
  },

  "en: polyculture planting": {
    locale: "en",
    document: makeDocument(
      "Planted cassava, sweet potato and squash as a polyculture guild in the food forest. Applied thick mulch layer with banana leaves and wood chips to retain moisture.",
    ),
  },
  "en: garden planning": {
    locale: "en",
    document: makeDocument(
      "Spring garden plan: start tomato and pepper seedlings indoors. Direct sow beans and corn after last frost. Set up drip irrigation and prepare compost tea for transplanting week.",
    ),
  },
  "en: preserving the harvest": {
    locale: "en",
    document: makeDocument(
      "Made hot sauce with cayenne peppers, garlic and onions from the community garden. Also canned pickled beets and fermented cabbage into sauerkraut for the winter pantry.",
    ),
  },
  "en: community land access": {
    locale: "en",
    document: makeDocument(
      "Community meeting discussed the proposal for converting the abandoned lot into an urban farm. We need to address land tenure, negotiate with the municipality, and organize volunteer planting days to demonstrate productive use.",
    ),
  },
}

const TestLayer = Layer.mergeAll(
  Layer.effect(ExtractPostTaxonomiesService, ExtractPostTaxonomiesService.make),
  Layer.effect(LangExtractService, LangExtractService.make),
  TestTagsRepository,
  TestVegetablesRepository,
  BunServices.layer,
)

describe(
  "note taxonomy extraction (manual QA — requires Ollama running)",
  { timeout: 180_000, sequential: true },
  () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      it.effect.skip(name, () =>
        Effect.gen(function* () {
          const service = yield* ExtractPostTaxonomiesService
          const result = yield* service.extract(fixture.document, TEST_FRONTIER)

          yield* saveExtractionResult(name, fixture.document, result)

          expect(result.vegetables).toBeDefined()
          expect(result.vegetables.length).toBeGreaterThanOrEqual(0)

          expect(result.tags).toBeDefined()

          yield* Effect.log(`[${name}]`, {
            vegetableExtractions: result.vegetables,
            tagExtractions: result.tags,
          })
        }).pipe(Effect.provide(TestLayer)),
      )
    }
  },
)
