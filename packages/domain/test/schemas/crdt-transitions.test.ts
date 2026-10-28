import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { ContentLanguage } from "../../src/common/content-language.js"
import { PersonId, TiptapNodeId } from "../../src/common/ids.js"
import { HumanCommit, LoroDocUpdate } from "../../src/crdts/domain.js"
import { snapshotToLoroDoc } from "../../src/crdts/lib.js"
import {
  EventMetadata,
  EventSourceData,
  type PostMetadata,
  PostSourceData,
  type PublicationSourceData,
} from "../../src/publications/domain.js"
import { PublicationCrdt } from "../../src/publications/publication-crdt.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"
import { WikiArticleKind } from "../../src/wiki/wiki-article.js"

const commit = HumanCommit.make({ personId: PersonId.make("019a0dce-1fc0-7abc-8abc-123456789abc") })

const content = TiptapDocument.make({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      attrs: { nodeId: TiptapNodeId.make("paragraph001") },
      content: [{ type: "text", text: "Mutirão de plantio" }],
    },
  ],
})

const sourceContent = {
  sourceContent: content,
  sourceLanguage: ContentLanguage.make("pt"),
  translations: { pt: "original" as const },
}

const publicationWith = (metadata: PostMetadata | EventMetadata): PublicationSourceData =>
  metadata.kind === "POST"
    ? PostSourceData.make({ ...sourceContent, metadata })
    : EventSourceData.make({ ...sourceContent, metadata })

const invariantViolation = { _tag: "InvalidCrdtUpdateError", reason: "InvariantViolation" }

describe("Publication transitions", () => {
  it.effect("a post never becomes an event, through any write path", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(EventMetadata),
      predicate: (event) =>
        Effect.gen(function* () {
          const post = yield* PublicationCrdt.create(publicationWith({ kind: "POST" }))
          const edit = { _tag: "SetPublicationMetadata", value: event } as const

          expect(
            yield* PublicationCrdt.evolve({
              commit,
              edits: [edit],
              snapshot: post.crdtSnapshot,
            }).pipe(Effect.flip),
          ).toMatchObject(invariantViolation)

          const document = snapshotToLoroDoc(post.crdtSnapshot)
          const version = document.version()
          yield* PublicationCrdt.applyEdit(document, edit)
          const crdtUpdate = LoroDocUpdate.make(document.export({ from: version, mode: "update" }))

          expect(
            yield* PublicationCrdt.applyUpdate({
              commit,
              crdtUpdate,
              snapshot: post.crdtSnapshot,
            }).pipe(Effect.flip),
          ).toMatchObject(invariantViolation)

          expect(
            yield* PublicationCrdt.parseUpdate({ crdtUpdate, snapshot: post.crdtSnapshot }).pipe(
              Effect.flip,
            ),
          ).toMatchObject(invariantViolation)

          return true
        }),
    }),
  )

  it.effect("an event's details can change as long as it stays an event", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.Tuple([EventMetadata, EventMetadata])),
      predicate: ([before, after]) =>
        Effect.gen(function* () {
          const event = yield* PublicationCrdt.create(publicationWith(before))

          const evolved = yield* PublicationCrdt.evolve({
            commit,
            edits: [{ _tag: "SetPublicationMetadata", value: after }],
            snapshot: event.crdtSnapshot,
          })

          assert(evolved.data.metadata.kind === "EVENT")
          expect(evolved.data.metadata.startDate).toEqual(after.startDate)
          return true
        }),
    }),
  )
})

describe("Wiki article transitions", () => {
  const plant = Schema.decodeSync(WikiPlantArticle.EditableArticle)({
    kind: "PLANT",
    attributes: {},
    translations: { pt: { commonNames: [{ id: "commonname01", name: "Milho" }] } },
  })

  it.effect("rejects every otherwise valid change of kind", () =>
    Effect.gen(function* () {
      const created = yield* WikiArticleCrdt.create(plant)

      const rejected = yield* Effect.forEach(
        WikiArticleKind.literals.filter((kind) => kind !== "PLANT"),
        Effect.fn(function* (kind) {
          const document = snapshotToLoroDoc(created.crdtSnapshot)
          const version = document.version()
          document.getMap("kind").set("value", kind)
          document.commit()

          // Kinds whose attributes the plant's don't satisfy already fail schema validation.
          const isValidOnItsOwn = yield* WikiArticleCrdt.read(document).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false),
          )
          if (!isValidOnItsOwn) return false

          const crdtUpdate = LoroDocUpdate.make(document.export({ from: version, mode: "update" }))

          expect(
            yield* WikiArticleCrdt.parseUpdate({ crdtUpdate, snapshot: created.crdtSnapshot }).pipe(
              Effect.flip,
            ),
          ).toMatchObject(invariantViolation)

          expect(
            yield* WikiArticleCrdt.applyUpdate({
              commit,
              crdtUpdate,
              snapshot: created.crdtSnapshot,
            }).pipe(Effect.flip),
          ).toMatchObject(invariantViolation)

          return true
        }),
        { concurrency: 1 },
      )

      // Guards against a vacuous pass if every kind's attributes diverge from the plant's.
      expect(rejected.filter(Boolean).length).toBeGreaterThan(0)
    }),
  )
})
