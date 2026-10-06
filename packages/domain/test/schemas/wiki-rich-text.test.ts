import { assert, describe, expect, it } from "@effect/vitest"
import { Schema as ProseMirrorSchema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { Effect, Exit, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroList, LoroMap, LoroText, type LoroDoc } from "loro-crdt"
import {
  createNodeFromLoroObj,
  updateLoroToPmState,
  type LoroDocType,
  type LoroNode,
} from "loro-prosemirror"

import { MediaAssetId } from "../../src/common/ids.js"
import { CrdtCommit } from "../../src/crdts/domain.js"
import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroValue } from "../../src/crdts/loro-values.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import {
  applyWikiArticleCrdtUpdateWithCommit,
  createWikiArticleCrdtDocument,
  parseWikiArticleCrdtUpdate,
} from "../../src/wiki/wiki-article-crdt.js"

const editorSchema = new ProseMirrorSchema({
  nodes: {
    doc: { content: "block*" },
    paragraph: { group: "block", content: "inline*" },
    blockquote: { group: "block", content: "block*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    mediaGrid: {
      group: "block",
      atom: true,
      attrs: { version: { default: 1 }, items: { default: null } },
    },
    hardBreak: { group: "inline", inline: true },
    text: { group: "inline" },
  },
  marks: {
    bold: {},
    link: { inclusive: false, attrs: { href: {} } },
  },
})

const RichTextInputs = Schema.Struct({
  first: Schema.NonEmptyString,
  second: Schema.NonEmptyString,
  level: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
})

const makeContent = ({ first, second, level }: typeof RichTextInputs.Type) =>
  Schema.decodeSync(TiptapDocument)({
    ...editorSchema
      .nodeFromJSON({
        type: "doc",
        content: [
          { type: "heading", attrs: { level }, content: [{ type: "text", text: first }] },
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: first, marks: [{ type: "bold" }] },
                  {
                    type: "text",
                    text: second,
                    marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                  },
                  { type: "hardBreak" },
                  { type: "text", text: first },
                ],
              },
            ],
          },
          {
            type: "mediaGrid",
            attrs: {
              version: 1,
              items: [
                {
                  source: "MEDIA_ASSET",
                  format: "IMAGE",
                  mediaAssetId: MediaAssetId.make("019a0dce-1fc0-7abc-8abc-123456789abc"),
                },
              ],
            },
          },
          { type: "paragraph" },
        ],
      })
      .toJSON(),
    version: 1,
  })

const makeArticle = (content: TiptapDocument) =>
  Schema.decodeSync(WikiPlantArticle.EditableArticle)({
    kind: "PLANT",
    attributes: {},
    translations: {
      en: { commonNames: [{ id: "commonname01", value: "Pumpkin" }], content },
    },
  })

const getContent = (document: LoroDoc): LoroNode => {
  const translation = document.getMap("translations").get("en")
  assert(translation instanceof LoroMap)
  const content = translation.get("content")
  assert(content instanceof LoroMap)
  // oxlint-disable-next-line effect/casting-awareness -- The binding's generic node type describes our tested wire format.
  return content as LoroNode
}

const parse = (
  created: Effect.Success<ReturnType<typeof createWikiArticleCrdtDocument>>,
  document: LoroDoc,
) =>
  parseWikiArticleCrdtUpdate({
    snapshot: created.crdtSnapshot,
    crdtUpdate: loroDocToUpdate(document),
  })

describe("Wiki rich text and loro-prosemirror", () => {
  it.effect(
    "reads constructed documents with the binding and accepts binding-generated edits",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(RichTextInputs),
        predicate: (input) =>
          Effect.gen(function* () {
            const content = makeContent(input)
            const created = yield* createWikiArticleCrdtDocument(makeArticle(content))
            const document = snapshotToLoroDoc(created.crdtSnapshot)
            const root = getContent(document)
            // oxlint-disable-next-line effect/avoid-native-object-helpers -- The binding requires its mutable native Map cache.
            const node = createNodeFromLoroObj(editorSchema, root, new Map())

            expect(node.toJSON()).toEqual(
              editorSchema
                .nodeFromJSON(
                  toLoroValue(Schema.encodeSync(Schema.toCodecJson(TiptapDocument))(content)),
                )
                .toJSON(),
            )

            const state = EditorState.create({ doc: node })
            const edited = state.apply(state.tr.insertText("Edited ", 1))
            // oxlint-disable-next-line effect/casting-awareness, effect/avoid-native-object-helpers -- The binding requires a native Map; containerId selects our nested editor root instead of its default doc root.
            updateLoroToPmState(document as LoroDocType, new Map(), edited, root.id)
            const parsed = yield* parse(created, document)
            const translation = parsed.data.translations.en
            assert(translation)
            const projected = Schema.encodeSync(TiptapDocument)(
              Option.getOrThrow(translation.content),
            )
            expect(editorSchema.nodeFromJSON(projected).toJSON()).toEqual(edited.doc.toJSON())
            return true
          }),
        options: { runs: 100, seed: 20261002 },
      }),
  )

  it.effect("preserves concurrent text insertions and marks through approval", () =>
    Effect.gen(function* () {
      const content = makeContent({ first: "Hello", second: " world", level: 2 })
      const created = yield* createWikiArticleCrdtDocument(makeArticle(content))
      const first = snapshotToLoroDoc(created.crdtSnapshot)
      const second = first.fork()

      const findText = (document: LoroDoc) => {
        const children = getContent(document).get("children")
        const heading = children.get(0)
        assert(heading instanceof LoroMap)
        const inline = heading.get("children")
        assert(inline instanceof LoroList)
        const text = inline.get(0)
        assert(text instanceof LoroText)
        return text
      }

      const firstText = findText(first)
      const secondText = findText(second)
      first.configTextStyle({ bold: { expand: "after" } })
      firstText.mark({ start: 0, end: 5 }, "bold", {})
      secondText.insert(5, "!")
      first.import(loroDocToUpdate(second))

      const committed = yield* applyWikiArticleCrdtUpdateWithCommit({
        snapshot: created.crdtSnapshot,
        crdtUpdate: loroDocToUpdate(first),
        commit: CrdtCommit.make({
          _tag: "SystemCommit",
          workflowName: "test",
          workflowVersion: "1",
          model: "none",
        }),
      })

      const accepted = snapshotToLoroDoc(committed.nextSnapshot)
      expect(findText(accepted).toString()).toBe("Hello!")
      expect(findText(accepted).toDelta()).toEqual(findText(first).toDelta())
      const parsed = yield* parse(created, accepted)
      expect(parsed.data).toEqual(committed.data)
    }),
  )

  it.effect("rejects malformed rich-text subtrees instead of dropping them", () =>
    Effect.gen(function* () {
      const created = yield* createWikiArticleCrdtDocument(
        makeArticle(makeContent({ first: "Hello", second: "world", level: 1 })),
      )
      const document = snapshotToLoroDoc(created.crdtSnapshot)
      document.getList(getContent(document).get("children").id).insert(0, "invalid child")
      expect(Exit.isFailure(yield* Effect.exit(parse(created, document)))).toBe(true)
    }),
  )
})
