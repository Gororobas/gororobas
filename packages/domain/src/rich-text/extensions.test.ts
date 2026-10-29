import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { assertPropertyEffect } from "../testing.js"
import {
  EntityReferenceAttributes,
  EntityReferenceTarget,
  MediaGalleryAttributes,
  TiptapDocument,
} from "./domain.js"
import { linkedEntitiesFromTiptapDocument } from "./entity-reference-extension.js"
import { mediaItemsFromTiptapDocument } from "./media-gallery-extension.js"
import { assignTiptapNodeIds } from "./node-ids.js"
import { tiptapFromHtml, tiptapToHtml } from "./tiptap-to-html.js"
it.effect(
  "preserves versioned references and ordered media through HTML and deduplicates nested targets",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          reference: EntityReferenceAttributes,
          gallery: MediaGalleryAttributes,
        }),
      ),
      predicate: ({ reference, gallery }) =>
        Effect.gen(function* () {
          const document = assignTiptapNodeIds(
            TiptapDocument.make({
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "entityReference",
                      attrs: reference,
                    },
                  ],
                },
                {
                  type: "blockquote",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "entityReference",
                          attrs: reference,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "mediaGallery",
                  attrs: gallery,
                },
              ],
            }),
          )

          const restored = tiptapFromHtml(tiptapToHtml(document))
          expect(linkedEntitiesFromTiptapDocument(restored)).toEqual([
            yield* Schema.decodeEffect(EntityReferenceTarget)(reference),
          ])
          expect(mediaItemsFromTiptapDocument(restored)).toEqual(gallery.items)
          expect(restored).toEqual(document)

          expect(
            Schema.is(TiptapDocument)({
              ...document,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "entityReference",
                      attrs: {
                        ...reference,
                        version: 2,
                      },
                    },
                  ],
                },
              ],
            }),
          ).toBe(false)

          expect(
            Schema.is(TiptapDocument)({
              ...document,
              content: [
                {
                  type: "mediaGallery",
                  attrs: {
                    ...gallery,
                    items: [],
                  },
                },
              ],
            }),
          ).toBe(false)

          return true
        }),
    }),
)
