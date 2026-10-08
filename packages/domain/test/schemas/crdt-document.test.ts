import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroMap, type LoroDoc } from "loro-crdt"

import { CommentCrdt } from "../../src/comments/comment-crdt.js"
import { SourceCommentData } from "../../src/comments/domain.js"
import { ContentLanguage } from "../../src/common/content-language.js"
import { PersonId, ProfileId } from "../../src/common/ids.js"
import { HumanCommit, LoroDocSnapshot, LoroDocUpdate } from "../../src/crdts/domain.js"
import { InvalidCrdtUpdateError } from "../../src/crdts/errors.js"
import { snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroString } from "../../src/crdts/loro-values.js"
import { PublicationSourceData } from "../../src/publications/domain.js"
import { PublicationCrdt } from "../../src/publications/publication-crdt.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"

const content = (text: string): TiptapDocument =>
  TiptapDocument.make({
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })

const original = {
  content: content("Original"),
  originalLanguage: ContentLanguage.make("pt"),
  translationSource: "ORIGINAL",
  translatedAtCrdtFrontier: null,
} as const

const comment: SourceCommentData = {
  sourceContent: original.content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" },
}

const publication = Schema.decodeSync(PublicationSourceData)({
  metadata: {
    kind: "POST",
    handle: "growing-together",
    ownerProfileId: ProfileId.make("019a0dce-1fc0-7abc-8abc-123456789abc"),
    publishedAt: "2026-10-06T00:00:00Z",
    visibility: "PUBLIC",
  },
  sourceContent: original.content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" },
})

const wiki = Schema.decodeSync(WikiPlantArticle.EditableArticle)({
  kind: "PLANT",
  attributes: {},
  translations: {
    pt: { content: content("Original"), commonNames: [{ id: "commonname01", value: "Plant" }] },
  },
})

const commit = HumanCommit.make({ personId: PersonId.make("019a0dce-1fc0-7abc-8abc-123456789abc") })

const requireMap = (value: ReturnType<LoroMap["get"]>) => {
  assert(value instanceof LoroMap)
  return value
}

const rejectUnknownKeys = (parameters: {
  snapshot: LoroDocSnapshot
  languageRoot: string
  metadataRoot: string | undefined
  apply: (update: LoroDocUpdate) => Effect.Effect<void, InvalidCrdtUpdateError | Schema.SchemaError>
}) =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(Schema.String),
    predicate: (suffix) =>
      Effect.gen(function* () {
        const key = toLoroString(`unknown_${suffix.replaceAll("/", "_").replaceAll("\0", "_")}`)

        const mutations: ReadonlyArray<(document: LoroDoc) => void> = [
          (document) => document.getMap(key).set("value", "untrusted"),
          (document) =>
            (parameters.languageRoot === "sourceContent"
              ? document.getMap("sourceLanguage")
              : requireMap(document.getMap(parameters.languageRoot).get("pt"))
            ).set(key, "untrusted"),
          (document) =>
            (parameters.languageRoot === "sourceContent"
              ? document.getMap("sourceContent")
              : requireMap(
                  requireMap(document.getMap(parameters.languageRoot).get("pt")).get("content"),
                )
            ).set(key, "untrusted"),
          ...(parameters.metadataRoot
            ? [
                (document: LoroDoc) =>
                  document.getMap(parameters.metadataRoot ?? "").set(key, "untrusted"),
              ]
            : []),
        ]

        yield* Effect.forEach(
          mutations,
          Effect.fn(function* (mutate) {
            const document = snapshotToLoroDoc(parameters.snapshot)
            const version = document.version()
            mutate(document)

            const error = yield* Effect.flip(
              parameters.apply(
                LoroDocUpdate.make(document.export({ from: version, mode: "update" })),
              ),
            )

            expect(error).toBeInstanceOf(InvalidCrdtUpdateError)
            assert(error instanceof InvalidCrdtUpdateError)
            expect(error.reason).toBe("SchemaValidation")
          }),
          { concurrency: 1, discard: true },
        )

        return true
      }),
  })

describe("Shared CRDT document boundary", () => {
  it.effect("rejects unknown comment keys before committing", () =>
    Effect.gen(function* () {
      const created = yield* CommentCrdt.create(comment)

      yield* rejectUnknownKeys({
        snapshot: created.crdtSnapshot,
        languageRoot: "sourceContent",
        metadataRoot: undefined,
        apply: (crdtUpdate) =>
          CommentCrdt.applyUpdate({ commit, crdtUpdate, snapshot: created.crdtSnapshot }).pipe(
            Effect.asVoid,
          ),
      })

      expect(yield* CommentCrdt.read(created.document)).toEqual(comment)
    }),
  )

  it.effect("rejects unknown publication keys before committing", () =>
    Effect.gen(function* () {
      const created = yield* PublicationCrdt.create(publication)

      yield* rejectUnknownKeys({
        snapshot: created.crdtSnapshot,
        languageRoot: "sourceContent",
        metadataRoot: "metadata",
        apply: (crdtUpdate) =>
          PublicationCrdt.applyUpdate({ commit, crdtUpdate, snapshot: created.crdtSnapshot }).pipe(
            Effect.asVoid,
          ),
      })
    }),
  )

  it.effect("rejects unknown wiki keys when parsing revisions", () =>
    Effect.gen(function* () {
      const created = yield* WikiArticleCrdt.create(wiki)

      yield* rejectUnknownKeys({
        snapshot: created.crdtSnapshot,
        languageRoot: "translations",
        metadataRoot: "attributes",
        apply: (crdtUpdate) =>
          WikiArticleCrdt.parseUpdate({ crdtUpdate, snapshot: created.crdtSnapshot }).pipe(
            Effect.asVoid,
          ),
      })
    }),
  )

  it.effect("rejects updates whose dependencies are missing", () =>
    Effect.gen(function* () {
      const created = yield* CommentCrdt.create(comment)
      const unrelated = yield* CommentCrdt.create(comment)
      const version = created.document.version()

      yield* CommentCrdt.applyEdit(created.document, {
        _tag: "SetCommentSourceContent",

        content: content("Changed"),
      })

      const update = LoroDocUpdate.make(created.document.export({ from: version, mode: "update" }))
      const error = yield* Effect.flip(
        CommentCrdt.parseUpdate({ snapshot: unrelated.crdtSnapshot, crdtUpdate: update }),
      )
      expect(error.reason).toBe("InvalidFormat")
    }),
  )

  it.effect("applies multiple edits in order and publishes only their final state", () =>
    Effect.gen(function* () {
      const created = yield* CommentCrdt.create(comment)

      const evolved = yield* CommentCrdt.evolve({
        commit,
        snapshot: created.crdtSnapshot,
        edits: [
          { _tag: "SetCommentSourceContent", content: content("PRIVATE INTERMEDIATE") },
          { _tag: "SetCommentSourceContent", content: content("Published") },
          {
            _tag: "SetCommentTranslation",
            language: "en",
            value: {
              content: content("Translation"),
              originalLanguage: ContentLanguage.make("pt"),
              translationSource: "AUTOMATIC",
              translatedAtCrdtFrontier: created.currentCrdtFrontier,
            },
          },
        ],
      })

      expect(evolved.data.sourceContent).toEqual(content("Published"))

      expect(
        evolved.data.translations.en !== "original"
          ? evolved.data.translations.en?.content
          : undefined,
      ).toEqual(content("Translation"))

      expect(yield* CommentCrdt.read(created.document)).toEqual(comment)
      const history = evolved.document.exportJsonUpdates(created.document.version())
      expect(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(history)).not.toContain(
        "PRIVATE INTERMEDIATE",
      )

      expect(
        (yield* CommentCrdt.parseUpdate({
          snapshot: created.crdtSnapshot,
          crdtUpdate: LoroDocUpdate.make(evolved.crdtUpdate),
        })).data,
      ).toEqual(evolved.data)

      const failed = yield* Effect.flip(
        CommentCrdt.evolve({
          commit,
          snapshot: created.crdtSnapshot,
          edits: [
            { _tag: "SetCommentSourceContent", content: content("Should not persist") },
            {
              _tag: "SetCommentTranslationContent",
              language: "en",
              content: content("Missing language"),
            },
          ],
        }),
      )

      assert(failed instanceof InvalidCrdtUpdateError)
      expect(failed.reason).toBe("SchemaValidation")
      expect(yield* CommentCrdt.read(created.document)).toEqual(comment)
    }),
  )
})
