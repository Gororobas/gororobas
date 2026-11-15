/**
 * Type-level checks: decoded claims of a concrete property are the claim types generic code uses,
 * and a property's claims only take the sources it lists. They compile only while that holds.
 */

import type { Option } from "effect"
import type * as Length from "effect-units/Length"

import type { AgroforestryStratum } from "../common/enums.js"
import type { RangeWithOptionalEnds } from "../common/primitives.js"
import type { CanonicalClaim, ClaimOf, SituatedClaim } from "./claims.js"
import type { CultivarOfProperty } from "./properties/cultivar-of.js"
import type { MostCommonlyKnownAsProperty } from "./properties/most-commonly-known-as.js"
import type { StrataProperty } from "./properties/strata.js"
import type { TaxonomicClassificationProperty } from "./properties/taxonomic-classification.js"
import type { PersonProvenance } from "./provenance.js"
import type { ResolvedArticle } from "./resolved-article.js"

export const articleWideClaimsMatch = (
  claim: ClaimOf<typeof TaxonomicClassificationProperty>,
): CanonicalClaim<typeof TaxonomicClassificationProperty.valueSchema.Type, "UNIVERSAL"> => claim

export const languageSpecificClaimsMatch = (
  claim: ClaimOf<typeof MostCommonlyKnownAsProperty>,
): CanonicalClaim<typeof MostCommonlyKnownAsProperty.valueSchema.Type, "LANGUAGE_SPECIFIC"> => claim

export const situatedClaimsMatch = (
  claim: ClaimOf<typeof StrataProperty>,
): SituatedClaim<typeof StrataProperty.valueSchema.Type, "UNIVERSAL"> => claim

/** `strata` names Syntropedia and people, so its sources' claims are Syntropedia's. */
export const situatedProviderClaimsNameListedProviders = (
  claim: Extract<ClaimOf<typeof StrataProperty>, { readonly _tag: "EXTERNAL_SOURCE" }>,
): "SYNTROPEDIA" => claim.provenance.provider

/** `strata` is tallied member by member, so its summary lists strata, not sets of them. */
export const memberSummariesListMembers = (
  summary: ResolvedArticle<"PLANT">["strata"],
): ReadonlyArray<AgroforestryStratum> => summary.own.values.map(({ value }) => value)

/** `height` is combined into one range of lengths. */
export const rangeSummariesKeepTheirBounds = (
  summary: ResolvedArticle<"PLANT">["height"],
): Option.Option<RangeWithOptionalEnds<Length.Length>> => summary.own.range

/** `crownShape` inherits by choice, whichever kind of article it's on. */
export const chosenInheritanceSaysWhetherItInherits = (
  resolved: ResolvedArticle<"PLANT_CULTIVAR">["crownShape"],
): boolean => resolved.isInheriting

/** `cultivarOf` lists only people, so every claim about it is a person's. */
export const peopleOnlyClaimsComeFromPeople = (
  claim: ClaimOf<typeof CultivarOfProperty>,
): PersonProvenance => claim.provenance

/** `taxonomicClassification` lists only GBIF, so its claims are all GBIF's. */
export const providerClaimsNameListedProviders = (
  claim: ClaimOf<typeof TaxonomicClassificationProperty>,
): "GBIF" => claim.provenance.provider
