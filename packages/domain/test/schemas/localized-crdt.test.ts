import { assert, describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Equal, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { TestClock } from "effect/testing"
import { LoroList, LoroMap, LoroText, type LoroDoc } from "loro-crdt"

import { CommentCrdt } from "../../src/comments/comment-crdt.js"
import { SourceCommentData } from "../../src/comments/domain.js"
import { ContentLanguage } from "../../src/common/content-language.js"
import { ProfileId } from "../../src/common/ids.js"
import { PersonId } from "../../src/common/ids.js"
import { CrdtCommitEncoded, HumanCommit } from "../../src/crdts/domain.js"
import {
  loroDocToSnapshot,
  modifyLoroDocWithCommit,
  snapshotToLoroDoc,
} from "../../src/crdts/lib.js"
import { toLoroString } from "../../src/crdts/loro-values.js"
import { PublicationSourceData } from "../../src/publications/domain.js"
import { PublicationCrdt } from "../../src/publications/publication-crdt.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"

const content = (text: string): TiptapDocument =>
  TiptapDocument.make({
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })

const original = (text: string) => ({
  content: content(text),
  originalLanguage: ContentLanguage.make("pt"),
  translationSource: "ORIGINAL" as const,
  translatedAtCrdtFrontier: null,
})

const publication = (text: string): PublicationSourceData =>
  Schema.decodeSync(PublicationSourceData)({
    metadata: {
      kind: "POST",
      handle: "growing-together",
      ownerProfileId: ProfileId.make("019a0dce-1fc0-7abc-8abc-123456789abc"),
      publishedAt: "2026-10-06T00:00:00Z",
      visibility: "PUBLIC",
    },
    sourceContent: content(text),
    sourceLanguage: ContentLanguage.make("pt"),
    translations: { pt: "original" },
  })

const textContainer = (document: LoroDoc) => {
  const root = document.getMap("sourceContent")
  const paragraphs = root.get("children")
  assert(paragraphs instanceof LoroList)
  const paragraph = paragraphs.get(0)
  assert(paragraph instanceof LoroMap)
  const children = paragraph.get("children")
  assert(children instanceof LoroList)
  const text = children.get(0)
  assert(text instanceof LoroText)
  return text
}

describe("Publication and comment CRDTs", () => {
  it.effect(
    "keeps the source text container stable when an undetermined language is corrected",
    () =>
      Effect.gen(function* () {
        const document = (yield* CommentCrdt.create(
          SourceCommentData.make({
            sourceContent: content("你好"),
            sourceLanguage: ContentLanguage.make("und"),
            translations: {},
          }),
        )).document

        const identity = textContainer(document).id
        const sourceLanguage = Schema.decodeSync(ContentLanguage)("ZH-hans")
        expect(sourceLanguage).toBe("zh-Hans")
        yield* CommentCrdt.applyEdit(document, { _tag: "SetCommentSourceLanguage", sourceLanguage })
        const corrected = yield* CommentCrdt.read(snapshotToLoroDoc(loroDocToSnapshot(document)))
        expect(corrected.sourceLanguage).toBe("zh-Hans")
        expect(corrected.translations).toEqual({})
        expect(corrected.sourceContent).toEqual(content("你好"))
        expect(textContainer(document).id).toBe(identity)
        yield* CommentCrdt.applyEdit(document, {
          _tag: "SetCommentSourceLanguage",
          sourceLanguage: ContentLanguage.make("en-US"),
        })
        expect((yield* CommentCrdt.read(document)).translations.en).toBe("original")
        yield* CommentCrdt.applyEdit(document, {
          _tag: "SetCommentSourceLanguage",
          sourceLanguage: ContentLanguage.make("fr"),
        })
        expect((yield* CommentCrdt.read(document)).translations.en).toBeUndefined()
        expect(textContainer(document).id).toBe(identity)
        const frontier = document.frontiers()
        yield* CommentCrdt.applyEdit(document, {
          _tag: "SetCommentSourceLanguage",
          sourceLanguage: ContentLanguage.make("fr"),
        })
        expect(document.frontiers()).toEqual(frontier)
      }),
  )

  it.effect("round-trips domain encodings, dates and Unicode through snapshots", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.NonEmptyString),
      predicate: (text) =>
        Effect.gen(function* () {
          const source = publication(text)
          const publicationDocument = yield* PublicationCrdt.create(source).pipe(
            Effect.map((created) => created.document),
          )
          const decodedPublication = yield* PublicationCrdt.read(
            snapshotToLoroDoc(loroDocToSnapshot(publicationDocument)),
          )

          const comment = SourceCommentData.make({
            sourceContent: content(text),
            sourceLanguage: ContentLanguage.make("pt"),
            translations: { pt: "original" },
          })

          const commentDocument = yield* CommentCrdt.create(comment).pipe(
            Effect.map((created) => created.document),
          )
          const decodedComment = yield* CommentCrdt.read(
            snapshotToLoroDoc(loroDocToSnapshot(commentDocument)),
          )
          expect(decodedComment.sourceContent).toEqual(content(toLoroString(text)))
          expect(DateTime.formatIso(decodedPublication.metadata.publishedAt)).toBe(
            "2026-10-06T00:00:00.000Z",
          )
          return Equal.equals(decodedPublication.sourceContent, decodedComment.sourceContent)
        }),
    }),
  )

  it.effect("merges concurrent tagged content edits without replacing LoroText", () =>
    assertPropertyEffect({
      // Distinct edit markers avoid ambiguous diff positions when the original contains A or Z.
      arbitrary: Arbitrary.filter<string>(
        Arbitrary.schema(Schema.NonEmptyString),
        (text) => !text.includes("A") && !text.includes("Z"),
      ),
      predicate: (text) =>
        Effect.gen(function* () {
          const initial = yield* PublicationCrdt.create(publication(text)).pipe(
            Effect.map((created) => created.document),
          )
          const first = initial.fork()
          const second = initial.fork()
          const identity = textContainer(initial).id

          yield* PublicationCrdt.applyEdit(first, {
            _tag: "SetPublicationSourceContent",

            content: content(`A${text}`),
          })

          yield* PublicationCrdt.applyEdit(second, {
            _tag: "SetPublicationSourceContent",

            content: content(`${text}Z`),
          })

          first.import(second.export({ from: initial.version(), mode: "update" }))
          second.import(first.export({ from: initial.version(), mode: "update" }))
          expect(textContainer(first).id).toBe(identity)
          expect(textContainer(first).toString()).toBe(`A${toLoroString(text)}Z`)
          return Equal.equals(first.toJSON(), second.toJSON())
        }),
    }),
  )

  it.effect("preserves arbitrary attributes and changes only differing text/marks", () =>
    Effect.gen(function* () {
      const document = yield* CommentCrdt.create(
        SourceCommentData.make({
          sourceContent: content("Growing"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
        }),
      ).pipe(Effect.map((created) => created.document))

      const next = TiptapDocument.make({
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            attrs: { custom: { value: null } },
            content: [
              {
                type: "text",
                text: "Growing ",
                marks: [{ type: "bold", attrs: { custom: "🌱" } }],
              },
              {
                type: "text",
                text: "together",
                marks: [{ type: "link", attrs: { href: "https://example.com" } }],
              },
            ],
          },
        ],
      })

      yield* CommentCrdt.applyEdit(document, {
        _tag: "SetCommentSourceContent",

        content: next,
      })

      expect((yield* CommentCrdt.read(document)).sourceContent).toEqual(next)
      const frontier = document.frontiers()

      yield* CommentCrdt.applyEdit(document, {
        _tag: "SetCommentSourceContent",
        content: next,
      })

      expect(document.frontiers()).toEqual(frontier)
      const first = document.fork()
      const second = document.fork()
      const firstText = textContainer(first)
      firstText.mark({ start: 0, end: 3 }, "italic", {})

      yield* CommentCrdt.applyEdit(second, {
        _tag: "SetCommentSourceContent",

        content: {
          ...next,
          content: [
            {
              attrs: { custom: { value: null } },
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Growing ",
                  marks: [{ type: "bold", attrs: { custom: "🌱" } }],
                },
                {
                  type: "text",
                  text: "together!",
                  marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                },
              ],
            },
          ],
        },
      })

      second.import(first.export({ from: document.version(), mode: "update" }))
      expect(textContainer(second).toDelta()[0].attributes?.italic).toEqual({})
    }),
  )

  it.effect("creates the same language concurrently with mergeable rich-text roots", () =>
    Effect.gen(function* () {
      const initial = yield* CommentCrdt.create(
        SourceCommentData.make({
          sourceContent: content("Original"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
        }),
      ).pipe(Effect.map((created) => created.document))

      const first = initial.fork()
      const second = initial.fork()

      yield* CommentCrdt.applyEdit(first, {
        _tag: "SetCommentTranslation",
        language: "en",
        value: {
          ...original("First"),
          translationSource: "MANUAL",
          translatedAtCrdtFrontier: initial.frontiers(),
        },
      })

      yield* CommentCrdt.applyEdit(second, {
        _tag: "SetCommentTranslation",
        language: "en",
        value: {
          ...original("Second"),
          translationSource: "MANUAL",
          translatedAtCrdtFrontier: initial.frontiers(),
        },
      })

      first.import(second.export({ from: initial.version(), mode: "update" }))
      const merged = yield* CommentCrdt.read(first)
      expect(
        merged.translations.en !== "original" ? merged.translations.en?.content.content : undefined,
      ).toHaveLength(2)
      expect(merged.sourceContent).toEqual(content("Original"))
      yield* CommentCrdt.applyEdit(first, { _tag: "RemovedCommentTranslation", language: "en" })
      expect((yield* CommentCrdt.read(first)).translations.en).toBeUndefined()
    }),
  )

  it.effect("publishes final edits with attribution and excludes intermediate private text", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("1 second")

      const initialDoc = yield* CommentCrdt.create(
        SourceCommentData.make({
          sourceContent: content("Original"),
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
        }),
      ).pipe(Effect.map((created) => created.document))

      const commit = HumanCommit.make({
        personId: PersonId.make("019a0dce-1fc0-7abc-8abc-123456789abc"),
      })

      const result = yield* modifyLoroDocWithCommit({
        initialDoc,
        commit,
        modifyDoc: (document) =>
          Effect.sync(() => {
            const text = textContainer(document)
            text.update("PRIVATE-INTERMEDIATE-TEXT")
            document.commit()
            text.update("Published")
            return document
          }),
      })

      const history = result.exportJsonUpdates(initialDoc.version())
      expect(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(history)).not.toContain(
        "PRIVATE-INTERMEDIATE-TEXT",
      )
      expect(textContainer(initialDoc).toString()).toBe("Original")
      const frontier = result.frontiers()[0]
      assert(frontier !== undefined)
      const change = result.getChangeAt(frontier)
      expect(change.message).toBe(Schema.encodeSync(CrdtCommitEncoded)(commit))
      expect(change.timestamp).toBeGreaterThan(0)
      expect((yield* CommentCrdt.read(result)).sourceContent).toEqual(content("Published"))
    }),
  )
})
