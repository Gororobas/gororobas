import { WikidataId } from "@gororobas/domain"
import { Schema } from "effect"

/**
 * The `entity-type` and `numeric-id` members of a value are deprecated decorations around `id`
 * and are absent in several serialization contexts, so only `id` is required.
 */
const EntityId = Schema.Struct({
  entityType: Schema.optional(Schema.String),
  numericId: Schema.optional(Schema.Int),
  id: Schema.String,
}).pipe(Schema.encodeKeys({ entityType: "entity-type", numericId: "numeric-id" }))

/**
 * Point in time in Wikibase's own format: a `+YYYY-MM-DDThh:mm:ssZ` string with explicit
 * calendar uncertainty, not an ISO instant. `timezone`/`before`/`after` are omitted for values
 * whose uncertainty the serializer does not report.
 */
const Time = Schema.Struct({
  time: Schema.String,
  timezone: Schema.optional(Schema.Int),
  before: Schema.optional(Schema.Int),
  after: Schema.optional(Schema.Int),
  precision: Schema.optional(Schema.Int),
  calendarmodel: Schema.optional(Schema.String),
})

const MonolingualText = Schema.Struct({
  text: Schema.String,
  language: Schema.String,
})

const Quantity = Schema.Struct({
  amount: Schema.String,
  unit: Schema.optional(Schema.String),
})

const GeoCoordinate = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
  globe: Schema.optional(Schema.String),
  precision: Schema.optional(Schema.Number),
})

/**
 * The shape of `value` is decided by `type`, so the datavalue is a union keyed on that literal.
 * Unrecognized value types fall through to an opaque member rather than failing the fetch.
 */
const DataValue = Schema.Union([
  // Serialized datavalues are tagged with their *datatype* name, not the `wikibase-*` prefix used
  // by the datatype: URLs arrive as "url" and Commons files as "commonsMedia".
  Schema.Struct({
    type: Schema.Literals([
      "string",
      "external-id",
      "url",
      "uri",
      "commonsMedia",
      "musical-notation",
    ]),
    value: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("monolingualtext"), value: MonolingualText }),
  Schema.Struct({ type: Schema.Literal("time"), value: Time }),
  Schema.Struct({ type: Schema.Literal("quantity"), value: Quantity }),
  Schema.Struct({ type: Schema.Literal("globecoordinate"), value: GeoCoordinate }),
  Schema.Struct({
    type: Schema.Literals([
      "wikibase-item",
      "wikibase-property",
      "wikibase-lexeme",
      "wikibase-entityschema",
      "wikibase-form",
      "wikibase-sense",
    ]),
    value: EntityId,
  }),
  /**
   * Last resort for the value types we do not model (`geo-shape`, `math`, `tabular-data`, ...).
   * An exotic claim value must not fail the whole entity fetch and cost us the claims we do
   * understand, so the datavalue is kept with an opaque value instead. Members are matched in
   * order, so this never shadows a modeled type.
   */
  Schema.Struct({ type: Schema.String, value: Schema.Unknown }),
])

/**
 * `novalue` and `somevalue` snaks deliberately carry no `datavalue`; the type of the value is
 * only constrained by the snak's `datatype` property.
 */
const Snak = Schema.Struct({
  snaktype: Schema.Literals(["value", "novalue", "somevalue"]),
  property: Schema.String,
  hash: Schema.optional(Schema.String),
  datatype: Schema.optional(Schema.String),
  datavalue: Schema.optional(DataValue),
})

const Reference = Schema.Struct({
  hash: Schema.optional(Schema.String),
  snaks: Schema.Record(Schema.String, Schema.Array(Snak)),
  snaksOrder: Schema.optional(Schema.Array(Schema.String)),
}).pipe(Schema.encodeKeys({ snaksOrder: "snaks-order" }))

const Claim = Schema.Struct({
  type: Schema.optional(Schema.Literals(["statement", "novalue", "somevalue"])),
  mainsnak: Snak,
  rank: Schema.Literals(["preferred", "normal", "deprecated"]),
  id: Schema.optional(Schema.String),
  hash: Schema.optional(Schema.String),
  qualifiers: Schema.optional(Schema.Record(Schema.String, Schema.Array(Snak))),
  qualifiersOrder: Schema.optional(Schema.Array(Schema.String)),
  references: Schema.optional(Schema.Array(Reference)),
}).pipe(Schema.encodeKeys({ qualifiersOrder: "qualifiers-order" }))

const Label = Schema.Struct({
  language: Schema.String,
  value: Schema.String,
})

const Sitelink = Schema.Struct({
  site: Schema.String,
  title: Schema.String,
  url: Schema.String,
  badges: Schema.optional(Schema.Array(Schema.String)),
})

/**
 * Properties, Lexemes and EntitySchemas share the `entities` envelope with Items, and
 * `Special:EntityData` additionally reports the MediaWiki page the entity was loaded from.
 */
export const WikidataEntity = Schema.Struct({
  id: WikidataId,
  type: Schema.optional(Schema.Literals(["item", "property", "lexeme", "entityschema"])),
  labels: Schema.optional(Schema.Record(Schema.String, Label)),
  descriptions: Schema.optional(Schema.Record(Schema.String, Label)),
  aliases: Schema.optional(Schema.Record(Schema.String, Schema.Array(Label))),
  // Always present for the Items this service fetches, though possibly empty. Lexemes and
  // EntitySchemas, which share the envelope, carry neither.
  claims: Schema.Record(Schema.String, Schema.Array(Claim)),
  sitelinks: Schema.Record(Schema.String, Sitelink),
  pageid: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  ns: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  title: Schema.optional(Schema.String),
  lastrevid: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  // `lastmod` in the Action API, `modified` in Special:EntityData.
  lastmod: Schema.optional(Schema.String),
  modified: Schema.optional(Schema.String),
  redirected: Schema.optional(Schema.Boolean),
})

export const WikidataResponse = Schema.Struct({
  entities: Schema.Record(Schema.String, WikidataEntity),
})
