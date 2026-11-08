import { expect, it } from "@effect/vitest"
import { Array as EffectArray, Equal, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { assertProperty } from "../testing.js"
import { nodeIdOf } from "./node-ids.js"
import { plainTextToTiptapDocument } from "./plain-text.js"
import { tiptapToText } from "./tiptap-to-text.js"

/** Words without line breaks, so paragraphs and lines are what the arbitrary builds. */
const Line = Schema.String.check(Schema.isPattern(/^[a-zà-ú][a-zà-ú ]{0,20}[a-zà-ú]$/))
const Paragraph = Schema.Array(Line).check(Schema.isMinLength(1), Schema.isMaxLength(3))
const Paragraphs = Schema.Array(Paragraph).check(Schema.isMinLength(1), Schema.isMaxLength(4))

const asText = (paragraphs: typeof Paragraphs.Type) =>
  paragraphs.map((lines) => lines.join("\n")).join("\n\n")

it("plain text survives becoming a document and back", () => {
  assertProperty({
    arbitrary: Arbitrary.schema(Paragraphs),
    predicate: (paragraphs) => {
      const document = Option.getOrThrow(plainTextToTiptapDocument(asText(paragraphs)))
      expect(tiptapToText(document)).toBe(asText(paragraphs))
      return true
    },
  })
})

it("paragraphs keep the IDs of the document they were edited from", () => {
  assertProperty({
    arbitrary: Arbitrary.schema(Paragraphs),
    predicate: (paragraphs) => {
      const original = Option.getOrThrow(plainTextToTiptapDocument(asText(paragraphs)))
      const edited = Option.getOrThrow(
        plainTextToTiptapDocument(`${asText(paragraphs)} edited`, { referenceContent: original }),
      )

      edited.content.forEach((node, index) => {
        expect(Option.isSome(nodeIdOf(node))).toBe(true)

        expect(
          Equal.equals(
            nodeIdOf(node),
            Option.flatMap(EffectArray.get(original.content, index), nodeIdOf),
          ),
        ).toBe(true)
      })

      return true
    },
  })
})

it("whitespace alone is no document", () => {
  expect(Option.isNone(plainTextToTiptapDocument(" \n\n \t"))).toBe(true)
})
