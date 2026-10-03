import { it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { expect, test } from "vitest"

import {
  EntityReferenceAttributes,
  ExternalEmbed,
  MediaGridItem,
  TiptapDocument,
} from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { largeTiptapDocument } from "../fixtures/large-tiptap-document.js"

const decode = Schema.decodeUnknownSync(TiptapDocument)
const maybeDecode = Schema.decodeUnknownOption(TiptapDocument, { onExcessProperty: "error" })

it.effect("enforces block/inline boundaries, text leaves and list-item structure", () =>
  assertPropertyEffect(Arbitrary.schema(EntityReferenceAttributes), (attrs) =>
    Effect.sync(() => {
      const reference = { type: "entityReference", attrs }
      const text = { type: "text", text: "Hoje com " }
      const paragraph = { type: "paragraph", content: [text, reference, { type: "hardBreak" }] }
      const valid = { type: "doc", version: 1, content: [paragraph] }
      expect(Option.isSome(maybeDecode(valid))).toBe(true)
      for (const content of [
        [reference],
        [text],
        [{ type: "hardBreak" }],
        [{ type: "paragraph", content: [paragraph] }],
        [{ type: "paragraph", content: [{ ...text, content: [reference] }] }],
        [{ type: "paragraph", content: [{ ...reference, content: [text] }] }],
        [{ type: "paragraph", content: [{ ...reference, marks: [{ type: "bold" }] }] }],
        [{ type: "listItem", content: [paragraph] }],
        [{ type: "bulletList", content: [paragraph] }],
        [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "heading", attrs: { level: 1 }, content: [text] }],
              },
            ],
          },
        ],
        [{ type: "codeBlock", content: [reference] }],
        [{ type: "codeBlock", content: [{ ...text, marks: [{ type: "bold" }] }] }],
        [{ type: "blockquote", content: [] }],
      ])
        expect(Option.isNone(maybeDecode({ ...valid, content }))).toBe(true)
      expect(
        Option.isSome(
          maybeDecode({
            ...valid,
            content: [
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      paragraph,
                      { type: "bulletList", content: [{ type: "listItem", content: [paragraph] }] },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
      ).toBe(true)
      return true
    }),
  ),
)

it.effect("preserves provider data and captions without accepting mismatched providers", () =>
  assertPropertyEffect(Arbitrary.schema(ExternalEmbed), (embed) =>
    Effect.sync(() => {
      const document = {
        type: "doc",
        version: 1,
        content: [{ type: "mediaGrid", attrs: { version: 1, items: [embed] } }],
      }
      expect(decode(document)).toEqual(document)
      expect(
        Option.isNone(
          Schema.decodeUnknownOption(MediaGridItem)({
            ...embed,
            provider: embed.provider === "YOUTUBE" ? "SPOTIFY" : "YOUTUBE",
          }),
        ),
      ).toBe(true)
      for (const extra of [{ content: [] }, { text: "invalid" }, { marks: [] }]) {
        expect(
          Option.isNone(
            maybeDecode({ ...document, content: [{ ...document.content[0], ...extra }] }),
          ),
        ).toBe(true)
      }
      return true
    }),
  ),
)

test("decodes a huge document and still validates its final inline node", () => {
  // 250,000 inline/text-block nodes plus nested lists and blockquotes; no machine-dependent timing assertion.
  const source = largeTiptapDocument(50_000)
  const decoded = decode(source)
  expect(decoded.content).toHaveLength(50_000)
  expect(decoded.content[0]).toEqual(source.content[0])
  expect(decoded.content[49_999]).toEqual(source.content[49_999])
  const finalParagraph = source.content[49_999]
  if (finalParagraph.type !== "paragraph") throw new Error("Expected the final paragraph")
  const invalid = {
    ...source,
    content: [
      ...source.content.slice(0, -1),
      {
        ...finalParagraph,
        content: [...finalParagraph.content, { type: "text", text: "" }],
      },
    ],
  }
  expect(Option.isNone(maybeDecode(invalid))).toBe(true)
})
