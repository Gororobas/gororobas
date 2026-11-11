/**
 * Reading Wikidata in a property's `extract`: plain functions over an entity, each returning a
 * `Result` with the reason a value can't be read. Properties compose them; nothing here knows
 * about properties.
 *
 * Rules every reader follows:
 * - Only truthy statements count, as Wikidata's `wdt:` triples: never deprecated ones, and the
 *   preferred ones instead of the normal ones when a property has any.
 * - Statements with an end time (P582) are no longer current, and are skipped.
 * - Each reader checks the snak's datatype first, so a property whose datatype changes upstream
 *   fails loudly instead of turning into wrong values.
 * - Values go through our schemas: Wikidata's value is their encoded side.
 *
 * Datavalues are tagged by *value* type: items arrive as `wikibase-entityid`, and URLs, external
 * IDs and Commons files all as `string`. The snak's `datatype` tells them apart.
 */
import { Array as EffectArray, Option, Record, Result, Schema } from "effect"

import type { SupportedLanguage } from "../../common/enums.js"
import { WikidataId } from "../../common/external-identifiers.js"
import type { MediaAssetId, WikiArticleId } from "../../common/ids.js"
import { PartialDate } from "../../common/utils/dates.js"
import type { ExtractionContext, ExtractionIssue } from "../extraction.js"
import type { ArticleKind } from "../kinds.js"
import { ArticleOrName } from "../values/article-or-name.js"
import { supportedLanguageOf } from "../values/supported-language.js"
import { throughSchema } from "./through-schema.js"

export const WikidataPropertyId = Schema.String.check(Schema.isPattern(/^P[1-9][0-9]*$/)).pipe(
  Schema.brand("WikidataPropertyId"),
)

export type WikidataPropertyId = typeof WikidataPropertyId.Type

/**
 * The Wikidata properties our extractors read, by ID: IDs are stable, labels drift.
 *
 * Each means exactly what the property reading it means, unless its comment gives SKOS's match
 * strength (as `schemaOrg`'s `match` does): `NARROWER` (narrowMatch) when Wikidata's says less than
 * ours, so its values are some of ours but never all of them; `CLOSE` (closeMatch) when they
 * nearly mean the same, with how they differ.
 */
export const WikidataProperty = {
  AUTHOR: WikidataPropertyId.make("P50"),
  /** With DATE_OF_DEATH, one `lifespan`: neither is claimed alone. */
  DATE_OF_BIRTH: WikidataPropertyId.make("P569"),
  DATE_OF_DEATH: WikidataPropertyId.make("P570"),
  /** A qualifier, mapped to nothing: statements with one are no longer current. */
  END_TIME: WikidataPropertyId.make("P582"),
  /**
   * GBIF taxon ID since 2026. It replaced P846, which holds GBIF *Backbone* species IDs: another
   * identifier scheme GBIF must resolve into a taxon ID, so P846 is never read as one.
   */
  GBIF_TAXON_ID: WikidataPropertyId.make("P14607"),
  /** Mapped to no property: the item's classes decide whether it's about the article's kind. */
  INSTANCE_OF: WikidataPropertyId.make("P31"),
  LANGUAGE_OF_WORK: WikidataPropertyId.make("P407"),
  OFFICIAL_WEBSITE: WikidataPropertyId.make("P856"),
  /**
   * `NARROWER` than `inLanguage`: a film's original language, without the languages it was
   * dubbed or released in. Films state it here rather than in LANGUAGE_OF_WORK.
   */
  ORIGINAL_LANGUAGE_OF_FILM: WikidataPropertyId.make("P364"),
  /**
   * `CLOSE` to `datePublished` for films: they have one statement per country they were released
   * in (qualified by P291), and a `ONE` property reports those as ambiguous instead of guessing
   * the first release.
   */
  PUBLICATION_DATE: WikidataPropertyId.make("P577"),
  PUBLISHER: WikidataPropertyId.make("P123"),
  /** `NARROWER` than `names`: what a taxon is commonly called, beside the item's labels and aliases. */
  TAXON_COMMON_NAME: WikidataPropertyId.make("P1843"),
  /**
   * `NARROWER` than `scientificNames`: the taxon's accepted name, without the synonyms GBIF and
   * people add.
   */
  TAXON_NAME: WikidataPropertyId.make("P225"),
} as const

export const ItemDataValue = Schema.Struct({
  type: Schema.Literal("wikibase-entityid"),
  value: Schema.Struct({ id: WikidataId }),
})

export const StringDataValue = Schema.Struct({
  type: Schema.Literal("string"),
  value: Schema.String,
})

export const TimeDataValue = Schema.Struct({
  type: Schema.Literal("time"),
  value: Schema.Struct({
    /** `+1962-09-27T00:00:00Z`; months and days are `00` below their precision. */
    time: Schema.String,
    /** 11 day, 10 month, 9 year, 8 decade, 7 century… */
    precision: Schema.Int,
    calendarmodel: Schema.String,
  }),
})

export const QuantityDataValue = Schema.Struct({
  type: Schema.Literal("quantity"),
  value: Schema.Struct({
    /** A signed decimal string: `+297`. */
    amount: Schema.String,
    /** `1` when dimensionless, else the unit item's URI. */
    unit: Schema.String,
  }),
})

export const MonolingualTextDataValue = Schema.Struct({
  type: Schema.Literal("monolingualtext"),
  value: Schema.Struct({ text: Schema.String, language: Schema.String }),
})

export const WikidataDataValue = Schema.Union([
  ItemDataValue,
  StringDataValue,
  TimeDataValue,
  QuantityDataValue,
  MonolingualTextDataValue,
  // Coordinates, shapes and the rest: kept opaque so one exotic value can't fail the entity.
  Schema.Struct({ type: Schema.String, value: Schema.Unknown }),
])

export type WikidataDataValue = typeof WikidataDataValue.Type

export const WikidataSnak = Schema.Union([
  Schema.Struct({
    snaktype: Schema.Literal("value"),
    property: Schema.String,
    datatype: Schema.String,
    datavalue: WikidataDataValue,
  }),
  /** `novalue`: Wikidata says there's none. `somevalue`: there's one, but it's unknown. */
  Schema.Struct({ snaktype: Schema.Literals(["novalue", "somevalue"]), property: Schema.String }),
])

export type WikidataSnak = typeof WikidataSnak.Type

export const WikidataStatement = Schema.Struct({
  id: Schema.String,
  rank: Schema.Literals(["preferred", "normal", "deprecated"]),
  mainsnak: WikidataSnak,
  qualifiers: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(WikidataSnak))),
})

export type WikidataStatement = typeof WikidataStatement.Type

const Term = Schema.Struct({ language: Schema.String, value: Schema.String })

/**
 * The parts of an entity extraction reads, as `wbgetentities` serializes them. The server's
 * `wikidata.schema.ts` models the whole entity; it would move into the domain and replace this.
 */
export const WikidataEntity = Schema.Struct({
  id: WikidataId,
  labels: Schema.Record(Schema.String, Term),
  aliases: Schema.Record(Schema.String, Schema.Array(Term)),
  claims: Schema.Record(Schema.String, Schema.Array(WikidataStatement)),
  sitelinks: Schema.Record(
    Schema.String,
    Schema.Struct({ site: Schema.String, title: Schema.String, url: Schema.String }),
  ),
})

export type WikidataEntity = typeof WikidataEntity.Type

const isEnded = (statement: WikidataStatement) =>
  EffectArray.isReadonlyArrayNonEmpty(statement.qualifiers?.[WikidataProperty.END_TIME] ?? [])

/** A property's truthy statements, in Wikidata's order. */
const statements = (
  entity: WikidataEntity,
  property: WikidataPropertyId,
): ReadonlyArray<WikidataStatement> => {
  const ranked = (entity.claims[property] ?? []).filter(
    (statement) => statement.rank !== "deprecated" && !isEnded(statement),
  )
  const preferred = ranked.filter((statement) => statement.rank === "preferred")

  return EffectArray.isReadonlyArrayNonEmpty(preferred) ? preferred : ranked
}

/** The statement's data value, if it has one of the given datatypes. */
const dataValueOf = (
  statement: WikidataStatement,
  datatypes: ReadonlyArray<string>,
): Result.Result<WikidataDataValue, ExtractionIssue> => {
  const snak = statement.mainsnak

  if (snak.snaktype !== "value") {
    return Result.fail(
      snak.snaktype === "novalue" ? { _tag: "NO_VALUE" } : { _tag: "UNKNOWN_VALUE" },
    )
  }

  if (!datatypes.includes(snak.datatype)) {
    return Result.fail({ _tag: "UNEXPECTED_DATATYPE", expected: datatypes, found: snak.datatype })
  }

  return Result.succeed(snak.datavalue)
}

const narrowed = <A>({
  dataValue,
  schema,
  expected,
}: {
  readonly dataValue: WikidataDataValue
  readonly schema: Schema.Schema<A>
  readonly expected: string
}): Result.Result<A, ExtractionIssue> =>
  Schema.is(schema)(dataValue)
    ? Result.succeed(dataValue)
    : Result.fail({ _tag: "INVALID_VALUE", detail: `expected ${expected}, got ${dataValue.type}` })

const text =
  (datatype: string) =>
  <A, E>(statement: WikidataStatement, schema: Schema.Codec<A, E>) =>
    dataValueOf(statement, [datatype]).pipe(
      Result.flatMap((dataValue) =>
        narrowed({ dataValue, schema: StringDataValue, expected: "a string" }),
      ),
      Result.flatMap(({ value }) => throughSchema(schema, value)),
    )

const item = (statement: WikidataStatement): Result.Result<WikidataId, ExtractionIssue> =>
  dataValueOf(statement, ["wikibase-item"]).pipe(
    Result.flatMap((dataValue) =>
      narrowed({ dataValue, schema: ItemDataValue, expected: "an item" }),
    ),
    Result.map(({ value }) => value.id),
  )

const GREGORIAN = "http://www.wikidata.org/entity/Q1985727"
const TIME_PATTERN = /^\+(\d{4})-(\d{2})-(\d{2})T/

/** Wikidata's precisions `PartialDate` can say (day, month, year), with the date parts to keep. */
const DATE_PARTS_BY_PRECISION = [
  { precision: 11, parts: 3 },
  { precision: 10, parts: 2 },
  { precision: 9, parts: 1 },
] as const

const time = (statement: WikidataStatement): Result.Result<PartialDate, ExtractionIssue> =>
  dataValueOf(statement, ["time"]).pipe(
    Result.flatMap((dataValue) =>
      narrowed({ dataValue, schema: TimeDataValue, expected: "a time" }),
    ),
    Result.flatMap(({ value }) => {
      const parts = TIME_PATTERN.exec(value.time)?.slice(1, 4)
      const kept = EffectArray.findFirst(
        DATE_PARTS_BY_PRECISION,
        (entry) => entry.precision === value.precision,
      )

      if (value.calendarmodel !== GREGORIAN) {
        return Result.fail({
          _tag: "UNSUPPORTED_TIME",
          detail: "a non-Gregorian calendar",
        } as const)
      }

      if (parts === undefined) {
        return Result.fail({ _tag: "UNSUPPORTED_TIME", detail: value.time } as const)
      }

      return Option.match(kept, {
        onNone: () =>
          Result.fail({
            _tag: "UNSUPPORTED_TIME",
            detail: `precision ${String(value.precision)}`,
          } as const),
        onSome: (entry) =>
          throughSchema(PartialDate, `${parts.slice(0, entry.parts).join("-")}[UTC]`),
      })
    }),
  )

const ENTITY_URI_PREFIX = "http://www.wikidata.org/entity/"

/** Units Wikidata uses, by item ID. */
export const WikidataUnit = {
  DIMENSIONLESS: "1",
  METRE: "Q11573",
  CENTIMETRE: "Q174728",
} as const

const TAXON = "Q16521"

/**
 * Which Wikidata classes an item must be an instance of to be about an article of each kind.
 * Matched directly, not through subclasses (P279): a class missing here is a moderator's review,
 * not wrong data.
 */
const INSTANCE_OF_BY_KIND = {
  PLANT: [TAXON],
  // Q4886: cultivar.
  PLANT_CULTIVAR: ["Q4886"],
  ANIMAL: [TAXON],
  // Written work, literary work, book, essay.
  BOOK: ["Q47461344", "Q7725634", "Q571", "Q35760"],
  // Film, television series.
  FILM: ["Q11424", "Q5398426"],
  // Human.
  NOTEWORTHY_PERSON: ["Q5"],
  // Places, organizations and the rest vary too much to list.
  NOTEWORTHY_ENTITY: null,
  CONTENT_PRODUCER: null,
  PLACE: null,
  RESOURCE: null,
  TOOL: null,
  CONCEPT: null,
  UNCATEGORIZED: null,
} as const satisfies { readonly [Kind in ArticleKind]: ReadonlyArray<string> | null }

export const Wikidata = {
  statements,

  string: text("string"),
  externalId: text("external-id"),
  url: text("url"),
  item,
  time,

  /** An item as a link to our article for it, or as its label until we have one. */
  articleOrName: (
    statement: WikidataStatement,
    {
      context,
      language,
    }: { readonly context: ExtractionContext; readonly language: SupportedLanguage },
  ): Result.Result<ArticleOrName, ExtractionIssue> =>
    Result.flatMap(item(statement), (wikidataId) =>
      Option.match(context.articleWithWikidataId(wikidataId), {
        onSome: (wikiArticleId) =>
          Result.succeed(ArticleOrName.cases.ARTICLE.make({ wikiArticleId })),
        onNone: () =>
          Option.match(
            Option.orElse(context.labelOf(wikidataId, language), () =>
              context.labelOf(wikidataId, "en"),
            ),
            {
              onNone: () => Result.fail({ _tag: "UNMATCHED_ITEM", wikidataId } as const),
              onSome: (name) => throughSchema(ArticleOrName, { _tag: "NAME", name }),
            },
          ),
      }),
    ),

  /** An item that must be one of our articles: relations like `containedInPlace`. */
  article: (
    statement: WikidataStatement,
    context: ExtractionContext,
  ): Result.Result<WikiArticleId, ExtractionIssue> =>
    Result.flatMap(item(statement), (wikidataId) =>
      Option.match(context.articleWithWikidataId(wikidataId), {
        onSome: Result.succeed,
        onNone: () => Result.fail({ _tag: "UNMATCHED_ITEM", wikidataId } as const),
      }),
    ),

  /** A language item as its IETF tag (P305): `en-US`. */
  languageTag: <A, E>(
    statement: WikidataStatement,
    {
      context,
      schema,
    }: { readonly context: ExtractionContext; readonly schema: Schema.Codec<A, E> },
  ): Result.Result<A, ExtractionIssue> =>
    Result.flatMap(item(statement), (wikidataId) =>
      Option.match(context.languageTagOf(wikidataId), {
        onNone: () => Result.fail({ _tag: "UNMATCHED_ITEM", wikidataId } as const),
        onSome: (tag) => throughSchema(schema, tag),
      }),
    ),

  /** Text in one language; languages we don't write in are skipped. */
  monolingualText: <A, E>(
    statement: WikidataStatement,
    schema: Schema.Codec<A, E>,
  ): Result.Result<{ readonly language: SupportedLanguage; readonly value: A }, ExtractionIssue> =>
    dataValueOf(statement, ["monolingualtext"]).pipe(
      Result.flatMap((dataValue) =>
        narrowed({ dataValue, schema: MonolingualTextDataValue, expected: "monolingual text" }),
      ),
      Result.flatMap(({ value }) =>
        Option.match(supportedLanguageOf(value.language), {
          onNone: () =>
            Result.fail({ _tag: "UNSUPPORTED_LANGUAGE", language: value.language } as const),
          onSome: (language) =>
            Result.map(throughSchema(schema, value.text), (decoded) => ({
              language,
              value: decoded,
            })),
        }),
      ),
    ),

  /** A quantity's amount converted into one of the given units; any other unit fails. */
  quantity: (
    statement: WikidataStatement,
    units: Readonly<Partial<Record<string, (amount: number) => number>>>,
  ): Result.Result<number, ExtractionIssue> =>
    dataValueOf(statement, ["quantity"]).pipe(
      Result.flatMap((dataValue) =>
        narrowed({ dataValue, schema: QuantityDataValue, expected: "a quantity" }),
      ),
      Result.flatMap(({ value }) => {
        const unit = value.unit.replace(ENTITY_URI_PREFIX, "")
        const convert = units[unit]

        return convert === undefined
          ? Result.fail({ _tag: "UNKNOWN_UNIT", unit } as const)
          : Result.succeed(convert(Number(value.amount)))
      }),
    ),

  /** A Commons file, as the media asset it was imported into. */
  commonsFile: (
    statement: WikidataStatement,
    context: ExtractionContext,
  ): Result.Result<MediaAssetId, ExtractionIssue> =>
    dataValueOf(statement, ["commonsMedia"]).pipe(
      Result.flatMap((dataValue) =>
        narrowed({ dataValue, schema: StringDataValue, expected: "a file name" }),
      ),
      Result.flatMap(({ value }) =>
        Option.match(context.importedFile(value), {
          onSome: Result.succeed,
          onNone: () => Result.fail({ _tag: "NOT_IMPORTED", fileName: value } as const),
        }),
      ),
    ),

  /** The label, then the aliases, in languages we write in (`mul` is none of them). */
  terms: (
    entity: WikidataEntity,
  ): ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: string }> =>
    [
      ...Record.values(entity.labels),
      ...Record.values(entity.aliases).flatMap((aliases) => aliases),
    ].flatMap(({ language, value }) =>
      Option.toArray(supportedLanguageOf(language)).map((supported) => ({
        language: supported,
        value,
      })),
    ),

  /** Wikipedia pages in languages we write in: `ptwiki` is the Portuguese Wikipedia's. */
  wikipediaPages: (
    entity: WikidataEntity,
  ): ReadonlyArray<{ readonly language: SupportedLanguage; readonly url: string }> =>
    Record.values(entity.sitelinks).flatMap(({ site, url }) =>
      site.endsWith("wiki")
        ? Option.toArray(supportedLanguageOf(site.slice(0, -"wiki".length))).map((language) => ({
            language,
            url,
          }))
        : [],
    ),

  /**
   * Whether the item is about an article of this kind, by its classes (P31). A wrong Wikidata ID
   * is the costliest mistake extraction can make, so an item that isn't yields nothing at all.
   */
  checkKind: (entity: WikidataEntity, kind: ArticleKind): Option.Option<ExtractionIssue> => {
    const expected: ReadonlyArray<string> | null = INSTANCE_OF_BY_KIND[kind]
    if (expected === null) return Option.none()

    const found = statements(entity, WikidataProperty.INSTANCE_OF).flatMap((statement) =>
      Result.match(item(statement), { onSuccess: (id) => [id], onFailure: () => [] }),
    )

    return EffectArray.isReadonlyArrayNonEmpty(EffectArray.intersection(found, expected))
      ? Option.none()
      : Option.some({ _tag: "NOT_OF_KIND", expected, found })
  },
}
