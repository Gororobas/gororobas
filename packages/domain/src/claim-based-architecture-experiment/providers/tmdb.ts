/**
 * Reading TMDB (https://www.themoviedb.org), the community-built database of films and series, in
 * a property's `extract`.
 *
 * TMDB numbers movies and series separately (`movie/603`, `tv/1396`), so a work is identified by
 * its media type and ID (`TmdbWorkId`). One request per work, with `append_to_response`, returns
 * everything below: details in our base language (genres come localized), credits, external IDs
 * and every translation of the title. The server's service (`services/tmdb.ts`) fetches it.
 *
 * Their responses are typed with only the fields extractors read; TMDB's own field names are kept
 * on the encoded side. Unlike Wikidata, TMDB has no statements to rank: its values are one
 * community's edits, so extractors take them as they come.
 *
 * Images aren't read. TMDB's posters have no open license (`ProviderPhoto` needs one) and its
 * terms require attribution and forbid keeping the files, so they'd have to be hotlinked.
 */
import { Array as EffectArray, Option, Order, Result, Schema } from "effect"

import type { SupportedLanguage } from "../../common/enums.js"
import { ImdbTitleId, TmdbId, WikidataId } from "../../common/external-identifiers.js"
import { PartialDate } from "../../common/utils/dates.js"
import type { ExtractionIssue } from "../extraction.js"
import { ArticleOrName } from "../values/article-or-name.js"
import { supportedLanguageOf } from "../values/supported-language.js"
import { throughSchema } from "./through-schema.js"

export const TmdbMediaType = Schema.Literals(["movie", "tv"])
export type TmdbMediaType = typeof TmdbMediaType.Type

/** A work as TMDB identifies it: a movie's and a series' IDs are numbered apart. */
export const TmdbWorkId = Schema.Struct({ mediaType: TmdbMediaType, id: TmdbId })
export type TmdbWorkId = typeof TmdbWorkId.Type

/** The language TMDB's localized fields (genres) are requested in. */
export const TMDB_BASE_LANGUAGE = "pt-BR"

const nullableText = Schema.optionalKey(Schema.NullOr(Schema.String))

const TmdbGenre = Schema.Struct({ id: Schema.Int, name: Schema.String })

const TmdbCompany = Schema.Struct({ id: Schema.Int, name: Schema.String })

const TmdbCountry = Schema.Struct({ code: Schema.String, name: Schema.String }).pipe(
  Schema.encodeKeys({ code: "iso_3166_1" }),
)

const TmdbSpokenLanguage = Schema.Struct({ tag: Schema.String }).pipe(
  Schema.encodeKeys({ tag: "iso_639_1" }),
)

const TmdbExternalIds = Schema.Struct({
  imdbId: nullableText,
  wikidataId: nullableText,
}).pipe(Schema.encodeKeys({ imdbId: "imdb_id", wikidataId: "wikidata_id" }))

/**
 * A title in one language and region (`pt` + `BR`). TMDB lists a translation for every language it
 * knows, with empty strings for fields nobody translated.
 */
const TmdbTranslation = Schema.Struct({
  language: Schema.String,
  region: Schema.String,
  data: Schema.Struct({
    /** A movie's. */
    title: Schema.optionalKey(Schema.String),
    /** A series'. */
    name: Schema.optionalKey(Schema.String),
  }),
}).pipe(Schema.encodeKeys({ language: "iso_639_1", region: "iso_3166_1" }))

const TmdbTranslations = Schema.Struct({ translations: Schema.Array(TmdbTranslation) })

const TmdbCastMember = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  /** Billing order: 0 is the lead. */
  order: Schema.Int,
})

const TmdbCrewMember = Schema.Struct({ id: Schema.Int, name: Schema.String, job: Schema.String })

/** What every work has, whatever its media type. */
const workFields = {
  id: Schema.Int,
  originalLanguage: Schema.String,
  homepage: nullableText,
  genres: Schema.Array(TmdbGenre),
  productionCompanies: Schema.Array(TmdbCompany),
  productionCountries: Schema.Array(TmdbCountry),
  spokenLanguages: Schema.Array(TmdbSpokenLanguage),
  externalIds: TmdbExternalIds,
  translations: TmdbTranslations,
}

const workKeys = {
  originalLanguage: "original_language",
  productionCompanies: "production_companies",
  productionCountries: "production_countries",
  spokenLanguages: "spoken_languages",
  externalIds: "external_ids",
} as const

/** `/movie/{id}?append_to_response=credits,external_ids,translations` */
export const TmdbMovie = Schema.Struct({
  ...workFields,
  originalTitle: Schema.String,
  /** Empty until the movie has a date. */
  releaseDate: nullableText,
  /** Minutes. */
  runtime: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  credits: Schema.Struct({
    cast: Schema.Array(TmdbCastMember),
    crew: Schema.Array(TmdbCrewMember),
  }),
}).pipe(
  Schema.encodeKeys({
    ...workKeys,
    originalTitle: "original_title",
    releaseDate: "release_date",
  }),
)

export type TmdbMovie = typeof TmdbMovie.Type

/** `/tv/{id}?append_to_response=aggregate_credits,external_ids,translations` */
export const TmdbSeries = Schema.Struct({
  ...workFields,
  originalName: Schema.String,
  firstAirDate: nullableText,
  numberOfSeasons: Schema.Int,
  numberOfEpisodes: Schema.Int,
  /** Across every season, which is why series don't use `credits`. */
  aggregateCredits: Schema.Struct({ cast: Schema.Array(TmdbCastMember) }),
}).pipe(
  Schema.encodeKeys({
    ...workKeys,
    originalName: "original_name",
    firstAirDate: "first_air_date",
    numberOfSeasons: "number_of_seasons",
    numberOfEpisodes: "number_of_episodes",
    aggregateCredits: "aggregate_credits",
  }),
)

export type TmdbSeries = typeof TmdbSeries.Type

/** A fetched work, tagged by the endpoint it came from. */
export const TmdbWork = Schema.Union([
  Schema.Struct({ mediaType: Schema.Literal("movie"), details: TmdbMovie }),
  Schema.Struct({ mediaType: Schema.Literal("tv"), details: TmdbSeries }),
])
export type TmdbWork = typeof TmdbWork.Type

/** `/search/multi`: movies, series and people, of which only the first two are works. */
export const TmdbSearchResponse = Schema.Struct({
  results: Schema.Array(
    Schema.Union([
      Schema.Struct({
        mediaType: Schema.Literal("movie"),
        id: Schema.Int,
        title: Schema.String,
        originalTitle: Schema.String,
        releaseDate: nullableText,
        originalLanguage: Schema.String,
        overview: nullableText,
      }).pipe(
        Schema.encodeKeys({
          mediaType: "media_type",
          originalTitle: "original_title",
          releaseDate: "release_date",
          originalLanguage: "original_language",
        }),
      ),
      Schema.Struct({
        mediaType: Schema.Literal("tv"),
        id: Schema.Int,
        name: Schema.String,
        originalName: Schema.String,
        firstAirDate: nullableText,
        originalLanguage: Schema.String,
        overview: nullableText,
      }).pipe(
        Schema.encodeKeys({
          mediaType: "media_type",
          originalName: "original_name",
          firstAirDate: "first_air_date",
          originalLanguage: "original_language",
        }),
      ),
      Schema.Struct({ mediaType: Schema.Literal("person") }).pipe(
        Schema.encodeKeys({ mediaType: "media_type" }),
      ),
    ]),
  ),
})

export type TmdbSearchResponse = typeof TmdbSearchResponse.Type

/** What the form offers when a person matches an article to TMDB: enough to tell works apart. */
export const TmdbWorkSuggestion = Schema.Struct({
  work: TmdbWorkId,
  title: Schema.String,
  originalTitle: Schema.String,
  year: Schema.NullOr(Schema.Int),
  originalLanguage: Schema.String,
  overview: Schema.NullOr(Schema.String),
  sourceUrl: Schema.String,
})

export type TmdbWorkSuggestion = typeof TmdbWorkSuggestion.Type

/** TMDB's empty strings mean "none". */
const present = (text: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(text?.trim()), (trimmed) => trimmed !== "")

const yearOf = (date: string | null | undefined): number | null =>
  Option.match(present(date), {
    onNone: () => null,
    onSome: (text) => {
      const year = Number(text.slice(0, 4))
      return Number.isInteger(year) ? year : null
    },
  })

/**
 * Top-billed cast only: a series' aggregate credits list hundreds of guest actors, which would
 * drown the lead cast people want to see.
 */
const BILLED_CAST_LIMIT = 10

export const tmdbUrl = ({ mediaType, id }: TmdbWorkId) =>
  `https://www.themoviedb.org/${mediaType}/${id}`

const regionNames = new Intl.DisplayNames([TMDB_BASE_LANGUAGE], { type: "region" })

export const Tmdb = {
  suggestions: (response: TmdbSearchResponse): ReadonlyArray<TmdbWorkSuggestion> =>
    response.results.flatMap((result) => {
      if (result.mediaType === "person") return []
      const work = { mediaType: result.mediaType, id: TmdbId.make(String(result.id)) }
      const isMovie = result.mediaType === "movie"

      return [
        {
          work,
          title: isMovie ? result.title : result.name,
          originalTitle: isMovie ? result.originalTitle : result.originalName,
          year: yearOf(isMovie ? result.releaseDate : result.firstAirDate),
          originalLanguage: result.originalLanguage,
          overview: Option.getOrNull(present(result.overview)),
          sourceUrl: tmdbUrl(work),
        },
      ]
    }),

  /**
   * The title in its original language, then each translation TMDB has in a language we're
   * written in. TMDB lists Brazilian and European Portuguese apart; ours is Brazil's, so it
   * comes first.
   */
  titles: (
    work: TmdbWork,
  ): ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: string }> => {
    const original = Option.flatMap(
      supportedLanguageOf(work.details.originalLanguage),
      (language) =>
        Option.map(
          present(
            work.mediaType === "movie" ? work.details.originalTitle : work.details.originalName,
          ),
          (value) => ({ language, value }),
        ),
    )

    const { translations } = work.details.translations

    const translated = [
      ...translations.filter(({ region }) => region === "BR"),
      ...translations.filter(({ region }) => region !== "BR"),
    ].flatMap(({ language, data }) =>
      Option.toArray(
        Option.flatMap(supportedLanguageOf(language), (supported) =>
          Option.map(present(data.title ?? data.name), (value) => ({
            language: supported,
            value,
          })),
        ),
      ),
    )

    return [...Option.toArray(original), ...translated]
  },

  /** A movie's release or a series' first air date. */
  releaseDates: (work: TmdbWork): ReadonlyArray<Result.Result<PartialDate, ExtractionIssue>> =>
    Option.toArray(
      present(work.mediaType === "movie" ? work.details.releaseDate : work.details.firstAirDate),
    ).map((date) => throughSchema(PartialDate, `${date}[UTC]`)),

  /** Movies only: a series has no director, its episodes do. */
  directors: (work: TmdbWork): ReadonlyArray<string> =>
    work.mediaType === "movie"
      ? work.details.credits.crew.filter(({ job }) => job === "Director").map(({ name }) => name)
      : [],

  /** In billing order. */
  cast: (work: TmdbWork): ReadonlyArray<string> =>
    EffectArray.sort(
      work.mediaType === "movie" ? work.details.credits.cast : work.details.aggregateCredits.cast,
      Order.mapInput(Order.Number, (member: { readonly order: number }) => member.order),
    )
      .slice(0, BILLED_CAST_LIMIT)
      .map(({ name }) => name),

  /** Named in `TMDB_BASE_LANGUAGE`. */
  genres: (work: TmdbWork): ReadonlyArray<string> => work.details.genres.map(({ name }) => name),

  productionCompanies: (work: TmdbWork): ReadonlyArray<string> =>
    work.details.productionCompanies.map(({ name }) => name),

  /** The countries it was produced in, named in `TMDB_BASE_LANGUAGE` (TMDB only names them in English). */
  productionCountries: (work: TmdbWork): ReadonlyArray<string> =>
    work.details.productionCountries.map(({ code, name }) => regionNames.of(code) ?? name),

  /** The original language, then the ones spoken. TMDB uses `xx` for "no language". */
  languageTags: (work: TmdbWork): ReadonlyArray<string> =>
    [work.details.originalLanguage, ...work.details.spokenLanguages.map(({ tag }) => tag)].filter(
      (tag) => tag !== "xx",
    ),

  homepage: (work: TmdbWork): Option.Option<string> => present(work.details.homepage),

  /** Minutes: series have none, TMDB's per-episode runtimes are too loose to be one. */
  runtime: (work: TmdbWork): Option.Option<number> =>
    work.mediaType === "movie"
      ? Option.filter(Option.fromNullishOr(work.details.runtime), (minutes) => minutes > 0)
      : Option.none(),

  numberOfSeasons: (work: TmdbWork): Option.Option<number> =>
    work.mediaType === "tv" ? Option.some(work.details.numberOfSeasons) : Option.none(),

  numberOfEpisodes: (work: TmdbWork): Option.Option<number> =>
    work.mediaType === "tv" ? Option.some(work.details.numberOfEpisodes) : Option.none(),

  imdbId: (work: TmdbWork): ReadonlyArray<Result.Result<ImdbTitleId, ExtractionIssue>> =>
    Option.toArray(present(work.details.externalIds.imdbId)).map((id) =>
      throughSchema(ImdbTitleId, id),
    ),

  /** TMDB's concordance with Wikidata. */
  wikidataId: (work: TmdbWork): ReadonlyArray<Result.Result<WikidataId, ExtractionIssue>> =>
    Option.toArray(present(work.details.externalIds.wikidataId)).map((id) =>
      throughSchema(WikidataId, id),
    ),

  /** A person or company as the name TMDB gives, until we have an article for it. */
  name: (name: string): Result.Result<ArticleOrName, ExtractionIssue> =>
    throughSchema(ArticleOrName, { _tag: "NAME", name }),
}
