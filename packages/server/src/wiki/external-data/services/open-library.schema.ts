import { Schema } from "effect"

/** Reference to another Open Library entity, e.g. `{"key": "/languages/eng"}`. */
const Reference = Schema.Struct({ key: Schema.String })

/**
 * Free text fields are serialized inconsistently: the same field arrives as a typed
 * `{"type": "/type/text", "value": "..."}` object on some editions and as a bare string on
 * others, so both forms have to decode.
 */
const Text = Schema.Union([
  Schema.String,
  Schema.Struct({ type: Schema.optional(Schema.String), value: Schema.String }),
])

const DateTime = Schema.Struct({
  type: Schema.optional(Schema.String),
  value: Schema.String,
})

const Contributor = Schema.Struct({
  role: Schema.optional(Schema.String),
  name: Schema.String,
})

const TableOfContentsItem = Schema.Struct({
  type: Schema.optional(Reference),
  title: Schema.optional(Schema.String),
  number: Schema.optional(Schema.String),
  level: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
})

/**
 * Open Library accepts editions from libraries, publishers and booksellers that each invent their
 * own vocabulary, so `identifiers` and `classifications` are open-ended maps of label to values
 * rather than a fixed set of keys. Both are also frequently present but empty (`{}`).
 */
const LabelsToValues = Schema.Record(Schema.String, Schema.Array(Schema.String))

/**
 * Editions omit every field they have no value for, so only `key` and `title` are required.
 * `covers` uses `-1` as a placeholder for "no cover available".
 */
export const OpenLibraryEdition = Schema.Struct({
  key: Schema.String,
  title: Schema.String,
  type: Schema.optional(Reference),
  subtitle: Schema.optional(Schema.String),
  fullTitle: Schema.optional(Schema.String),
  editionName: Schema.optional(Schema.String),
  publishDate: Schema.optional(Schema.String),
  publishCountry: Schema.optional(Schema.String),
  publishPlaces: Schema.optional(Schema.Array(Schema.String)),
  publishers: Schema.optional(Schema.Array(Schema.String)),
  series: Schema.optional(Schema.Array(Schema.String)),
  numberOfPages: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  pagination: Schema.optional(Schema.String),
  physicalFormat: Schema.optional(Schema.String),
  physicalDimensions: Schema.optional(Schema.String),
  weight: Schema.optional(Schema.String),
  byStatement: Schema.optional(Schema.String),
  description: Schema.optional(Text),
  notes: Schema.optional(Text),
  firstSentence: Schema.optional(Text),
  tableOfContents: Schema.optional(Schema.Array(TableOfContentsItem)),
  language: Schema.optional(Text),
  languages: Schema.optional(Schema.Array(Reference)),
  translatedFrom: Schema.optional(Schema.Array(Reference)),
  translationOf: Schema.optional(Schema.String),
  authors: Schema.optional(
    Schema.Array(Schema.Struct({ key: Schema.String, name: Schema.optional(Schema.String) })),
  ),
  contributors: Schema.optional(Schema.Array(Contributor)),
  contributions: Schema.optional(Schema.Array(Schema.String)),
  works: Schema.optional(Schema.Array(Reference)),
  workTitles: Schema.optional(Schema.Array(Schema.String)),
  otherTitles: Schema.optional(Schema.Array(Schema.String)),
  subjects: Schema.optional(Schema.Array(Schema.String)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  classifications: Schema.optional(LabelsToValues),
  identifiers: Schema.optional(LabelsToValues),
  lccn: Schema.optional(Schema.Array(Schema.String)),
  oclcNumbers: Schema.optional(Schema.Array(Schema.String)),
  lcClassifications: Schema.optional(Schema.Array(Schema.String)),
  deweyDecimalClass: Schema.optional(Schema.Array(Schema.String)),
  isbn10: Schema.optional(Schema.Array(Schema.String)),
  isbn13: Schema.optional(Schema.Array(Schema.String)),
  covers: Schema.optional(Schema.Array(Schema.Int)),
  ocaid: Schema.optional(Schema.String),
  iaBoxId: Schema.optional(Schema.Array(Schema.String)),
  localId: Schema.optional(Schema.Array(Schema.String)),
  sourceRecords: Schema.optional(Schema.Array(Schema.String)),
  copyrightDate: Schema.optional(Schema.String),
  created: Schema.optional(DateTime),
  lastModified: Schema.optional(DateTime),
  revision: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  latestRevision: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
}).pipe(
  Schema.encodeKeys({
    fullTitle: "full_title",
    editionName: "edition_name",
    publishDate: "publish_date",
    publishCountry: "publish_country",
    publishPlaces: "publish_places",
    numberOfPages: "number_of_pages",
    physicalFormat: "physical_format",
    physicalDimensions: "physical_dimensions",
    byStatement: "by_statement",
    firstSentence: "first_sentence",
    tableOfContents: "table_of_contents",
    translatedFrom: "translated_from",
    translationOf: "translation_of",
    workTitles: "work_titles",
    otherTitles: "other_titles",
    oclcNumbers: "oclc_numbers",
    lcClassifications: "lc_classifications",
    deweyDecimalClass: "dewey_decimal_class",
    isbn10: "isbn_10",
    isbn13: "isbn_13",
    iaBoxId: "ia_box_id",
    localId: "local_id",
    sourceRecords: "source_records",
    copyrightDate: "copyright_date",
    lastModified: "last_modified",
    latestRevision: "latest_revision",
  }),
)

export const OpenLibraryEditionsPage = Schema.Struct({
  entries: Schema.Array(OpenLibraryEdition),
  size: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  links: Schema.Struct({
    self: Schema.optional(Schema.String),
    work: Schema.optional(Schema.String),
    next: Schema.optional(Schema.String),
  }),
})
