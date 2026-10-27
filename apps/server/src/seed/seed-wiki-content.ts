/**
 * Turns schema-generated wiki articles into legible ones.
 *
 * Arbitraries derived from each kind's schema decide which attributes are present and the
 * values of enums and sets, so new kinds and attributes are seeded automatically. This
 * module rewrites the free-text and referential parts of the JSON encoding, then the
 * caller decodes it back through the domain codec, which re-validates the result.
 */
import {
  SupportedLanguage,
  TiptapDocument,
  type WikiArticleId,
  type WikiArticleKind,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Predicate, Random, Record, Schema } from "effect"

import { richTextDocument, type Reference } from "./rich-text.js"
import { chance, digits, nanoId, pick } from "./seed-random.js"
import {
  AREAS_OF_WORK,
  BIOMES,
  CULTIVAR_QUALIFIERS,
  FILM_GENRES,
  FIRST_NAMES,
  PLACES,
  PLANTS,
  PUBLISHERS,
  SURNAMES,
  WIKI_NAMES,
  type CatalogPlant,
  type Localized,
} from "./vocabulary.js"

type Json = Schema.Json

const isJsonObject = (value: Json): value is Schema.JsonObject => Predicate.isObject(value)

const isJsonArray = (value: Json): value is Schema.JsonArray => Array.isArray(value)

/** The `attributes` of a JSON-encoded wiki article. */
export const encodedAttributes = (article: Json): Json =>
  isJsonObject(article) ? (article.attributes ?? null) : null

const ANIMAL_SCIENTIFIC_NAMES = [
  "Gallus gallus domesticus",
  "Tetragonisca angustula",
  "Melipona quadrifasciata",
  "Eisenia fetida",
  "Capra hircus",
] as const

const personName = Effect.gen(function* () {
  return `${yield* pick(FIRST_NAMES)} ${yield* pick(SURNAMES)}`
})

const partialDate = Effect.gen(function* () {
  const year = yield* Random.nextIntBetween(1965, 2025)
  if (yield* chance(0.5)) return `${year}[UTC]`
  return `${year}-${String(yield* Random.nextIntBetween(1, 12)).padStart(2, "0")}[UTC]`
})

/** Who an article is about decides the legible values of its CRDT name lists. */
interface ArticleSubject {
  readonly kind: WikiArticleKind
  readonly plant: CatalogPlant | undefined
  readonly cultivarQualifier: string | undefined
  /** Names already carrying a biome don't get a biome-qualified alias. */
  readonly hasBiome: boolean
}

interface AttributeContext {
  readonly subject: ArticleSubject
  readonly parentPlantId: WikiArticleId | undefined
  /** The first article of each kind always carries external identifiers; see `seedArticle`. */
  readonly isRepresentative: boolean
}

const isKeyOf = <T extends object>(table: T, key: PropertyKey): key is keyof T => key in table

/** Looks up attribute-specific generators by an attribute name decoded from JSON. */
const lookup = <T extends object>(table: T, key: string): Option.Option<T[keyof T]> =>
  isKeyOf(table, key) ? Option.some(table[key]) : Option.none()

/** Values of `{ id, value }` CRDT list items, by attribute; people's names otherwise. */
const nameListValue = (key: string, subject: ArticleSubject): Effect.Effect<string> =>
  lookup(
    {
      scientificNames: subject.plant
        ? Effect.succeed(subject.plant.scientificName)
        : pick(ANIMAL_SCIENTIFIC_NAMES),
      genres: pick(FILM_GENRES),
      areasOfWork: pick(AREAS_OF_WORK),
      languages: pick(["Português", "Español", "English"] as const),
    },
    key,
  ).pipe(Option.getOrElse(() => personName))

/** `[low, high, spread]`: minimums fall in `[low, high]`, maximums up to `spread` above. */
const RANGES = {
  height: [20, 400, 1500],
  temperature: [4, 20, 18],
  developmentCycle: [30, 200, 400],
} satisfies Record<string, readonly [number, number, number]>

const realisticRange = (measurement: keyof typeof RANGES) =>
  Effect.gen(function* () {
    const [low, high, spread] = RANGES[measurement]
    const min = yield* Random.nextIntBetween(low, high)
    return { min, max: min + (yield* Random.nextIntBetween(0, spread)) }
  })

/** Attributes rewritten whenever present, regardless of their generated value. */
const scalarAttribute = (
  key: string,
  context: AttributeContext,
): Option.Option<Effect.Effect<Json>> =>
  lookup(
    {
      parentPlantId: Effect.succeed<Json>(context.parentPlantId ?? null),
      url: Effect.map(nanoId, (id): Json => `https://example.org/gororobas/${id}`),
      publisher: pick(PUBLISHERS),
      edition: Effect.map(Random.nextIntBetween(1, 5), (edition): Json => `${edition}ª edição`),
      language: pick(["pt-BR", "es", "en"] as const),
      country: pick(["Brasil", "Peru", "Uruguai", "Colômbia"] as const),
      creditLine: personName,
      location: pick(PLACES),
      suggestedKind: pick(["Receita", "Técnica", "Evento"] as const),
      isbn10: digits(10),
      isbn13: Effect.map(digits(10), (rest): Json => `978${rest}`),
      pageCount: Random.nextIntBetween(80, 600),
      publicationDate: partialDate,
      releaseDate: partialDate,
      foundedDate: partialDate,
      dissolvedDate: Effect.flatMap(chance(0.2), (dissolved) =>
        dissolved ? partialDate : Effect.succeed(null),
      ),
    } satisfies Record<string, Effect.Effect<Json>>,
    key,
  )

const legibleAttribute = (input: {
  key: string
  value: Json
  context: AttributeContext
}): Effect.Effect<Json> =>
  Effect.gen(function* () {
    const { key, value, context } = input

    // External identifiers are forced on most articles, so seeded data exercises enrichment.
    if (key === "wikidataId") {
      return context.isRepresentative || (yield* chance(0.75))
        ? `Q${yield* Random.nextIntBetween(1000, 9_999_999)}`
        : null
    }

    if (key === "googleBooksVolumeId") {
      return context.isRepresentative || (yield* chance(0.7)) ? yield* nanoId : null
    }
    if (value === null) return null

    const scalar = scalarAttribute(key, context)
    if (Option.isSome(scalar)) return yield* scalar.value

    if (isJsonArray(value)) {
      return yield* Effect.forEach(
        value,
        (item) =>
          isJsonObject(item) && "id" in item
            ? Effect.gen(function* () {
                return {
                  id: yield* nanoId,
                  value: yield* nameListValue(key, context.subject),
                }
              })
            : Effect.succeed(item),
        { concurrency: 1 },
      )
    }

    // Cultivar properties are tagged unions; only a known value needs rewriting.
    if (isJsonObject(value) && Predicate.isTagged(value, "Value")) {
      if (isKeyOf(RANGES, key)) return { _tag: "Value", value: yield* realisticRange(key) }

      if (key === "scientificNames" && context.subject.plant) {
        const qualifier = context.subject.cultivarQualifier
        const name = context.subject.plant.scientificName
        return { _tag: "Value", value: [qualifier ? `${name} '${qualifier}'` : name] }
      }
    }

    return value
  })

/** Plants store `fooMin`/`fooMax` as independent attributes; keep present pairs ordered. */
const realisticPlantMeasurements = (attributes: Schema.JsonObject) =>
  Effect.reduce(
    Record.keys(RANGES),
    () => attributes,
    (result, measurement): Effect.Effect<Schema.JsonObject> =>
      Effect.map(realisticRange(measurement), (range) =>
        Record.map(result, (value, key): Json => {
          if (value === null) return value
          if (key === `${measurement}Min`) return range.min
          if (key === `${measurement}Max`) return range.max
          return value
        }),
      ),
  )

export const legibleAttributes = (attributes: Json, context: AttributeContext) =>
  Effect.gen(function* () {
    if (!isJsonObject(attributes)) return attributes

    const rewritten = Record.fromEntries(
      yield* Effect.forEach(
        Record.toEntries(attributes),
        ([key, value]) =>
          Effect.map(
            legibleAttribute({ key, value, context }),
            (legible) => [key, legible] as const,
          ),
        { concurrency: 1 },
      ),
    )

    return context.subject.kind === "PLANT"
      ? yield* realisticPlantMeasurements(rewritten)
      : rewritten
  })

/** Names in every language for the `index`-th article of a kind, unique within a scale. */
export const articleNames = (input: {
  kind: WikiArticleKind
  index: number
  parent: { readonly plant: CatalogPlant; readonly names: Localized } | undefined
}) => {
  const { kind, index, parent } = input

  if (kind === "PLANT_CULTIVAR") {
    const plant = parent?.plant ?? PLANTS[index % PLANTS.length] ?? PLANTS[0]
    const base = parent?.names ?? plant.names
    const qualifier =
      CULTIVAR_QUALIFIERS[index % CULTIVAR_QUALIFIERS.length] ?? CULTIVAR_QUALIFIERS[0]

    return {
      names: {
        pt: `${base.pt} ${qualifier.pt[plant.gender]}`,
        en: `${qualifier.en} ${base.en}`,
        es: `${base.es} ${qualifier.es}`,
      } satisfies Localized,
      subject: {
        kind,
        plant,
        cultivarQualifier: qualifier.en,
        hasBiome: base.pt !== plant.names.pt,
      } satisfies ArticleSubject,
    }
  }

  const catalog: EffectArray.NonEmptyReadonlyArray<{
    readonly names: Localized
    readonly plant?: CatalogPlant
  }> =
    kind === "PLANT"
      ? EffectArray.map(PLANTS, (plant) => ({ names: plant.names, plant }))
      : EffectArray.map(WIKI_NAMES[kind], (names) => ({ names }))

  const entry = catalog[index % catalog.length] ?? catalog[0]
  const round = Math.floor(index / catalog.length)
  const biome = round === 0 ? undefined : BIOMES[(round - 1) % BIOMES.length]
  const repetition = Math.floor((round - 1) / BIOMES.length)
  const suffix = repetition > 0 ? ` ${repetition + 1}` : ""

  return {
    names: biome
      ? ({
          pt: `${entry.names.pt} ${biome.qualifier.pt}${suffix}`,
          en: `${biome.prefixInEnglish} ${entry.names.en}${suffix}`,
          es: `${entry.names.es} ${biome.qualifier.es}${suffix}`,
        } satisfies Localized)
      : entry.names,
    subject: {
      kind,
      plant: entry.plant,
      cultivarQualifier: undefined,
      hasBiome: biome !== undefined,
    } satisfies ArticleSubject,
  }
}

const encodeDocument = Schema.encodeEffect(Schema.toCodecJson(TiptapDocument))

/** Portuguese is the community's main language; other translations are partial. */
const TRANSLATION_PROBABILITIES = {
  pt: 0.95,
  en: 0.55,
  es: 0.45,
} satisfies Record<SupportedLanguage, number>

const legibleTranslation = (input: {
  readonly language: SupportedLanguage
  readonly names: Localized
  readonly subject: ArticleSubject
  readonly references: ReadonlyArray<Reference>
}) =>
  Effect.gen(function* () {
    const { language } = input
    const name = input.names[language]
    const biome = !input.subject.hasBiome && (yield* chance(0.25)) ? yield* pick(BIOMES) : undefined

    const alias = biome
      ? language === "en"
        ? `${biome.prefixInEnglish} ${name}`
        : `${name} ${biome.qualifier[language]}`
      : undefined

    const grammaticalGender =
      language === "pt" && input.subject.plant ? input.subject.plant.gender : null

    const translation: Json = {
      commonNames: [
        { id: yield* nanoId, name, grammaticalGender },
        ...(alias ? [{ id: yield* nanoId, name: alias, grammaticalGender }] : []),
      ],
      content: (yield* chance(0.7))
        ? yield* Effect.orDie(
            Effect.flatMap(
              richTextDocument({
                language,
                paragraphs: [1, 5],
                references: input.references,
                long: true,
              }),
              encodeDocument,
            ),
          )
        : null,
      ...(input.subject.kind === "PLANT"
        ? { origin: (yield* chance(0.5)) ? yield* pick(PLACES) : null }
        : {}),
    }

    return [language, translation] as const
  })

export const legibleTranslations = (input: {
  readonly names: Localized
  readonly subject: ArticleSubject
  readonly references: ReadonlyArray<Reference>
}) =>
  Effect.gen(function* () {
    const chosen = yield* Effect.filter(
      SupportedLanguage.literals,
      (language) => chance(TRANSLATION_PROBABILITIES[language]),
      { concurrency: 1 },
    )

    const languages = EffectArray.isReadonlyArrayNonEmpty(chosen)
      ? chosen
      : [yield* pick(SupportedLanguage.literals)]

    return Record.fromEntries(
      yield* Effect.forEach(languages, (language) => legibleTranslation({ ...input, language }), {
        concurrency: 1,
      }),
    )
  })
