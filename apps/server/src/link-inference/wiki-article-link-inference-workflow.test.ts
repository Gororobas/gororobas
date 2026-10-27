import { describe, expect, it } from "@effect/vitest"
import {
  IdGen,
  LinkInferenceModel,
  LoroDocUpdate,
  type PersonId,
  snapshotToLoroDoc,
  WikiArticleCommonNameInCrdtList,
  WikiArticleCrdt,
  type WikiArticleId,
  WikiArticleRelationRow,
  WikiConceptArticle,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Array as EffectArray, Layer, Option, Order, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { textToRichTextDocument } from "../../test/feature-test-helpers.js"
import { makePersonFixture, makeProfileFixture } from "../../test/fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../../test/test-helpers.js"
import { findDatabaseRowById } from "../wiki/queries.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import {
  WikiArticleLinkInferenceWorkflow,
  WikiArticleLinkInferenceWorkflowLayer,
} from "./wiki-article-link-inference-workflow.js"

/** What the model stub infers, and an edit to make once while inferring; each test owns one. */
interface ModelStubState {
  /** Names inferred from the article's first content paragraph. */
  inferredNames: ReadonlyArray<string>
  duringInference: Effect.Effect<void>
}

/**
 * Runs share a database, so each names its articles apart from earlier runs' articles. Tests run
 * concurrently, so each takes its number once instead of reading the counter later.
 */
let runs = 0
const nextRun = () => (runs += 1)

const makeWorkflowTestLayer = (state: ModelStubState) =>
  WikiArticleLinkInferenceWorkflowLayer.pipe(
    Layer.provideMerge(
      Layer.succeed(LinkInferenceModel, {
        model: null,
        detectMentions: () => Effect.succeed([]),
        detectInferences: ({ source }) =>
          Effect.gen(function* () {
            const paragraph = source.segments.find((segment) =>
              segment.location.includes("content"),
            )

            const extractions =
              paragraph === undefined
                ? []
                : state.inferredNames.map((name) => ({
                    interval: { start: paragraph.start, end: paragraph.end },
                    alignmentStatus: null,
                    names: { pt: [name], es: [], en: [] },
                    rationale: `The content is about ${name}.`,
                  }))

            const hook = state.duringInference
            state.duringInference = Effect.void
            yield* hook

            return extractions
          }),
        disambiguate: () => Effect.succeedNone,
      }),
    ),
    Layer.provideMerge(WorkflowEngine.layerMemory),
    Layer.provideMerge(Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make)),
    Layer.provideMerge(TestLayer),
  )

const listInferredRelations = SqlSchema.findAll({
  Request: Schema.String,
  Result: WikiArticleRelationRow,
  execute: (wikiArticleId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT * FROM wiki_article_relations
        WHERE wiki_article_id = ${wikiArticleId} AND source = 'INFERENCE'
      `,
    ),
})

const createConcept = ({
  createdById,
  name,
  content,
}: {
  createdById: PersonId
  name: string
  content: string
}) =>
  Effect.flatMap(WikiArticlesRepository, (repository) =>
    repository.createWikiArticle(
      {
        createdById,
        status: "PUBLISHED",
        wikiArticle: WikiConceptArticle.EditableArticle.make({
          kind: "CONCEPT",
          attributes: WikiConceptArticle.EditableAttributes.make({}),
          translations: {
            pt: {
              commonNames: [
                Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "commonname01", name }),
              ],
              content: Option.some(textToRichTextDocument(content)),
            },
          },
        }),
      },
      { enrichment: "skip" },
    ),
  )

const approveContentEdit = (wikiArticleId: WikiArticleId, personId: PersonId) =>
  Effect.gen(function* () {
    const repository = yield* WikiArticlesRepository
    const stored = Option.getOrThrow(yield* repository.findCrdtRowById(wikiArticleId))
    const current = snapshotToLoroDoc(stored.crdtSnapshot)
    const changed = current.fork()

    yield* WikiArticleCrdt.applyEdit(changed, {
      _tag: "SetWikiArticleTranslationContent",
      language: "pt",
      content: textToRichTextDocument("Conteúdo revisado"),
    })

    const revisionId = yield* repository.createRevision({
      wikiArticleId,
      createdById: personId,
      crdtUpdate: LoroDocUpdate.make(changed.export({ mode: "update", from: current.version() })),
    })

    yield* repository.evaluateRevision(
      { revisionId, evaluatedById: personId, evaluation: "APPROVED" },
      { enrichment: "skip" },
    )
  })

describe("WikiArticleLinkInferenceWorkflow", () => {
  it.live(
    "relates the article to each other article inferred from its current content, with evidence in it, and discards runs on superseded content",
    () => {
      const state: ModelStubState = { inferredNames: [], duringInference: Effect.void }

      return assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            inferred: Schema.Array(Schema.Literals(["itself", "agrofloresta", "feijão"])),
            wasSupersededBeforeRun: Schema.Boolean,
          }),
        ),
        options: { runs: 12 },
        predicate: ({ inferred, wasSupersededBeforeRun }) =>
          Effect.gen(function* () {
            const run = nextRun()
            const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
            yield* insertPersonWithDependencies({
              person,
              profile: yield* makeProfileFixture({ id: person.id }),
            })

            const nameOf = (name: string) => `${name} ${run}`

            const ids = {
              itself: yield* createConcept({
                createdById: person.id,
                name: nameOf("mandioca"),
                content: "Raiz para farinha.",
              }),
              agrofloresta: yield* createConcept({
                createdById: person.id,
                name: nameOf("agrofloresta"),
                content: "Sistema.",
              }),
              feijão: yield* createConcept({
                createdById: person.id,
                name: nameOf("feijão"),
                content: "Leguminosa.",
              }),
            }

            const article = Option.getOrThrow(yield* findDatabaseRowById(ids.itself))

            state.inferredNames = inferred.map((name) =>
              nameOf(name === "itself" ? "mandioca" : name),
            )
            if (wasSupersededBeforeRun) yield* approveContentEdit(ids.itself, person.id)

            yield* WikiArticleLinkInferenceWorkflow.execute({
              wikiArticleId: ids.itself,
              crdtFrontier: article.currentCrdtFrontier,
            })

            const expected = wasSupersededBeforeRun
              ? []
              : EffectArray.dedupe(
                  inferred.filter((name) => name !== "itself").map((name) => ids[name]),
                )

            const persisted = yield* listInferredRelations(ids.itself)

            expect(
              EffectArray.sort(
                persisted.map((row) => row.relatedWikiArticleId),
                Order.String,
              ),
            ).toEqual(EffectArray.sort(expected, Order.String))

            expect(
              persisted.flatMap((row) =>
                row.source === "INFERENCE" ? row.evidence.map((evidence) => evidence.location) : [],
              ),
            ).toEqual(
              persisted.map(() => ["translations", "pt", "content", { id: "paragraph001" }]),
            )

            return true
          }),
      }).pipe(Effect.provide(makeWorkflowTestLayer(state)))
    },
  )

  it.live(
    "keeps the relations of a run on newer content when an older run finishes after it",
    () => {
      const state: ModelStubState = { inferredNames: [], duringInference: Effect.void }

      return Effect.gen(function* () {
        const run = nextRun()
        const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
        yield* insertPersonWithDependencies({
          person,
          profile: yield* makeProfileFixture({ id: person.id }),
        })

        const mandioca = yield* createConcept({
          createdById: person.id,
          name: `mandioca ${run}`,
          content: "Raiz para farinha.",
        })

        yield* createConcept({
          createdById: person.id,
          name: `agrofloresta ${run}`,
          content: "Sistema.",
        })

        const feijao = yield* createConcept({
          createdById: person.id,
          name: `feijão ${run}`,
          content: "Leguminosa.",
        })

        const article = Option.getOrThrow(yield* findDatabaseRowById(mandioca))
        const context = yield* Effect.context<
          WikiArticlesRepository | WorkflowEngine.WorkflowEngine | SqlClient.SqlClient | IdGen
        >()

        // The approval submits the newer run and interrupts this one, which keeps inferring anyway.
        state.inferredNames = [`agrofloresta ${run}`]

        state.duringInference = Effect.gen(function* () {
          state.inferredNames = [`feijão ${run}`]
          yield* approveContentEdit(mandioca, person.id)
          const approved = Option.getOrThrow(yield* findDatabaseRowById(mandioca))
          yield* WikiArticleLinkInferenceWorkflow.execute({
            wikiArticleId: mandioca,
            crdtFrontier: approved.currentCrdtFrontier,
          })
        }).pipe(Effect.provideContext(context), Effect.orDie)

        yield* Effect.exit(
          WikiArticleLinkInferenceWorkflow.execute({
            wikiArticleId: mandioca,
            crdtFrontier: article.currentCrdtFrontier,
          }),
        )

        const persisted = yield* listInferredRelations(mandioca)
        expect(persisted.map((row) => row.relatedWikiArticleId)).toEqual([feijao])
      }).pipe(Effect.provide(makeWorkflowTestLayer(state)))
    },
  )
})
