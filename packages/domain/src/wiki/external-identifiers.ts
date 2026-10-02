import { Schema } from "effect"

export const WikidataId = Schema.String.check(Schema.isPattern(/^Q[1-9][0-9]*$/))
export type WikidataId = typeof WikidataId.Type

export const GbifTaxonId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]+$/))
export type GbifTaxonId = typeof GbifTaxonId.Type

export const GbifDeprecatedSpeciesId = Schema.String.check(Schema.isPattern(/^[0-9]+$/))
export type GbifDeprecatedSpeciesId = typeof GbifDeprecatedSpeciesId.Type

export const OpenLibraryWorkId = Schema.String.check(Schema.isPattern(/^OL[1-9][0-9]*W$/))
export type OpenLibraryWorkId = typeof OpenLibraryWorkId.Type

export const GoogleBooksVolumeId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/))
export type GoogleBooksVolumeId = typeof GoogleBooksVolumeId.Type
