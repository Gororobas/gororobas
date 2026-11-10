#!/usr/bin/env npx tsx
/**
 * Turns the dump of Syntropedia's offline catalogue (`dump-indexed-db.js`) into
 * `SyntropediaPlant`s: our names, our enums, numbers instead of strings, and nothing the app
 * leaves empty for every plant. See README.md in this folder.
 *
 * Usage: pnpm --filter @gororobas/server syntropedia:normalize
 *
 * Labels it doesn't recognize are reported and left out, so a new Syntropedia category shows up
 * here instead of turning into a wrong value.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  MetersRange,
  SyntropediaPlant,
  type SyntropediaPropagationMethod,
  type SyntropediaFunction,
  type SyntropediaTestedSite,
} from "@gororobas/domain/claim-based-architecture-experiment/providers/syntropedia"
import type {
  AgroforestryRole,
  AgroforestryStratum,
  ClimateZone,
  CrownShape,
  GrowthForm,
  GrowthRate,
  LeafPersistence,
  PruningResponse,
  SeedStorageBehavior,
  SuccessionalGroup,
} from "@gororobas/domain/common/enums"
import { SyntropediaPlantId } from "@gororobas/domain/common/external-identifiers"
import {
  Array as EffectArray,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Record,
  Result,
  Schema,
} from "effect"

const RawLocation = Schema.Struct({
  country: Schema.String,
  state: Schema.String,
  city: Schema.String,
  display: Schema.String,
  lat: Schema.NullOr(Schema.Finite),
  lng: Schema.NullOr(Schema.Finite),
})

/** Per tested location: the same plant, with the location and its nurse/mother tree role. */
const RawLocationProfile = Schema.Struct({
  nurse_mother_tree: Schema.String,
  tested_locations: Schema.Array(RawLocation),
})

/** The fields of an asset this script reads; the rest are empty for every plant. */
const RawAsset = Schema.Struct({
  id: Schema.Int,
  nome_cientifico: Schema.String,
  common_name_translations: Schema.Record(Schema.String, Schema.String),
  familia: Schema.String,
  estrato: Schema.String,
  grupo_eco: Schema.String,
  growth_form: Schema.String,
  growth_rate: Schema.String,
  resposta_poda: Schema.String,
  perda_foliar: Schema.String,
  altura: Schema.String,
  crown_diameter_m: Schema.String,
  tree_crown_form: Schema.String,
  bioma_ocorrencia: Schema.String,
  funcoes: Schema.String,
  formas_propagacao: Schema.String,
  dormencia: Schema.String,
  armazenamento: Schema.String,
  nurse_mother_tree: Schema.String,
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field -- Syntropedia's field name.
  tested_in_agroforestry: Schema.Boolean,
  tested_locations: Schema.Array(RawLocation),
  tested_location_profiles: Schema.Array(RawLocationProfile),
  comment: Schema.String,
  main_image_url: Schema.String,
  foto_fonte: Schema.String,
  updated_at: Schema.String,
})

type RawAsset = typeof RawAsset.Type

const RawDump = Schema.Struct({
  exportedAt: Schema.String,
  origin: Schema.String,
  manifests: Schema.Record(
    Schema.String,
    Schema.Struct({ revision_id: Schema.String, total_catalog_assets: Schema.Finite }),
  ),
  assets: Schema.Array(RawAsset),
})

const SyntropediaPlants = Schema.Struct({
  source: Schema.String,
  exportedAt: Schema.String,
  /** Revisions per language, to tell whether a new dump changed anything. */
  revisions: Schema.Record(Schema.String, Schema.String),
  plants: Schema.Array(SyntropediaPlant),
  issues: Schema.Array(
    Schema.Struct({ plantId: Schema.String, field: Schema.String, value: Schema.String }),
  ),
})

// Labels as Syntropedia writes them, compared lowercased.

const STRATA = {
  emergent: ["EMERGENT"],
  "high-emergent": ["HIGH", "EMERGENT"],
  high: ["HIGH"],
  "medium-high": ["MEDIUM", "HIGH"],
  medium: ["MEDIUM"],
  "low-medium": ["LOW", "MEDIUM"],
  low: ["LOW"],
} as const satisfies Record<string, ReadonlyArray<AgroforestryStratum>>

const SUCCESSIONAL_GROUPS = {
  "placenta i": "PLACENTA_1",
  "placenta ii": "PLACENTA_2",
  "secondary i": "SECONDARY_1",
  "secondary ii": "SECONDARY_2",
  climax: "CLIMAX",
} as const satisfies Record<string, SuccessionalGroup>

const GROWTH_FORMS = {
  tree: "TREE",
  shrub: "SHRUB",
  herb: "HERB",
  vine: "VINE",
  graminoid: "GRAMINOID",
} as const satisfies Record<string, GrowthForm>

const GROWTH_RATES = {
  slow: "SLOW",
  moderate: "MODERATE",
  fast: "FAST",
} as const satisfies Record<string, GrowthRate>

const PRUNING_RESPONSES = {
  good: "GOOD",
  moderate: "MODERATE",
  poor: "POOR",
  "no pruning tolerance": "INTOLERANT",
} as const satisfies Record<string, PruningResponse>

const LEAF_PERSISTENCES = {
  evergreen: "EVERGREEN",
  "semi-deciduous": "SEMI_DECIDUOUS",
  deciduous: "DECIDUOUS",
} as const satisfies Record<string, LeafPersistence>

const CROWN_SHAPES = {
  rounded: "ROUNDED",
  spreading: "SPREADING",
  "umbrella-shaped": "UMBRELLA",
  conical: "CONICAL",
  irregular: "IRREGULAR",
} as const satisfies Record<string, CrownShape>

const CLIMATE_ZONES = {
  tropical: "TROPICAL",
  subtropical: "SUBTROPICAL",
  // A typo in a handful of plants.
  subropical: "SUBTROPICAL",
  mediterranean: "MEDITERRANEAN",
  temperate: "TEMPERATE",
  "semi-arid": "SEMI_ARID",
  arid: "ARID",
} as const satisfies Record<string, ClimateZone>

const SEED_STORAGE_BEHAVIORS = {
  orthodox: "ORTHODOX",
  intermediate: "INTERMEDIATE",
  recalcitrant: "RECALCITRANT",
} as const satisfies Record<string, SeedStorageBehavior>

const FUNCTIONS = {
  "human nutrition": "HUMAN_NUTRITION",
  "medicinal & cosmetic": "MEDICINAL_AND_COSMETIC",
  "aromatic & condiment": "AROMATIC_AND_CONDIMENT",
  forage: "FORAGE",
  timber: "TIMBER",
  fuel: "FUEL",
  "industrial materials": "INDUSTRIAL_MATERIALS",
  "biomass producer": "BIOMASS",
  "nitrogen fixation": "NITROGEN_FIXATION",
  "pollinator & honeybee support": "POLLINATOR_SUPPORT",
  "biocontrol & repellant": "BIOCONTROL_AND_REPELLENT",
  ornamental: "ORNAMENTAL",
} as const satisfies Record<string, SyntropediaFunction>

const TOXICITY_WARNING = "toxicity warning"

const PROPAGATION_METHODS = {
  seeds: "SEEDS",
  "cuttings (stem, root)": "CUTTINGS",
  "grafting/budding": "GRAFTING",
  "layering (tip, air)": "LAYERING",
  "division (root, crown)": "DIVISION",
  "suckers/runners/bulbils": "OFFSETS",
  "rhizomes/tubers/bulbs": "STORAGE_ORGANS",
} as const satisfies Record<string, SyntropediaPropagationMethod>

const AGROFORESTRY_ROLES = {
  "nurse tree": ["NURSE_TREE"],
  "mother tree": ["MOTHER_TREE"],
  "nurse + mother tree": ["NURSE_TREE", "MOTHER_TREE"],
  // Syntropedia's filter offers "false" for trees with neither role.
  false: [],
} as const satisfies Record<string, ReadonlyArray<AgroforestryRole>>

const SYNONYM_PATTERN = /syn\. scientific name:\s*([^.;\n]+)\.?/gi

interface Issue {
  readonly plantId: string
  readonly field: string
  readonly value: string
}

const normalizePlant = (asset: RawAsset, report: (issue: Issue) => void): SyntropediaPlant => {
  const plantId = String(asset.id)
  const blankToNull = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim()
    return trimmed === "" ? null : trimmed
  }

  /** Each value of a label list, read with `labels`; unknown ones are reported and left out. */
  const listOf = <A>({
    field,
    value,
    labels,
    // "Cuttings (stem, root)": commas inside parentheses don't separate values.
    separator = /,(?![^(]*\))/,
  }: {
    readonly field: keyof RawAsset
    readonly value: string
    readonly labels: Readonly<Record<string, A>>
    readonly separator?: RegExp
  }): ReadonlyArray<A> =>
    value
      .split(separator)
      .map((label) => label.trim())
      .filter((label) => label !== "")
      .flatMap((label) => {
        const known = Option.fromNullishOr(labels[label.toLowerCase()])
        if (Option.isNone(known)) report({ plantId, field, value: label })
        return EffectArray.fromOption(known)
      })

  const oneOf = <A>(options: {
    readonly field: keyof RawAsset
    readonly value: string
    readonly labels: Readonly<Record<string, A>>
  }) => Option.getOrNull(EffectArray.head(listOf(options)))

  /** "10-20", or a single number read as the maximum: "30" is "up to 30 meters". */
  const metersRange = (field: keyof RawAsset, value: string): MetersRange | null => {
    const trimmed = value.trim()
    if (trimmed === "") return null

    const [min, max] = trimmed.includes("-")
      ? trimmed.split("-").map(Number)
      : [undefined, Number(trimmed)]

    return Result.match(
      Schema.decodeResult(MetersRange)({
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      }),
      {
        onFailure: () => {
          report({ plantId, field, value })
          return null
        },
        onSuccess: (range) => range,
      },
    )
  }

  const functionLabels = asset.funcoes.split(",").map((label) => label.trim().toLowerCase())
  const synonyms = [...asset.comment.matchAll(SYNONYM_PATTERN)].flatMap(([, name]) =>
    Option.toArray(Option.fromNullishOr(name === undefined ? null : blankToNull(name))),
  )

  /** Roles are per location profile (the same plant once per location); a site without one takes the plant's. */
  const testedSites = asset.tested_locations.map((location): SyntropediaTestedSite => {
    const profile = asset.tested_location_profiles.find((candidate) =>
      candidate.tested_locations.some((other) => other.display === location.display),
    )
    const role = blankToNull(profile?.nurse_mother_tree ?? asset.nurse_mother_tree)

    return {
      country: location.country.trim(),
      state: blankToNull(location.state),
      city: blankToNull(location.city),
      coordinates:
        location.lat === null || location.lng === null
          ? null
          : { latitude: location.lat, longitude: location.lng },
      roles:
        role === null
          ? []
          : EffectArray.flatten(
              listOf({
                field: "nurse_mother_tree",
                value: role,
                labels: AGROFORESTRY_ROLES,
                separator: /$^/,
              }),
            ),
    }
  })

  return {
    id: SyntropediaPlantId.make(plantId),
    scientificName: asset.nome_cientifico.replace(/\s+/g, " ").trim(),
    scientificNameSynonyms: synonyms,
    family: blankToNull(asset.familia),
    names: Record.map(asset.common_name_translations, (names) =>
      EffectArray.dedupe(
        names.split(",").flatMap((name) => Option.toArray(Option.fromNullishOr(blankToNull(name)))),
      ),
    ),
    strata: EffectArray.flatten(listOf({ field: "estrato", value: asset.estrato, labels: STRATA })),
    successionalGroup: oneOf({
      field: "grupo_eco",
      value: asset.grupo_eco,
      labels: SUCCESSIONAL_GROUPS,
    }),
    growthForm: oneOf({ field: "growth_form", value: asset.growth_form, labels: GROWTH_FORMS }),
    growthRate: oneOf({ field: "growth_rate", value: asset.growth_rate, labels: GROWTH_RATES }),
    pruningResponse: oneOf({
      field: "resposta_poda",
      value: asset.resposta_poda,
      labels: PRUNING_RESPONSES,
    }),
    leafPersistence: oneOf({
      field: "perda_foliar",
      value: asset.perda_foliar,
      labels: LEAF_PERSISTENCES,
    }),
    heightInMeters: metersRange("altura", asset.altura),
    crownDiameterInMeters: metersRange("crown_diameter_m", asset.crown_diameter_m),
    crownShape: oneOf({
      field: "tree_crown_form",
      value: asset.tree_crown_form,
      labels: CROWN_SHAPES,
    }),
    climateZones: EffectArray.dedupe(
      listOf({ field: "bioma_ocorrencia", value: asset.bioma_ocorrencia, labels: CLIMATE_ZONES }),
    ),
    functions: listOf({
      field: "funcoes",
      value: functionLabels.filter((label) => label !== TOXICITY_WARNING).join(","),
      labels: FUNCTIONS,
    }),
    hasToxicityWarning: functionLabels.includes(TOXICITY_WARNING),
    propagationMethods: listOf({
      field: "formas_propagacao",
      value: asset.formas_propagacao,
      labels: PROPAGATION_METHODS,
    }),
    seedDormancy: oneOf({
      field: "dormencia",
      value: asset.dormencia,
      labels: { yes: true, no: false },
    }),
    seedStorageBehavior: oneOf({
      field: "armazenamento",
      value: asset.armazenamento,
      labels: SEED_STORAGE_BEHAVIORS,
    }),
    wasTestedInAgroforestry: asset.tested_in_agroforestry,
    testedSites,
    comment: blankToNull(asset.comment.replace(SYNONYM_PATTERN, "")),
    photo:
      blankToNull(asset.main_image_url) === null
        ? null
        : { url: asset.main_image_url.trim(), credit: blankToNull(asset.foto_fonte) },
    updatedAt: asset.updated_at,
  }
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const folder = path.join(import.meta.dirname)
  const input = path.join(folder, "syntropedia-indexed-db.json")
  const output = path.join(folder, "syntropedia-plants.json")

  const dump = yield* Schema.decodeEffect(Schema.fromJsonString(RawDump))(
    yield* fs.readFileString(input),
  )

  const issues: Array<Issue> = []
  const plants = EffectArray.sort(
    dump.assets.map((asset) => normalizePlant(asset, (issue) => issues.push(issue))),
    Order.mapInput(Order.Number, (plant: SyntropediaPlant) => Number(plant.id)),
  )

  yield* fs.writeFileString(
    output,
    yield* Schema.encodeEffect(Schema.fromJsonString(SyntropediaPlants, { space: 2 }))({
      source: dump.origin,
      exportedAt: dump.exportedAt,
      revisions: Record.map(dump.manifests, ({ revision_id }) => revision_id),
      plants,
      issues,
    }),
  )

  yield* Effect.log(`Wrote ${plants.length} plants to ${output}`)

  yield* Effect.forEach(
    issues,
    (issue) =>
      Effect.logWarning(`Plant ${issue.plantId}: unrecognized ${issue.field} "${issue.value}"`),
    { concurrency: 1, discard: true },
  )
})

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)))
