import { NodeServices } from "@effect/platform-node"
import { expect } from "@effect/vitest"
import {
  SessionContext,
  WikiArticleCommonNameInCrdtList,
  WikiArticleCrdt,
  WikiArticleId,
  WikiPlantArticle,
  snapshotToLoroDoc,
  LoroDocUpdate,
  type PendingReview,
} from "@gororobas/domain"
import { And, describeFeature, Given, runSteps, Then, When } from "@gororobas/effect-bdd"
import { VISITOR_SESSION } from "@gororobas/server/session-service"
import { Effect, Layer, Match, Option, Record, Schema } from "effect"
import { TestClock } from "effect/testing"
import { WorkflowEngine } from "effect/workflow"

import { ModerationService } from "../src/moderation/service.js"
import { PeopleService } from "../src/people/service.js"
import { findSourceRowById, listPendingRevisionsByWikiArticleId } from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { WikiArticlesService } from "../src/wiki/service.js"
import {
  PeopleBackground,
  PeopleFeatureTestLayer,
  PeopleTestDataTable,
  personNamed,
  provisionPeople,
  textToRichTextDocument,
  withPerson,
} from "./feature-test-helpers.js"
import { withSession } from "./test-helpers.js"

const ModerationTestLayer = Layer.mergeAll(
  Layer.effect(ModerationService, ModerationService.make),
  Layer.effect(WikiArticlesService, WikiArticlesService.make),
).pipe(Layer.provideMerge(PeopleFeatureTestLayer), Layer.provideMerge(WorkflowEngine.layerMemory))

const ModerationBackground = Schema.Struct({
  ...PeopleBackground.fields,
  articles: Schema.Record(Schema.String, WikiArticleId),
})

type ModerationContext = typeof ModerationBackground.Type & {
  queue?: ReadonlyArray<PendingReview>
  error?: unknown
}

const NamedPerson = Schema.Struct({ name: Schema.String })
const NamedArticle = Schema.Struct({ title: Schema.String })
const NamedProposal = Schema.Struct({ ...NamedPerson.fields, ...NamedArticle.fields })

/** Gives each setup action its own timestamp, so the queue's ordering is observable. */
const later = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.tap(effect, () => TestClock.adjust("1 minute"))

const asActor = <A, E, R>({
  context,
  name,
  action,
}: {
  context: ModerationContext
  name: string
  action: Effect.Effect<A, E, R | SessionContext>
}) =>
  name === "visitors"
    ? withSession(action, VISITOR_SESSION)
    : withPerson(action, personNamed(context.actors, name))

const articleId = (context: ModerationContext, title: string) =>
  Option.getOrThrow(Option.fromUndefinedOr(context.articles[title]))

const plant = (title: string) =>
  WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        commonNames: [
          Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "wikicommon01", name: title }),
        ],
        content: Option.some(textToRichTextDocument(`Sobre ${title}`)),
        origin: Option.none(),
      },
    },
  })

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) =>
      later(provisionPeople(table)).pipe(
        Effect.map((people): ModerationContext => ({ ...people, articles: {} })),
      ),
  })

const publishedArticle = () =>
  And("the wiki article {string:title} is published", {
    params: NamedArticle,
    handler: (context: ModerationContext, { title }) =>
      Effect.gen(function* () {
        const id = yield* (yield* WikiArticlesRepository).createWikiArticle(
          { wikiArticle: plant(title), createdById: context.administratorId, status: "PUBLISHED" },
          { enrichment: "skip" },
        )
        return { ...context, articles: { ...context.articles, [title]: id } }
      }).pipe(later),
  })

const proposedCreation = () =>
  And("{string:name} proposed the new wiki article {string:title}", {
    params: NamedProposal,
    handler: (context: ModerationContext, { name, title }) =>
      Effect.gen(function* () {
        const id = yield* asActor({
          context,
          name,
          action: (yield* WikiArticlesService).createWikiArticle({ wikiArticle: plant(title) }),
        })

        return { ...context, articles: { ...context.articles, [title]: id } }
      }).pipe(later),
  })

const proposedEdit = () =>
  And("{string:name} proposed an edit to the wiki article {string:title}", {
    params: NamedProposal,
    handler: (context: ModerationContext, { name, title }) =>
      Effect.gen(function* () {
        const id = articleId(context, title)
        const stored = Option.getOrThrow(yield* findSourceRowById(id))
        const original = snapshotToLoroDoc(stored.crdtSnapshot)
        const changed = original.fork()

        yield* WikiArticleCrdt.applyEdit(changed, {
          _tag: "SetWikiArticleTranslationContent",
          language: "pt",
          content: textToRichTextDocument(`Mais sobre ${title}`),
        })

        changed.commit()

        yield* asActor({
          context,
          name,
          action: (yield* WikiArticlesService).createRevision(id, {
            crdtUpdate: LoroDocUpdate.make(
              changed.export({ mode: "update", from: original.version() }),
            ),
          }),
        })

        return context
      }).pipe(later),
  })

const promoted = () =>
  Given("{string:actor} promoted {string:target} to COMMUNITY", {
    params: Schema.Struct({ actor: Schema.String, target: Schema.String }),
    handler: (context: ModerationContext, { actor, target }) =>
      asActor({
        context,
        name: actor,
        action: PeopleService.use((people) =>
          people.setAccessLevel(personNamed(context.actors, target), "COMMUNITY"),
        ),
      }).pipe(Effect.as(context)),
  })

const approvedRevision = () =>
  And("{string:name} approved the pending revision of {string:title}", {
    params: NamedProposal,
    handler: (context: ModerationContext, { name, title }) =>
      Effect.gen(function* () {
        const [revision] = yield* listPendingRevisionsByWikiArticleId(articleId(context, title))
        const revisionId = Option.getOrThrow(Option.fromUndefinedOr(revision)).id

        yield* asActor({
          context,
          name,
          action: (yield* WikiArticlesService).evaluateRevision(revisionId, {
            evaluation: "APPROVED",
          }),
        })

        return context
      }),
  })

const opensQueue = () =>
  When("{string:name} opens the moderation queue", {
    params: NamedPerson,
    handler: (context: ModerationContext, { name }) =>
      asActor({
        context,
        name,
        action: ModerationService.use((service) => service.listQueue),
      }).pipe(Effect.map((queue) => ({ ...context, queue }))),
  })

const triesToOpenQueue = () =>
  When("{string:name} tries to open the moderation queue", {
    params: NamedPerson,
    handler: (context: ModerationContext, { name }) =>
      asActor({
        context,
        name,
        action: ModerationService.use((service) => service.listQueue),
      }).pipe(
        Effect.flip,
        Effect.map((error) => ({ ...context, error })),
      ),
  })

const accessDenied = () =>
  Then("access is denied", {
    handler: (context: ModerationContext) =>
      Effect.sync(() => {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const ReviewTable = Schema.Struct({
  table: Schema.Array(
    Schema.Struct({
      review: Schema.Literals([
        "newcomer awaiting approval",
        "revision proposing a new article",
        "revision awaiting evaluation",
      ]),
      subject: Schema.String,
    }),
  ),
})

const queueLists = () =>
  Then("the moderation queue lists:", {
    params: ReviewTable,
    handler: (context: ModerationContext, { table }) =>
      Effect.sync(() => {
        const titleById = Record.fromEntries(
          Record.toEntries(context.articles).map(([title, id]) => [id, title] as const),
        )
        const nameById = Record.fromEntries(
          Record.toEntries(context.actors).map(([name, id]) => [id, name] as const),
        )

        const listed = (context.queue ?? []).map((pending) =>
          Match.valueTags(pending, {
            NewcomerAwaitingApproval: (review) => ({
              review: "newcomer awaiting approval",
              subject: nameById[review.personId],
            }),
            RevisionAwaitingEvaluation: (review) => ({
              review: review.proposesNewArticle
                ? "revision proposing a new article"
                : "revision awaiting evaluation",
              subject: titleById[review.wikiArticleId],
            }),
          }),
        )

        expect(listed).toEqual(table)
        return context
      }),
  })

await Effect.runPromise(
  describeFeature("./moderation.feature", ({ Background, Scenario, ScenarioOutline }) => {
    Background({
      layer: ModerationTestLayer,
      steps: () => runSteps(givenPeople(), publishedArticle(), proposedCreation(), proposedEdit()),
    })

    Scenario("Moderators see every pending review, oldest first", {
      layer: ModerationTestLayer,
      steps: () => runSteps(opensQueue(), queueLists()),
    })

    Scenario("Resolving a review removes it from everyone's queue", {
      layer: ModerationTestLayer,
      steps: () => runSteps(promoted(), approvedRevision(), opensQueue(), queueLists()),
    })

    ScenarioOutline("Only moderators and admins can open the moderation queue", {
      layer: ModerationTestLayer,
      steps: () => runSteps(triesToOpenQueue(), accessDenied()),
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)
