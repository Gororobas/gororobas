import { describe, expect, it } from "@effect/vitest"
import { Effect, Record, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { WikiArticleId } from "../../src/common/ids.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import { coreWikiArticleProjectionRowFields } from "../../src/wiki/kinds/define-kind.js"
import { WikiPlantCultivarArticleCrdtOperations } from "../../src/wiki/kinds/plant-cultivar.crdt.js"
import { CultivarProperty, WikiPlantCultivarArticle } from "../../src/wiki/kinds/plant-cultivar.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"
import {
  WikiArticleEditableData,
  WikiArticleKind,
  projectArticle,
} from "../../src/wiki/wiki-article.js"

const Attributes = WikiPlantCultivarArticle.EditableAttributes

describe("Plant cultivar wiki kind", () => {
  it.effect("new cultivars default every trait to explicit unknown", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(WikiArticleId),
      predicate: (parentPlantId) =>
        Effect.sync(() => {
          const attributes = Attributes.make({ parentPlantId })
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- This test deliberately supplies missing required fields.
          expect(() => Schema.decodeUnknownSync(Attributes)({ parentPlantId })).toThrow(/Missing/)
          return Record.toEntries(attributes).every(
            ([key, value]) => key === "parentPlantId" || deepEquals(value, { _tag: "Unknown" }),
          )
        }),
    }),
  )

  it("keeps unknown, inheritance, empty selections and literal values unambiguous", () => {
    const Property = CultivarProperty(Schema.Array(Schema.Literals(["HIGH", "LOW"])))
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- This decoder also tests deliberately malformed trait values.
    const decode = Schema.decodeUnknownSync(Property)
    expect(decode({ _tag: "Unknown" })).toEqual({ _tag: "Unknown" })
    expect(decode({ _tag: "Inherit" })).toEqual({ _tag: "Inherit" })
    expect(decode({ _tag: "Value", value: [] })).toEqual({ _tag: "Value", value: [] })
    expect(decode({ _tag: "Value", value: ["LOW"] })).toEqual({ _tag: "Value", value: ["LOW"] })

    const invalidValues = [
      undefined,
      null,
      "Inherit",
      "LOW",
      [],
      { _tag: "Value" },
      { _tag: "Value", value: ["OTHER"] },
    ]

    invalidValues.forEach((invalid) => {
      expect(() => decode(invalid)).toThrow(/Expected|Missing/)
    })
  })

  it("validates whole ranges and rejects reversed or incomplete endpoints", () => {
    const ranges = [
      Attributes.fields.height,
      Attributes.fields.developmentCycle,
      Attributes.fields.temperature,
    ]

    ranges.forEach((field) => {
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- This decoder also tests incomplete range endpoints.
      const decode = Schema.decodeUnknownSync(field)
      expect(() => decode({ _tag: "Value", value: { min: 5, max: 2 } })).toThrow(
        /minimum must not exceed maximum/,
      )
      expect(() => decode({ _tag: "Value", value: { max: 5 } })).toThrow(/Missing/)
      expect(() => decode({ _tag: "Value", value: { min: 2, max: 5 } })).not.toThrow()
    })

    expect(() =>
      Schema.decodeSync(Attributes.fields.temperature)({
        _tag: "Value",
        value: { min: 2, max: Infinity },
      }),
    ).toThrow(/finite/)
  })

  it.effect("explicit trait states round-trip through JSON without resolving parent data", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Attributes),
      predicate: (attributes) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(Schema.fromJsonString(Attributes))(attributes)
          const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Attributes))(json)
          return (
            deepEquals(attributes, decoded) &&
            deepEquals(attributes, WikiPlantCultivarArticle.projectAttributes(attributes))
          )
        }),
    }),
  )

  it.effect("participates in wiki decoding and projection", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          article: WikiPlantCultivarArticle.EditableArticle,
          metadata: Schema.Struct(coreWikiArticleProjectionRowFields),
        }),
      ),
      predicate: ({ article, metadata }) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(WikiPlantCultivarArticle.EditableArticle)(
            article,
          )
          const decoded = yield* Schema.decodeEffect(WikiArticleEditableData)(encoded)
          const projected = projectArticle(decoded, metadata)

          return (
            Schema.is(WikiArticleKind)("PLANT_CULTIVAR") &&
            projected.kind === "PLANT_CULTIVAR" &&
            deepEquals(projected.attributes, article.attributes)
          )
        }),
    }),
  )

  it.effect("registered edits atomically replace the selected property in the CRDT", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(WikiPlantCultivarArticleCrdtOperations.AttributeEdit),
      predicate: (edit) =>
        Effect.gen(function* () {
          const document = new LoroDoc()
          yield* WikiArticleCrdt.applyEdit(document, edit)
          const attributes = document.getMap("attributes").toJSON()
          const encoded = yield* Schema.encodeEffect(
            WikiPlantCultivarArticleCrdtOperations.AttributeEdit,
          )(edit)
          return (
            Record.keys(attributes).length === 1 &&
            deepEquals(Record.values(attributes)[0], encoded.value)
          )
        }),
    }),
  )

  it.effect(
    "changing a trait state replaces its previous value without affecting other traits",
    () =>
      Effect.gen(function* () {
        const document = new LoroDoc()
        const decode = Schema.decodeSync(WikiPlantCultivarArticleCrdtOperations.AttributeEdit)

        yield* WikiArticleCrdt.applyEdit(
          document,
          decode({
            _tag: "SetPlantCultivarUsage",
            value: { _tag: "Value", value: ["HUMAN_FEED"] },
          }),
        )

        yield* WikiArticleCrdt.applyEdit(
          document,
          decode({
            _tag: "SetPlantCultivarHeight",
            value: { _tag: "Value", value: { min: 100, max: 250 } },
          }),
        )

        yield* Effect.forEach(
          [{ _tag: "Inherit" }, { _tag: "Unknown" }, { _tag: "Value", value: [] }] as const,
          (state) =>
            Effect.gen(function* () {
              yield* WikiArticleCrdt.applyEdit(
                document,
                decode({ _tag: "SetPlantCultivarUsage", value: state }),
              )
              expect(document.getMap("attributes").get("usage")).toEqual(state)
              expect(document.getMap("attributes").get("height")).toEqual({
                _tag: "Value",
                value: { min: 100, max: 250 },
              })
            }),
          { concurrency: 1 },
        )
      }),
  )
})
