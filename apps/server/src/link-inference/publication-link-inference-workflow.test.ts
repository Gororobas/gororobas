import { describe, expect, it } from "@effect/vitest"
import {
  IdGen,
  LinkInferenceModel,
  type LoroDocFrontier,
  LoroDocUpdate,
  PersonId,
  PublicationCrdt,
  type PublicationId,
  PublicationSourceRow,
  PublicationWikiArticleRow,
  snapshotToLoroDoc,
  TiptapNodeId,
  type TiptapDocument,
  WikiArticleCommonNameInCrdtList,
  WikiConceptArticle,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { DateTime, Effect, Layer, Option, Schema, Struct } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import {
  makePersonFixture,
  makePostPublicationInput,
  makeProfileFixture,
} from "../../test/fixtures.js"
import {
  insertPersonWithDependencies,
  LinkInferenceTestLayer,
  TestLayer,
} from "../../test/test-helpers.js"
import { HumanCrdtUpdate } from "../publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../publications/repository.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import { LINK_INFERENCE_VERSION } from "./link-inference-version.js"
import {
  PublicationLinkInferenceWorkflow,
  PublicationLinkInferenceWorkflowLayer,
} from "./publication-link-inference-workflow.js"

const Repositories = Layer.mergeAll(
  Layer.effect(PublicationsRepository, PublicationsRepository.make),
  Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make),
)

const WorkflowTestLayer = Repositories.pipe(
  Layer.provideMerge(LinkInferenceTestLayer),
  Layer.provideMerge(TestLayer),
)

/** Runs once, while the next run is inferring, standing in for an edit made meanwhile. */
const makeInterleavingTestLayer = (duringInference: { effect: Effect.Effect<void> }) =>
  Repositories.pipe(
    Layer.provideMerge(
      PublicationLinkInferenceWorkflowLayer.pipe(
        Layer.provide(
          Layer.succeed(LinkInferenceModel, {
            model: null,
            detectMentions: () =>
              Effect.suspend(() => {
                const hook = duringInference.effect
                duringInference.effect = Effect.void
                return hook
              }).pipe(Effect.as([])),
            detectInferences: () => Effect.succeed([]),
            disambiguate: () => Effect.succeedNone,
          }),
        ),
      ),
    ),
    Layer.provideMerge(WorkflowEngine.layerMemory),
    Layer.provideMerge(TestLayer),
  )

const listLinks = SqlSchema.findAll({
  Request: Schema.String,
  Result: PublicationWikiArticleRow,
  execute: (publicationId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT * FROM publication_wiki_articles
        WHERE publication_id = ${publicationId}
        ORDER BY source
      `,
    ),
})

const findLinkInference = SqlSchema.findOne({
  Request: Schema.String,
  Result: PublicationSourceRow.mapFields(Struct.pick(["linkInference"])),
  execute: (publicationId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT link_inference FROM publication_sources WHERE id = ${publicationId}`,
    ),
})

const paragraphId = TiptapNodeId.make("paragraph001")
/**
 * Runs share a database, so each uses its own names and handles. Tests run concurrently, so each
 * takes its number once instead of reading the counter later.
 */
let runs = 0
const nextRun = () => (runs += 1)

const content = (text: string): TiptapDocument => ({
  type: "doc",
  version: 1,
  content: [
    { type: "paragraph", attrs: { nodeId: paragraphId }, content: [{ type: "text", text }] },
  ],
})

const editSourceContent = (input: {
  publicationId: PublicationId
  personId: PersonId
  expectedCurrentCrdtFrontier: LoroDocFrontier
  text: string
}) =>
  Effect.gen(function* () {
    const publications = yield* PublicationsRepository

    const stored = Option.getOrThrow(
      yield* PublicationsRepository.make.pipe(
        Effect.flatMap((repository) =>
          repository.findPublicationCrdtSnapshotById(input.publicationId),
        ),
      ),
    )

    const current = snapshotToLoroDoc(stored.crdtSnapshot)
    const edited = current.fork()
    yield* PublicationCrdt.applyEdit(edited, {
      _tag: "SetPublicationSourceContent",
      content: content(input.text),
    })

    yield* publications.updatePublication(
      HumanCrdtUpdate.make({
        authorId: input.personId,
        crdtUpdate: LoroDocUpdate.make(edited.export({ mode: "update", from: current.version() })),
        expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
        publicationId: input.publicationId,
      }),
    )

    return Option.getOrThrow(yield* publications.findPublicationRowById(input.publicationId))
      .currentCrdtFrontier
  })

const createConcept = (input: { createdById: PersonId; name: string }) =>
  Effect.flatMap(WikiArticlesRepository, (repository) =>
    repository.createWikiArticle(
      {
        createdById: input.createdById,
        status: "PUBLISHED",
        wikiArticle: WikiConceptArticle.EditableArticle.make({
          kind: "CONCEPT",
          attributes: WikiConceptArticle.EditableAttributes.make({}),
          translations: {
            pt: {
              commonNames: [
                Schema.decodeSync(WikiArticleCommonNameInCrdtList)({
                  id: "commonname01",
                  name: input.name,
                }),
              ],
              content: Option.none(),
            },
          },
        }),
      },
      { enrichment: "skip" },
    ),
  )

const createPost = (run: number) =>
  Effect.gen(function* () {
    const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
    yield* insertPersonWithDependencies({
      person,
      profile: yield* makeProfileFixture({ id: person.id }),
    })
    const publications = yield* PublicationsRepository
    const personId = PersonId.make(person.id)

    const publicationId = yield* publications.createPublication({
      createdById: personId,
      ...makePostPublicationInput({
        content: content(`Plantamos feijão ${run} entre o milho.`),
        handle: `plantio-de-feijao-${run}`,
        ownerProfileId: person.id,
        publishedAt: yield* DateTime.now,
      }),
    })

    const created = Option.getOrThrow(yield* publications.findPublicationRowById(publicationId))
    return { personId, publicationId, crdtFrontier: created.currentCrdtFrontier }
  })

describe("PublicationLinkInferenceWorkflow", () => {
  it.live(
    "links the publication to the articles its source content names, unless the content changed since",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(Schema.Struct({ wasEditedBeforeRun: Schema.Boolean })),
        options: { runs: 6 },
        predicate: ({ wasEditedBeforeRun }) =>
          Effect.gen(function* () {
            const run = nextRun()
            const { personId, publicationId, crdtFrontier } = yield* createPost(run)
            const feijao = yield* createConcept({ createdById: personId, name: `Feijão ${run}` })

            if (wasEditedBeforeRun) {
              yield* editSourceContent({
                publicationId,
                personId,
                expectedCurrentCrdtFrontier: crdtFrontier,
                text: "Colhemos abóboras.",
              })
            }

            yield* PublicationLinkInferenceWorkflow.execute({ publicationId, crdtFrontier })

            const links = yield* listLinks(publicationId)
            const { linkInference } = yield* findLinkInference(publicationId)

            expect(links).toEqual(
              wasEditedBeforeRun
                ? []
                : [
                    {
                      publicationId,
                      wikiArticleId: feijao,
                      source: "MENTION",
                      evidence: [
                        {
                          location: ["sourceContent", { id: paragraphId }],
                          text: `feijão ${run}`,
                        },
                      ],
                    },
                  ],
            )

            expect(
              linkInference && { ...linkInference, startedAt: null, finishedAt: null },
            ).toEqual(
              wasEditedBeforeRun
                ? null
                : {
                    version: LINK_INFERENCE_VERSION,
                    model: null,
                    crdtFrontier,
                    startedAt: null,
                    finishedAt: null,
                    suggestions: [],
                  },
            )

            return true
          }),
      }).pipe(Effect.provide(WorkflowTestLayer)),
  )

  it.live("keeps the links of a run on newer content when an older run finishes after it", () => {
    const duringInference = { effect: Effect.void }

    return Effect.gen(function* () {
      const run = nextRun()
      const { personId, publicationId, crdtFrontier } = yield* createPost(run)
      yield* createConcept({ createdById: personId, name: `Feijão ${run}` })
      const abobora = yield* createConcept({ createdById: personId, name: `Abóbora ${run}` })

      const context = yield* Effect.context<
        PublicationsRepository | WorkflowEngine.WorkflowEngine | IdGen | SqlClient.SqlClient
      >()
      let editedCrdtFrontier: LoroDocFrontier | undefined

      duringInference.effect = Effect.gen(function* () {
        editedCrdtFrontier = yield* editSourceContent({
          publicationId,
          personId,
          expectedCurrentCrdtFrontier: crdtFrontier,
          text: `Colhemos abóbora ${run}.`,
        })

        yield* PublicationLinkInferenceWorkflow.execute({
          publicationId,
          crdtFrontier: editedCrdtFrontier,
        })
      }).pipe(Effect.provideContext(context), Effect.orDie)

      yield* PublicationLinkInferenceWorkflow.execute({ publicationId, crdtFrontier })

      const links = yield* listLinks(publicationId)
      const { linkInference } = yield* findLinkInference(publicationId)

      expect(links.map((link) => link.wikiArticleId)).toEqual([abobora])
      expect(linkInference?.crdtFrontier).toEqual(editedCrdtFrontier)
    }).pipe(Effect.provide(makeInterleavingTestLayer(duringInference)))
  })
})
