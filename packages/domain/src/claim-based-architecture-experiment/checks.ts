/**
 * Type-level checks: decoded claims of a concrete property are the claim types generic code uses,
 * and a property's claims only take the sources it lists. They compile only while that holds.
 */
import type { Claim, ClaimOf } from "./claims.js"
import type { HeightProperty } from "./properties/height.js"
import type { NamesProperty } from "./properties/names.js"
import type { ResourceUrlProperty } from "./properties/resource-url.js"
import type { TaxonomicClassificationProperty } from "./properties/taxonomic-classification.js"
import type { PersonSource } from "./sources.js"

export const articleWideClaimsMatch = (
  claim: ClaimOf<typeof HeightProperty>,
): Claim<typeof HeightProperty.value.Type, "UNIVERSAL"> => claim

export const languageSpecificClaimsMatch = (
  claim: ClaimOf<typeof NamesProperty>,
): Claim<typeof NamesProperty.value.Type, "LANGUAGE_SPECIFIC"> => claim

/** `resourceUrl` lists only people, so every claim about it is a person's. */
export const peopleOnlyClaimsComeFromPeople = (
  claim: ClaimOf<typeof ResourceUrlProperty>,
): PersonSource => claim.source

/** `taxonomicClassification` lists only GBIF, so its claims are all GBIF's. */
export const providerClaimsNameListedProviders = (
  claim: ClaimOf<typeof TaxonomicClassificationProperty>,
): "GBIF" => claim.source.provider
