/**
 * Type-level checks: decoded claims of a concrete property are the claim types generic code uses,
 * and a property's claims only take the sources it lists. They compile only while that holds.
 */
import type { Claim, ClaimOf } from "./claims.js"
import type { CultivarOfProperty } from "./properties/cultivar-of.js"
import type { HeightProperty } from "./properties/height.js"
import type { NamesProperty } from "./properties/names.js"
import type { TaxonomicClassificationProperty } from "./properties/taxonomic-classification.js"
import type { PersonProvenance } from "./sources.js"

export const articleWideClaimsMatch = (
  claim: ClaimOf<typeof HeightProperty>,
): Claim<typeof HeightProperty.valueSchema.Type, "UNIVERSAL"> => claim

export const languageSpecificClaimsMatch = (
  claim: ClaimOf<typeof NamesProperty>,
): Claim<typeof NamesProperty.valueSchema.Type, "LANGUAGE_SPECIFIC"> => claim

/** `cultivarOf` lists only people, so every claim about it is a person's. */
export const peopleOnlyClaimsComeFromPeople = (
  claim: ClaimOf<typeof CultivarOfProperty>,
): PersonProvenance => claim.provenance

/** `taxonomicClassification` lists only GBIF, so its claims are all GBIF's. */
export const providerClaimsNameListedProviders = (
  claim: ClaimOf<typeof TaxonomicClassificationProperty>,
): "GBIF" => claim.provenance.provider
