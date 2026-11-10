/**
 * Reading Syntropedia (https://syntropedia.forests4farming.org), Forests4Farming's catalogue of
 * plants for syntropic agroforestry, in a property's `extract`.
 *
 * Syntropedia has no API yet: `apps/server/scripts/syntropedia/` dumps its app's offline catalogue
 * and normalizes it into `SyntropediaPlant`s, so the "fetch" is a lookup in that dump by
 * `syntropediaPlantId`. The dump is already typed: fields Syntropedia states exactly (growth form,
 * successional group…) use our enums, and fields it lumps together keep its own categories here,
 * so how loosely they map onto ours is decided in one place, below.
 */
import { Array as EffectArray, Option, Record, Schema } from "effect"
import * as Length from "effect-units/Length"

import {
  AgroforestryRole,
  AgroforestryStratum,
  ClimateZone,
  CrownShape,
  GrowthForm,
  GrowthRate,
  LeafPersistence,
  type PlantUsage,
  type PlantingMethod,
  PruningResponse,
  SeedStorageBehavior,
  SuccessionalGroup,
  type SupportedLanguage,
} from "../../common/enums.js"
import { SyntropediaPlantId } from "../../common/external-identifiers.js"
import { NonEmptyTrimmedString, UrlAsString } from "../../common/primitives.js"
import { makeRange } from "../values/range.js"
import { supportedLanguageOf } from "../values/supported-language.js"

/**
 * Syntropedia's plant functions (`funcoes`), merged where its labels pair two things ("Medicinal &
 * Cosmetic"). Its "Toxicity Warning" is a warning rather than a function: see `hasToxicityWarning`.
 */
export const SyntropediaFunction = Schema.Literals([
  "HUMAN_NUTRITION",
  "MEDICINAL_AND_COSMETIC",
  "AROMATIC_AND_CONDIMENT",
  "FORAGE",
  "TIMBER",
  "FUEL",
  "INDUSTRIAL_MATERIALS",
  "BIOMASS",
  "NITROGEN_FIXATION",
  "POLLINATOR_SUPPORT",
  "BIOCONTROL_AND_REPELLENT",
  "ORNAMENTAL",
])

export type SyntropediaFunction = typeof SyntropediaFunction.Type

/** Syntropedia's propagation methods (`formas_propagacao`), each one of its lumped groups. */
export const SyntropediaPropagationMethod = Schema.Literals([
  "SEEDS",
  /** "Cuttings (stem, root)" */
  "CUTTINGS",
  /** "Grafting/Budding" */
  "GRAFTING",
  /** "Layering (Tip, Air)" */
  "LAYERING",
  /** "Division (Root, Crown)" */
  "DIVISION",
  /** "Suckers/Runners/Bulbils" */
  "OFFSETS",
  /** "Rhizomes/Tubers/Bulbs" */
  "STORAGE_ORGANS",
])

export type SyntropediaPropagationMethod = typeof SyntropediaPropagationMethod.Type

/** Syntropedia measures in meters. Taller than the tallest trees is a typo ("1020" for "10-20"). */
const Meters = Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(150))

export const MetersRange = makeRange({
  bound: Meters,
  isLessThanOrEqual: (self, that) => self <= that,
  identifier: "MetersRange",
  title: "Range in meters",
})

export type MetersRange = typeof MetersRange.Type

/** A place the plant was tested in an agroforest, with the role it played there. */
export const SyntropediaTestedSite = Schema.Struct({
  country: NonEmptyTrimmedString,
  state: Schema.NullOr(NonEmptyTrimmedString),
  city: Schema.NullOr(NonEmptyTrimmedString),
  /** Missing for a few sites. */
  coordinates: Schema.NullOr(
    Schema.Struct({
      latitude: Schema.Finite.check(Schema.isBetween({ minimum: -90, maximum: 90 })),
      longitude: Schema.Finite.check(Schema.isBetween({ minimum: -180, maximum: 180 })),
    }),
  ),
  roles: Schema.Array(AgroforestryRole),
})

export type SyntropediaTestedSite = typeof SyntropediaTestedSite.Type

/** One plant of the normalized dump: what extractors read. */
export const SyntropediaPlant = Schema.Struct({
  id: SyntropediaPlantId,
  scientificName: NonEmptyTrimmedString,
  /** Read from Syntropedia's comments ("syn. scientific name: Pennisetum purpureum"). */
  scientificNameSynonyms: Schema.Array(NonEmptyTrimmedString),
  family: Schema.NullOr(NonEmptyTrimmedString),
  /**
   * By Syntropedia's language tags (`en`, `pt-br`, `es`, `fr`, `de`, `sw`), in its order. Its names
   * are title-cased ("Marmelada-De-Cachorro"), which our names compare without.
   */
  names: Schema.Record(Schema.String, Schema.Array(NonEmptyTrimmedString)),
  /** One of Syntropedia's strata spans two of ours ("Medium-High"): both are listed. */
  strata: Schema.Array(AgroforestryStratum),
  successionalGroup: Schema.NullOr(SuccessionalGroup),
  growthForm: Schema.NullOr(GrowthForm),
  growthRate: Schema.NullOr(GrowthRate),
  pruningResponse: Schema.NullOr(PruningResponse),
  leafPersistence: Schema.NullOr(LeafPersistence),
  heightInMeters: Schema.NullOr(MetersRange),
  crownDiameterInMeters: Schema.NullOr(MetersRange),
  crownShape: Schema.NullOr(CrownShape),
  climateZones: Schema.Array(ClimateZone),
  functions: Schema.Array(SyntropediaFunction),
  /** The caveat (which part, when) is in `comment`. */
  hasToxicityWarning: Schema.Boolean,
  propagationMethods: Schema.Array(SyntropediaPropagationMethod),
  seedDormancy: Schema.NullOr(Schema.Boolean),
  seedStorageBehavior: Schema.NullOr(SeedStorageBehavior),
  wasTestedInAgroforestry: Schema.Boolean,
  testedSites: Schema.Array(SyntropediaTestedSite),
  /** Free text in English: toxicity caveats and propagation notes. */
  comment: Schema.NullOr(NonEmptyTrimmedString),
  photo: Schema.NullOr(
    Schema.Struct({
      url: UrlAsString,
      /** Author, license and source in one string, as Syntropedia writes it. */
      credit: Schema.NullOr(NonEmptyTrimmedString),
    }),
  ),
  updatedAt: Schema.String,
})

export type SyntropediaPlant = typeof SyntropediaPlant.Type

/**
 * Our closest usages. Some assert more than Syntropedia knows: a "Medicinal & Cosmetic" plant may
 * be only one of them. Pollinator support is one of the ecosystem services.
 */
const USAGES_BY_FUNCTION = {
  HUMAN_NUTRITION: ["HUMAN_FEED"],
  MEDICINAL_AND_COSMETIC: ["MEDICINAL", "COSMETIC"],
  AROMATIC_AND_CONDIMENT: ["HUMAN_FEED"],
  FORAGE: ["ANIMAL_FEED"],
  TIMBER: ["CONSTRUCTION"],
  FUEL: ["FUEL"],
  INDUSTRIAL_MATERIALS: ["INDUSTRIAL_MATERIAL"],
  BIOMASS: ["ORGANIC_MATTER"],
  NITROGEN_FIXATION: ["NITROGEN_FIXATION"],
  POLLINATOR_SUPPORT: ["ECOSYSTEM_SERVICE"],
  BIOCONTROL_AND_REPELLENT: ["BIOCONTROL"],
  ORNAMENTAL: ["ORNAMENTAL"],
} as const satisfies { readonly [Function in SyntropediaFunction]: ReadonlyArray<PlantUsage> }

/**
 * Our closest planting methods. A lumped group asserts each method it lumps ("Rhizomes/Tubers/
 * Bulbs" is all three), and root cuttings count as cuttings.
 */
const PLANTING_METHODS_BY_PROPAGATION = {
  SEEDS: ["SEED"],
  CUTTINGS: ["STEM_CUTTING"],
  GRAFTING: ["GRAFT"],
  LAYERING: ["LAYERING"],
  DIVISION: ["DIVISION"],
  OFFSETS: ["OFFSET"],
  STORAGE_ORGANS: ["RHIZOME", "TUBER", "BULB"],
} as const satisfies {
  readonly [Method in SyntropediaPropagationMethod]: ReadonlyArray<PlantingMethod>
}

const toCentimeters = ({ min, max }: MetersRange) => ({
  ...(min === undefined ? {} : { min: Length.meters(min) }),
  ...(max === undefined ? {} : { max: Length.meters(max) }),
})

export const Syntropedia = {
  /** Names in languages we write in, Syntropedia's order kept within each language. */
  names: (
    plant: SyntropediaPlant,
  ): ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: string }> =>
    Record.toEntries(plant.names).flatMap(([tag, names]) =>
      Option.toArray(supportedLanguageOf(tag)).flatMap((language) =>
        names.map((value) => ({ language, value })),
      ),
    ),

  /** The accepted name first, then the synonyms its comments list. */
  scientificNames: (plant: SyntropediaPlant): ReadonlyArray<string> => [
    plant.scientificName,
    ...plant.scientificNameSynonyms,
  ],

  plantUsages: (plant: SyntropediaPlant): ReadonlyArray<PlantUsage> =>
    EffectArray.dedupe(plant.functions.flatMap((name) => USAGES_BY_FUNCTION[name])),

  plantingMethods: (plant: SyntropediaPlant): ReadonlyArray<PlantingMethod> =>
    EffectArray.dedupe(
      plant.propagationMethods.flatMap((method) => PLANTING_METHODS_BY_PROPAGATION[method]),
    ),

  /** Roles are per tested site in Syntropedia; a role in any site is the plant's. */
  agroforestryRoles: (plant: SyntropediaPlant): ReadonlyArray<AgroforestryRole> =>
    EffectArray.dedupe(plant.testedSites.flatMap(({ roles }) => roles)),

  height: (plant: SyntropediaPlant) =>
    Option.fromNullishOr(plant.heightInMeters).pipe(Option.map(toCentimeters)),

  crownDiameter: (plant: SyntropediaPlant) =>
    Option.fromNullishOr(plant.crownDiameterInMeters).pipe(Option.map(toCentimeters)),
}
