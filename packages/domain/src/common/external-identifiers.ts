import { Schema } from "effect"

export const WikidataId = Schema.String.check(Schema.isPattern(/^Q[1-9][0-9]*$/))
export type WikidataId = typeof WikidataId.Type

/** Who's On First IDs are integers; they travel as strings so they never lose precision. */
export const WhosOnFirstId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/)).pipe(
  Schema.brand("WhosOnFirstId"),
)
export type WhosOnFirstId = typeof WhosOnFirstId.Type

export const GeoNamesId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/))
export type GeoNamesId = typeof GeoNamesId.Type

/** ISO 3166-1 alpha-2 */
export const CountryCode = Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/)).pipe(
  Schema.brand("CountryCode"),
)
export type CountryCode = typeof CountryCode.Type

export const GbifTaxonId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]+$/))
export type GbifTaxonId = typeof GbifTaxonId.Type

export const GbifDeprecatedSpeciesId = Schema.String.check(Schema.isPattern(/^[0-9]+$/))
export type GbifDeprecatedSpeciesId = typeof GbifDeprecatedSpeciesId.Type

/** Syntropedia's plant IDs are integers; they travel as strings, as other identifiers do. */
export const SyntropediaPlantId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/)).pipe(
  Schema.brand("SyntropediaPlantId"),
)
export type SyntropediaPlantId = typeof SyntropediaPlantId.Type

export const GoogleBooksVolumeId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/))
export type GoogleBooksVolumeId = typeof GoogleBooksVolumeId.Type

export const YoutubeVideoId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{11}$/)).pipe(
  Schema.brand("YoutubeVideoId"),
)
export type YoutubeVideoId = typeof YoutubeVideoId.Type

export const SpotifyResourceId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9]{22}$/)).pipe(
  Schema.brand("SpotifyResourceId"),
)
export type SpotifyResourceId = typeof SpotifyResourceId.Type

/** TMDB's IDs are integers, numbered separately for movies and series; they travel as strings, as other identifiers do. */
export const TmdbId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/)).pipe(
  Schema.brand("TmdbId"),
)
export type TmdbId = typeof TmdbId.Type

/** IMDb's title IDs (`tt0133093`): films, series and episodes. */
export const ImdbTitleId = Schema.String.check(Schema.isPattern(/^tt[0-9]{7,}$/)).pipe(
  Schema.brand("ImdbTitleId"),
)
export type ImdbTitleId = typeof ImdbTitleId.Type
