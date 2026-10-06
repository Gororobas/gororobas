import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { expect } from "vitest"

import { assertPropertyEffect } from "../testing.js"
import {
  EntityReferenceAttributes,
  EntityReferenceTarget,
  MediaGridAttributes,
  TiptapDocument,
} from "./domain.js"
import { linkedEntitiesFromTiptapDocument } from "./entity-reference-extension.js"
import { mediaItemsFromTiptapDocument } from "./media-grid-extension.js"
import { tiptapFromHtml, tiptapToHtml } from "./tiptap-to-html.js"

it.effect(
  "preserves versioned references and ordered media through HTML and deduplicates nested targets",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({ reference: EntityReferenceAttributes, grid: MediaGridAttributes }),
      ),
      predicate: ({ reference, grid }) =>
        Effect.sync(() => {
          const document = TiptapDocument.make({
            type: "doc",
            version: 1,
            content: [
              { type: "paragraph", content: [{ type: "entityReference", attrs: reference }] },
              {
                type: "blockquote",
                content: [
                  { type: "paragraph", content: [{ type: "entityReference", attrs: reference }] },
                ],
              },
              { type: "mediaGrid", attrs: grid },
            ],
          })

          const restored = tiptapFromHtml(tiptapToHtml(document))
          expect(linkedEntitiesFromTiptapDocument(restored)).toEqual([
            Schema.decodeSync(EntityReferenceTarget)(reference),
          ])
          expect(mediaItemsFromTiptapDocument(restored)).toEqual(grid.items)
          const paragraph = restored.content[0]
          expect(paragraph.type).toBe("paragraph")
          if (paragraph.type !== "paragraph") throw new Error("Expected a paragraph")
          expect(paragraph.content?.[0]).toEqual({ type: "entityReference", attrs: reference })
          expect(restored.content[2]).toEqual({ type: "mediaGrid", attrs: grid })

          expect(
            Schema.is(TiptapDocument)({
              ...document,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "entityReference", attrs: { ...reference, version: 2 } }],
                },
              ],
            }),
          ).toBe(false)

          expect(
            Schema.is(TiptapDocument)({
              ...document,
              content: [{ type: "mediaGrid", attrs: { ...grid, items: [] } }],
            }),
          ).toBe(false)

          return true
        }),
    }),
)
