import { expect, it } from "@effect/vitest"
import {
  LoroDocUpdate,
  MediaAssetId,
  snapshotToLoroDoc,
  WikiArticleCrdt,
  WikiArticleEditableData,
  WikiArticleId,
} from "@gororobas/domain"
import { WikiPlantCultivarArticle } from "@gororobas/domain/wiki/kinds/plant-cultivar"
import { WikiToolArticle } from "@gororobas/domain/wiki/kinds/tool"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { insertMediaAsset } from "../src/media-assets/mutations.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { seedPerson, TestLayer } from "./test-helpers.js"

const plant = Schema.decodeSync(WikiArticleEditableData)({
  kind: "PLANT",
  attributes: {},
  translations: { pt: { commonNames: [{ id: "testname0001", name: "Milho" }] } },
})

const insertImage = (ownerProfileId: Parameters<typeof insertMediaAsset>[0]["ownerProfileId"]) =>
  Effect.gen(function* () {
    const id = yield* Schema.decodeEffect(MediaAssetId)("00000000-0000-7000-8000-0000000000a1")
    const now = yield* DateTime.now

    yield* insertMediaAsset({
      id,
      format: "IMAGE",
      metadata: { format: "IMAGE", originalWidth: 80, originalHeight: 40 },
      contentType: "image/png",
      byteSize: 1,
      category: null,
      descriptions: {},
      moderationStatus: "APPROVED_BY_DEFAULT",
      ownerProfileId,
      createdAt: now,
      updatedAt: now,
    })

    return id
  })

const TestEnvironment = Layer.mergeAll(WorkflowEngine.layerMemory, TestLayer)

it.effect("rejects a revision that changes the article's kind", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make
    const wikiArticleId = yield* repository.createWikiArticle(
      { wikiArticle: plant, createdById: person.id, status: "PUBLISHED" },
      { enrichment: "skip" },
    )

    const source = Option.getOrThrow(yield* repository.findSourceRowById(wikiArticleId))
    const current = snapshotToLoroDoc(source.crdtSnapshot)
    const edited = current.fork()
    edited.getMap("kind").set("value", "TOOL")
    edited.commit()

    const error = yield* repository
      .createRevision({
        wikiArticleId,
        createdById: person.id,
        crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({ _tag: "InvalidCrdtUpdateError", reason: "InvariantViolation" })
  }).pipe(Effect.provide(TestEnvironment)),
)

it.effect("makes an approved revision's media selection the article's media", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make
    const mediaAssetId = yield* insertImage(person.id)

    const wikiArticleId = yield* repository.createWikiArticle(
      {
        wikiArticle: plant,
        createdById: person.id,
        status: "PENDING_APPROVAL",
        mediaAssets: [{ mediaAssetId, category: "FLOWER" }],
      },
      { isPendingApproval: true },
    )

    expect(yield* repository.listWikiArticleMedia(wikiArticleId)).toEqual([])

    const [revision] = yield* repository.listRevisionHistory({ wikiArticleId })
    yield* repository.evaluateRevision(
      { revisionId: revision.id, evaluation: "APPROVED", evaluatedById: person.id },
      { enrichment: "skip" },
    )

    const attached = yield* repository.listWikiArticleMedia(wikiArticleId)
    expect(attached.map((asset) => asset.id)).toEqual([mediaAssetId])
    expect(attached[0]?.category).toBe("FLOWER")
  }).pipe(Effect.provide(TestEnvironment)),
)

const cultivarOf = (parentPlantId: WikiArticleId) =>
  WikiPlantCultivarArticle.EditableArticle.make({
    kind: "PLANT_CULTIVAR",
    attributes: WikiPlantCultivarArticle.EditableAttributes.make({ parentPlantId }),
    translations: plant.translations,
  })

const tool = WikiToolArticle.EditableArticle.make({
  kind: "TOOL",
  attributes: WikiToolArticle.EditableAttributes.make({ usage: Option.none() }),
  translations: plant.translations,
})

it.effect("rejects a revision that moves a cultivar under an article that isn't a plant", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make
    const published = { createdById: person.id, status: "PUBLISHED" } as const
    const plantId = yield* repository.createWikiArticle(
      { ...published, wikiArticle: plant },
      { enrichment: "skip" },
    )
    const toolId = yield* repository.createWikiArticle(
      { ...published, wikiArticle: tool },
      { enrichment: "skip" },
    )
    const cultivarId = yield* repository.createWikiArticle(
      { ...published, wikiArticle: cultivarOf(plantId) },
      { enrichment: "skip" },
    )

    const source = Option.getOrThrow(yield* repository.findSourceRowById(cultivarId))
    const current = snapshotToLoroDoc(source.crdtSnapshot)
    const edited = current.fork()
    yield* WikiArticleCrdt.applyEdit(edited, {
      _tag: "SetPlantCultivarParentPlantId",
      value: toolId,
    })
    edited.commit()

    const error = yield* repository
      .createRevision({
        wikiArticleId: cultivarId,
        createdById: person.id,
        crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({ _tag: "InvalidCrdtUpdateError", reason: "SchemaValidation" })
  }).pipe(Effect.provide(TestEnvironment)),
)

it.effect("re-checks the parent on approval, which may have been unpublished meanwhile", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make
    const sql = yield* SqlClient.SqlClient
    const plantId = yield* repository.createWikiArticle(
      { createdById: person.id, status: "PUBLISHED", wikiArticle: plant },
      { enrichment: "skip" },
    )
    const cultivarId = yield* repository.createWikiArticle(
      { createdById: person.id, status: "PENDING_APPROVAL", wikiArticle: cultivarOf(plantId) },
      { isPendingApproval: true },
    )
    const [pending] = yield* repository.listRevisionHistory({ wikiArticleId: cultivarId })

    yield* sql`UPDATE wiki_article_projections SET status = 'ARCHIVED' WHERE id = ${plantId}`

    const error = yield* repository
      .evaluateRevision(
        { revisionId: pending.id, evaluation: "APPROVED", evaluatedById: person.id },
        { enrichment: "skip" },
      )
      .pipe(Effect.flip)

    expect(error).toMatchObject({ _tag: "WikiArticleNotFoundError", id: plantId })
    expect(Option.getOrThrow(yield* repository.findRevisionById(pending.id)).evaluation).toBe(
      "PENDING",
    )
  }).pipe(Effect.provide(TestEnvironment)),
)
