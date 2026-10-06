import { GbifTaxonId } from "@gororobas/domain"
import { Schema } from "effect"

const TaxonName = Schema.Struct({
  taxonId: Schema.String,
  scientificName: Schema.String,
  scientificNameAuthorship: Schema.optional(Schema.String),
  taxonRank: Schema.String,
  label: Schema.optional(Schema.String),
  taxonomicStatus: Schema.optional(Schema.String),
  nomenclaturalCode: Schema.optional(Schema.String),
}).pipe(Schema.encodeKeys({ taxonId: "taxonID" }))

export const TaxonMetadata = Schema.Struct({
  taxonId: Schema.String,
  scientificName: Schema.String,
  scientificNameAuthorship: Schema.optional(Schema.String),
  taxonRank: Schema.String,
  label: Schema.optional(Schema.String),
  datasetKey: Schema.optional(Schema.String),
  parentNameUsageId: Schema.optional(Schema.String),
  taxonomicStatus: Schema.optional(Schema.String),
  nomenclaturalCode: Schema.optional(Schema.String),
  references: Schema.optional(Schema.String),
  originalNameUsageId: Schema.optional(Schema.String),
  originalNameUsage: Schema.optional(Schema.String),
  namePublishedInId: Schema.optional(Schema.String),
  nameType: Schema.optional(Schema.String),
  genericName: Schema.optional(Schema.String),
  specificEpithet: Schema.optional(Schema.String),
  environment: Schema.optional(Schema.Array(Schema.String)),
  taxonomicGroup: Schema.optional(Schema.String),
  taxonRemarks: Schema.optional(Schema.String),
  checklistbankURL: Schema.optional(Schema.String),
  classification: Schema.Array(TaxonName),
  synonyms: Schema.optional(
    Schema.Struct({
      homotypic: Schema.optional(Schema.Array(TaxonName)),
      heterotypic: Schema.optional(Schema.Array(Schema.Array(TaxonName))),
      misapplied: Schema.optional(Schema.Array(TaxonName)),
    }),
  ),
  vernacularNames: Schema.optional(
    Schema.Array(
      Schema.Struct({
        vernacularName: Schema.String,
        language: Schema.optional(Schema.String),
        locality: Schema.optional(Schema.String),
      }),
    ),
  ),
  media: Schema.optional(Schema.Array(Schema.Json)),
  distributions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        locationId: Schema.optional(Schema.String),
        locality: Schema.optional(Schema.String),
      }).pipe(Schema.encodeKeys({ locationId: "locationID" })),
    ),
  ),
  bibliography: Schema.optional(
    Schema.Array(
      Schema.Struct({ referenceId: Schema.String, citation: Schema.String }).pipe(
        Schema.encodeKeys({ referenceId: "referenceID" }),
      ),
    ),
  ),
  measurementOrFacts: Schema.optional(Schema.Array(Schema.Json)),
  identifiers: Schema.optional(
    Schema.Array(
      Schema.Struct({
        scope: Schema.String,
        title: Schema.String,
        id: Schema.String,
        url: Schema.String,
      }),
    ),
  ),
}).pipe(
  Schema.encodeKeys({
    taxonId: "taxonID",
    parentNameUsageId: "parentNameUsageID",
    originalNameUsageId: "originalNameUsageID",
    namePublishedInId: "namePublishedInID",
  }),
)

const GbifOccurrenceTaxon = Schema.StructWithRest(
  Schema.Struct({
    key: Schema.String,
    name: Schema.String,
    rank: Schema.String,
    code: Schema.optional(Schema.String),
    authorship: Schema.optional(Schema.String),
    genericName: Schema.optional(Schema.String),
    specificEpithet: Schema.optional(Schema.String),
    formattedName: Schema.optional(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)

const GbifOccurrenceClassificationEntry = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  rank: Schema.String,
})

const GbifOccurrenceClassification = Schema.StructWithRest(
  Schema.Struct({
    usage: GbifOccurrenceTaxon,
    acceptedUsage: GbifOccurrenceTaxon,
    taxonomicStatus: Schema.String,
    classification: Schema.Array(GbifOccurrenceClassificationEntry),
    issues: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)

const GbifOccurrenceArea = Schema.Struct({ gid: Schema.String, name: Schema.String })

const GbifOccurrenceMedia = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.optional(Schema.String),
    format: Schema.optional(Schema.String),
    references: Schema.optional(Schema.String),
    created: Schema.optional(Schema.String),
    creator: Schema.optional(Schema.String),
    publisher: Schema.optional(Schema.String),
    license: Schema.optional(Schema.String),
    rightsHolder: Schema.optional(Schema.String),
    identifier: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)

const GbifOccurrenceExtension = Schema.StructWithRest(Schema.Struct({}), [
  Schema.Record(Schema.String, Schema.Json),
])

const GbifOccurrenceResult = Schema.Struct({
  key: Schema.Number,
  datasetKey: Schema.optional(Schema.String),
  publishingOrgKey: Schema.optional(Schema.String),
  datasetCategory: Schema.optional(Schema.Array(Schema.String)),
  installationKey: Schema.optional(Schema.String),
  hostingOrganizationKey: Schema.optional(Schema.String),
  publishingCountry: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.String),
  lastCrawled: Schema.optional(Schema.String),
  lastParsed: Schema.optional(Schema.String),
  crawlId: Schema.optional(Schema.Number),
  projectId: Schema.optional(Schema.String),
  extensions: Schema.optional(Schema.Record(Schema.String, Schema.Array(GbifOccurrenceExtension))),
  classifications: Schema.optional(Schema.Record(Schema.String, GbifOccurrenceClassification)),
  taxonKey: Schema.optional(Schema.Number),
  acceptedTaxonKey: Schema.optional(Schema.Number),
  scientificName: Schema.optional(Schema.String),
  scientificNameAuthorship: Schema.optional(Schema.String),
  acceptedScientificName: Schema.optional(Schema.String),
  taxonRank: Schema.optional(Schema.String),
  taxonomicStatus: Schema.optional(Schema.String),
  decimalLatitude: Schema.optional(Schema.Number),
  decimalLongitude: Schema.optional(Schema.Number),
  coordinateUncertaintyInMeters: Schema.optional(Schema.Number),
  gadm: Schema.optional(Schema.Record(Schema.String, GbifOccurrenceArea)),
  year: Schema.optional(Schema.Number),
  month: Schema.optional(Schema.Number),
  day: Schema.optional(Schema.Number),
  eventDate: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Schema.String)),
  modified: Schema.optional(Schema.String),
  lastInterpreted: Schema.optional(Schema.String),
  references: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  isSequenced: Schema.optional(Schema.Boolean),
  identifiers: Schema.optional(
    Schema.Array(
      Schema.StructWithRest(Schema.Struct({ identifier: Schema.String }), [
        Schema.Record(Schema.String, Schema.Json),
      ]),
    ),
  ),
  media: Schema.optional(Schema.Array(GbifOccurrenceMedia)),
  facts: Schema.optional(Schema.Array(Schema.Json)),
  relations: Schema.optional(Schema.Array(Schema.Json)),
  isInCluster: Schema.optional(Schema.Boolean),
  datasetName: Schema.optional(Schema.String),
})

export const GbifOccurrences = Schema.Struct({
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field -- GBIF names this API response field endOfRecords.
  endOfRecords: Schema.Boolean,
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  results: Schema.Array(GbifOccurrenceResult),
  facets: Schema.Array(Schema.Json),
})

export const SpeciesMatch = Schema.Struct({
  usage: Schema.optional(Schema.Struct({ key: GbifTaxonId })),
})
