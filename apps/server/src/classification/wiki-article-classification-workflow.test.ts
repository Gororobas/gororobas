import { describe, expect, it } from "@effect/vitest"
import {
  LoroDocUpdate,
  type PersonId,
  snapshotToLoroDoc,
  WikiArticleCommonNameInCrdtList,
  WikiArticleCrdt,
  type WikiArticleId,
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
  WikiArticleClassificationWorkflow,
  WikiArticleClassificationWorkflowLayer,
} from "./wiki-article-classification-workflow.js"
import { type ClassifiedWikiArticle, WikiArticleClassifier } from "./wiki-article-classifier.js"

/** What the classifier stub recognizes in any content; set by each property run. */
let recognized: ReadonlyArray<ClassifiedWikiArticle> = []

const WorkflowTestLayer = WikiArticleClassificationWorkflowLayer.pipe(
  Layer.provideMerge(
    Layer.succeed(WikiArticleClassifier, { classify: () => Effect.sync(() => recognized) }),
  ),
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provideMerge(Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make)),
  Layer.provideMerge(TestLayer),
)

const listClassifiedRelations = SqlSchema.findAll({
  Request: Schema.String,
  Result: Schema.Struct({ relatedWikiArticleId: Schema.String }),
  execute: (wikiArticleId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT related_wiki_article_id FROM wiki_article_relations
        WHERE wiki_article_id = ${wikiArticleId} AND source = 'CLASSIFICATION'
      `,
    ),
})

const createConcept = (createdById: PersonId, name: string) =>
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
                Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "classified01", name }),
              ],
              content: Option.some(textToRichTextDocument(name)),
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

describe("WikiArticleClassificationWorkflow", () => {
  it.live(
    "relates the article to each other article recognized in its current content, and discards runs on superseded content",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            recognizedNames: Schema.Array(Schema.Literals(["itself", "agrofloresta", "feijão"])),
            wasSupersededBeforeRun: Schema.Boolean,
          }),
        ),
        options: { runs: 12 },
        predicate: ({ recognizedNames, wasSupersededBeforeRun }) =>
          Effect.gen(function* () {
            const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
            yield* insertPersonWithDependencies({
              person,
              profile: yield* makeProfileFixture({ id: person.id }),
            })

            const ids = {
              itself: yield* createConcept(person.id, "mandioca"),
              agrofloresta: yield* createConcept(person.id, "agrofloresta"),
              feijão: yield* createConcept(person.id, "feijão"),
            }

            const classified = Option.getOrThrow(yield* findDatabaseRowById(ids.itself))

            recognized = recognizedNames.map((name) => ({
              wikiArticleId: ids[name],
              extractionText: name,
            }))
            if (wasSupersededBeforeRun) yield* approveContentEdit(ids.itself, person.id)

            yield* WikiArticleClassificationWorkflow.execute({
              wikiArticleId: ids.itself,
              crdtFrontier: classified.currentCrdtFrontier,
            })

            const expected = wasSupersededBeforeRun
              ? []
              : EffectArray.dedupe(
                  recognizedNames.filter((name) => name !== "itself").map((name) => ids[name]),
                )

            const persisted = yield* listClassifiedRelations(ids.itself)

            expect(
              EffectArray.sort(
                persisted.map((row) => row.relatedWikiArticleId),
                Order.String,
              ),
            ).toEqual(EffectArray.sort(expected, Order.String))

            return true
          }),
      }).pipe(Effect.provide(WorkflowTestLayer)),
  )
})
