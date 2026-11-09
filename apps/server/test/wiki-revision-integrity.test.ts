import { expect, it } from "@effect/vitest"
import {
  LoroDocUpdate,
  snapshotToLoroDoc,
  WikiArticleCrdt,
  WikiArticleEditableData,
  WikiArticleId,
} from "@gororobas/domain"
import { WikiPlantCultivarArticle } from "@gororobas/domain/wiki/kinds/plant-cultivar"
import { WikiToolArticle } from "@gororobas/domain/wiki/kinds/tool"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { insertImage } from "./fixtures.js"
import { seedPerson, TestLayer } from "./test-helpers.js"

const plant = Schema.decodeSync(WikiArticleEditableData)({
  kind: "PLANT",
  attributes: {},
  translations: { pt: { commonNames: [{ id: "testname0001", name: "Milho" }] } },
})

const TestEnvironment = Layer.mergeAll(WorkflowEngine.layerMemory, TestLayer)

it.effect("rejects a Wikidata ID already assigned to another kind when approving a revision", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make

    const place = yield* Schema.decodeEffect(WikiArticleEditableData)({
      kind: "PLACE",
      attributes: { wikidataId: "Q7533" },
      translations: { pt: { commonNames: [{ id: "placename001", name: "Place" }] } },
    })

    const placeId = yield* repository.createWikiArticle({
      wikiArticle: place,
      createdById: person.id,
      status: "PUBLISHED",
    })

    const plantId = yield* repository.createWikiArticle({
      wikiArticle: plant,
      createdById: person.id,
      status: "PUBLISHED",
    })

    const source = Option.getOrThrow(yield* repository.findSourceRowById(plantId))
    const current = snapshotToLoroDoc(source.crdtSnapshot)
    const edited = current.fork()
    edited.getMap("attributes").set("wikidataId", "Q7533")
    edited.commit()

    const revisionId = yield* repository.createRevision({
      wikiArticleId: plantId,
      createdById: person.id,
      crdtUpdate: LoroDocUpdate.make(edited.export({ mode: "update", from: current.version() })),
    })

    const error = yield* repository
      .evaluateRevision({ revisionId, evaluatedById: person.id, evaluation: "APPROVED" })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "WikiArticleWikidataIdTakenError",
      wikiArticleId: placeId,
      wikidataId: "Q7533",
    })

    expect(
      (yield* repository.findRevisionById(revisionId)).pipe(Option.getOrThrow).evaluation,
    ).toBe("PENDING")

    const sql = yield* SqlClient.SqlClient
    const constraint =
      yield* sql`UPDATE wiki_article_projections SET attributes = json_set(attributes, '$.wikidataId', 'Q7533') WHERE id = ${plantId}`.pipe(
        Effect.flip,
      )
    expect(constraint._tag).toBe("SqlError")
  }).pipe(Effect.provide(TestEnvironment)),
)

it("requires at least one translation when creating an article", () => {
  expect(
    Option.isNone(
      Schema.decodeOption(WikiArticleEditableData)({
        kind: "PLANT",
        attributes: {},
        translations: {},
      }),
    ),
  ).toBe(true)
})

it.effect("rejects removing an article's last translation", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make

    const wikiArticleId = yield* repository.createWikiArticle({
      wikiArticle: plant,
      createdById: person.id,
      status: "PUBLISHED",
    })

    const source = Option.getOrThrow(yield* repository.findSourceRowById(wikiArticleId))
    const current = snapshotToLoroDoc(source.crdtSnapshot)
    const edited = current.fork()
    edited.getMap("translations").delete("pt")
    edited.commit()

    const error = yield* repository
      .createRevision({
        wikiArticleId,
        createdById: person.id,
        crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({ _tag: "InvalidCrdtUpdateError", reason: "SchemaValidation" })
  }).pipe(Effect.provide(TestEnvironment)),
)

it.effect("rejects a revision that changes the article's kind", () =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("ADMIN")
    const repository = yield* WikiArticlesRepository.make

    const wikiArticleId = yield* repository.createWikiArticle({
      wikiArticle: plant,
      createdById: person.id,
      status: "PUBLISHED",
    })

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
    const mediaAssetId = yield* insertImage(person.id, "00000000-0000-7000-8000-0000000000a1")

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

    yield* repository.evaluateRevision({
      revisionId: revision.id,
      evaluation: "APPROVED",
      evaluatedById: person.id,
    })

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
    const plantId = yield* repository.createWikiArticle({ ...published, wikiArticle: plant })
    const toolId = yield* repository.createWikiArticle({ ...published, wikiArticle: tool })
    const cultivarId = yield* repository.createWikiArticle({
      ...published,
      wikiArticle: cultivarOf(plantId),
    })

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

    const plantId = yield* repository.createWikiArticle({
      createdById: person.id,
      status: "PUBLISHED",
      wikiArticle: plant,
    })

    const cultivarId = yield* repository.createWikiArticle(
      { createdById: person.id, status: "PENDING_APPROVAL", wikiArticle: cultivarOf(plantId) },
      { isPendingApproval: true },
    )

    const [pending] = yield* repository.listRevisionHistory({ wikiArticleId: cultivarId })

    yield* sql`UPDATE wiki_article_sources SET status = 'ARCHIVED' WHERE id = ${plantId}`

    const error = yield* repository
      .evaluateRevision({
        revisionId: pending.id,
        evaluation: "APPROVED",
        evaluatedById: person.id,
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({ _tag: "WikiArticleNotFoundError", id: plantId })
    expect(Option.getOrThrow(yield* repository.findRevisionById(pending.id)).evaluation).toBe(
      "PENDING",
    )
  }).pipe(Effect.provide(TestEnvironment)),
)

it.effect(
  "rejects approval when merging translation removals would leave an article without a route",
  () =>
    Effect.gen(function* () {
      const { person } = yield* seedPerson("ADMIN")
      const repository = yield* WikiArticlesRepository.make

      const article = yield* Schema.decodeEffect(WikiArticleEditableData)({
        kind: "PLANT",
        attributes: {},
        translations: {
          pt: { commonNames: [{ id: "testname0001", name: "Milho" }] },
          en: { commonNames: [{ id: "testname0002", name: "Corn" }] },
        },
      })

      const wikiArticleId = yield* repository.createWikiArticle({
        wikiArticle: article,
        createdById: person.id,
        status: "PUBLISHED",
      })

      const source = Option.getOrThrow(yield* repository.findSourceRowById(wikiArticleId))
      const current = snapshotToLoroDoc(source.crdtSnapshot)

      const removeTranslation = (language: string) => {
        const edited = current.fork()
        edited.getMap("translations").delete(language)
        edited.commit()

        return repository.createRevision({
          wikiArticleId,
          createdById: person.id,
          crdtUpdate: LoroDocUpdate.make(
            edited.export({ from: current.version(), mode: "update" }),
          ),
        })
      }

      const firstRevision = yield* removeTranslation("pt")
      const secondRevision = yield* removeTranslation("en")

      yield* repository.evaluateRevision({
        revisionId: firstRevision,
        evaluation: "APPROVED",
        evaluatedById: person.id,
      })

      const error = yield* repository
        .evaluateRevision({
          revisionId: secondRevision,
          evaluation: "APPROVED",
          evaluatedById: person.id,
        })
        .pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: "InvalidCrdtUpdateError", reason: "SchemaValidation" })
      expect(Option.getOrThrow(yield* repository.findRevisionById(secondRevision)).evaluation).toBe(
        "PENDING",
      )
      const saved = Option.getOrThrow(yield* repository.findSourceRowById(wikiArticleId))
      const data = yield* WikiArticleCrdt.read(snapshotToLoroDoc(saved.crdtSnapshot))
      expect(data.translations.en).toBeDefined()
    }).pipe(Effect.provide(TestEnvironment)),
)
