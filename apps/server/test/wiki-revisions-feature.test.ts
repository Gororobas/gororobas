import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Handle,
  IdGen,
  LoroDocUpdate,
  type LoroDocSnapshot,
  WikiArticleCommonNameInCrdtList,
  SessionContext,
  SupportedLanguage,
  WikiArticleCrdt,
  WikiArticleId,
  WikiArticleRevisionId,
  WikiArticleRevisionRow,
  WikiPlantArticle,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { And, describeFeature, Given, runSteps, Then, When } from "@gororobas/effect-bdd"
import { VISITOR_SESSION } from "@gororobas/server/session-service"
import { Array as EffectArray, Effect, Layer, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"
import { LoroDoc } from "loro-crdt"

import { insertRevisionRow, updateSourceRow } from "../src/wiki/mutations.js"
import {
  findDatabaseRowById,
  findSourceRowById,
  findRevisionById,
  listPendingRevisionsByWikiArticleId,
} from "../src/wiki/queries.js"
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

const WikiTestLayer = Layer.effect(WikiArticlesService, WikiArticlesService.make).pipe(
  Layer.provideMerge(PeopleFeatureTestLayer),
  Layer.provideMerge(WorkflowEngine.layerMemory),
)
const WikiBackground = Schema.Struct({
  ...PeopleBackground.fields,
  articles: Schema.Record(Schema.String, WikiArticleId),
})

type WikiContext = typeof WikiBackground.Type & {
  revisionId?: WikiArticleRevisionId
  error?: unknown
  history?: readonly WikiArticleRevisionRow[]
  historyEvaluation?: WikiArticleRevisionRow["evaluation"] | undefined
  expectedHistory?: readonly {
    id: WikiArticleRevisionId
    editor: string
    evaluation: "APPROVED" | "REJECTED"
    evaluator: string
    content: string
  }[]
  concurrent?: readonly WikiArticleRevisionId[]
  opposite?: {
    articleId: WikiArticleId
    revisions: readonly WikiArticleRevisionId[]
    snapshot: LoroDocSnapshot
  }
}

const titleParams = Schema.Struct({ title: Schema.String })
const nameParams = Schema.Struct({ name: Schema.String })
const nameTitleParams = Schema.Struct({ ...nameParams.fields, ...titleParams.fields })
const proposalParams = Schema.Struct({ ...nameTitleParams.fields, content: Schema.String })
const articleId = (context: WikiContext, title: string) =>
  Option.getOrThrow(Option.fromUndefinedOr(context.articles[title]))
const revisionId = (context: WikiContext) =>
  Option.getOrThrow(Option.fromUndefinedOr(context.revisionId))
const currentRevision = (context: WikiContext) =>
  findRevisionById(revisionId(context)).pipe(Effect.map(Option.getOrThrow))

const act = <A, E, R>({
  context,
  name,
  action,
}: {
  context: WikiContext
  name: string | undefined
  action: Effect.Effect<A, E, R | SessionContext>
}) =>
  name === undefined
    ? withSession(action, VISITOR_SESSION)
    : withPerson(action, personNamed(context.actors, name))

const plant = (title: string, content: string) =>
  WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        commonNames: [
          Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "wikicommon01", name: title }),
        ],
        content: Option.some(textToRichTextDocument(content)),

        origin: Option.none(),
      },
    },
  })

const setupPeople = (table: typeof PeopleTestDataTable.Type.table) =>
  provisionPeople(table).pipe(Effect.map((people): WikiContext => ({ ...people, articles: {} })))

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) => setupPeople(table),
  })

const seed = ({
  context,
  title,
  content = "Original content",
}: {
  context: WikiContext
  title: string
  content?: string
}) =>
  Effect.gen(function* () {
    const id = yield* (yield* WikiArticlesRepository).createWikiArticle(
      {
        wikiArticle: plant(title, content),
        createdById: context.administratorId,
        status: "PUBLISHED",
      },
      { enrichment: "skip" },
    )

    return { ...context, articles: { ...context.articles, [title]: id } }
  })

const proposeCreation = ({
  context,
  name,
  title,
  content,
}: {
  context: WikiContext
  name: string | undefined
  title: string
  content: string
}) =>
  Effect.gen(function* () {
    const id = yield* act({
      context,
      name,
      action: (yield* WikiArticlesService).createWikiArticle({
        wikiArticle: plant(title, content),
      }),
    })

    const pending = yield* listPendingRevisionsByWikiArticleId(id)
    expect(pending).toHaveLength(1)

    return {
      ...context,
      articles: { ...context.articles, [title]: id },
      revisionId: Option.getOrThrow(Option.fromUndefinedOr(pending[0])).id,
    }
  })

const contentUpdate = ({
  id,
  language,
  content,
}: {
  id: WikiArticleId
  language: SupportedLanguage
  content: string
}) =>
  Effect.gen(function* () {
    const stored = Option.getOrThrow(yield* findSourceRowById(id))
    const original = snapshotToLoroDoc(stored.crdtSnapshot)
    const changed = original.fork()

    if (changed.getMap("translations").get(language) === undefined) {
      yield* WikiArticleCrdt.applyEdit(changed, {
        _tag: "AddedWikiArticleTranslation",
        language,
        value: yield* Schema.decodeEffect(WikiPlantArticle.EditableTranslation)({
          commonNames: [{ id: "wikispanish1", name: "Mandioca" }],
        }),
      })
    }

    yield* WikiArticleCrdt.applyEdit(changed, {
      _tag: "SetWikiArticleTranslationContent",
      language,
      content: textToRichTextDocument(content),
    })

    changed.commit()
    return LoroDocUpdate.make(changed.export({ mode: "update", from: original.version() }))
  })

const propose = ({
  context,
  name,
  title,
  content = "Approved edit",
  language = "pt",
}: {
  context: WikiContext
  name: string | undefined
  title: string
  content?: string
  language?: SupportedLanguage
}) =>
  Effect.gen(function* () {
    const id = articleId(context, title)
    const stored = yield* findSourceRowById(id)
    const crdtUpdate = yield* contentUpdate({ id, language, content })

    const revisionId = yield* act({
      context,
      name,
      action: (yield* WikiArticlesService).createRevision(id, { crdtUpdate }),
    })

    expect(yield* findSourceRowById(id)).toEqual(stored)
    const revision = Option.getOrThrow(yield* findRevisionById(revisionId))
    expect(revision.evaluation).toBe("PENDING")
    expect(revision.evaluatedById).toEqual(Option.none())
    expect(revision.evaluatedAt).toEqual(Option.none())

    return { ...context, revisionId }
  })

const evaluate = ({
  context,
  name,
  evaluation,
}: {
  context: WikiContext
  name: string
  evaluation: "APPROVED" | "REJECTED"
}) =>
  Effect.gen(function* () {
    yield* act({
      context,
      name,
      action: (yield* WikiArticlesService).evaluateRevision(revisionId(context), { evaluation }),
    })

    return context
  })

const publishedContent = ({
  context,
  title,
  language = "pt",
}: {
  context: WikiContext
  title: string
  language?: SupportedLanguage
}) =>
  Effect.gen(function* () {
    const page = yield* withSession(
      (yield* WikiArticlesService).getPage({
        handle: Handle.make(title.toLowerCase()),
        kind: "PLANT",
        language,
      }),
      VISITOR_SESSION,
    )

    expect(page.id).toBe(articleId(context, title))
    expect(page.language).toBe(language)
    return page.content
  })

const expectContent = ({
  context,
  title,
  content,
  language = "pt",
}: {
  context: WikiContext
  title: string
  content: string
  language?: SupportedLanguage
}) =>
  publishedContent({ context, title, language }).pipe(
    Effect.tap((actual) =>
      Effect.sync(() => expect(actual).toEqual(Option.some(textToRichTextDocument(content)))),
    ),
    Effect.as(context),
  )

const denied = () =>
  Then("access is denied", {
    handler: (context: WikiContext) =>
      Effect.sync(() => {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const noCreation = () =>
  And("no creation revision is created", {
    handler: (context: WikiContext) =>
      Effect.gen(function* () {
        const repository = yield* WikiArticlesRepository
        expect(yield* repository.findBySearchableName("mandioca")).toEqual(Option.none())
        const sql = yield* SqlClient.SqlClient
        expect(yield* sql`SELECT id FROM wiki_article_revisions`).toHaveLength(0)
        expect(yield* sql`SELECT id FROM wiki_article_sources`).toHaveLength(0)
        return context
      }),
  })

const creation = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: proposalParams,
    handler: (context: WikiContext, { name, title, content }) =>
      proposeCreation({ context, name, title, content }),
  })

const exists = () =>
  Given("a wiki article {string:title} exists", {
    params: titleParams,
    handler: (context: WikiContext, { title }) => seed({ context, title }),
  })

const edit = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: nameTitleParams,
    handler: (context: WikiContext, { name, title }) => propose({ context, name, title }),
  })

const deniedEdit = (visitor = false) =>
  When(
    visitor
      ? "visitors try to propose an edit to wiki article {string:title}"
      : "{string:name} tries to propose an edit to wiki article {string:title}",
    {
      params: Schema.Struct({ ...titleParams.fields, name: Schema.optional(Schema.String) }),
      handler: (context: WikiContext, { name, title }) =>
        Effect.gen(function* () {
          const id = articleId(context, title)
          const service = yield* WikiArticlesService
          const stored = yield* findSourceRowById(id)
          const history = yield* service.listRevisionHistory({ wikiArticleId: id })
          const error = yield* propose({ context, name, title }).pipe(Effect.flip)
          expect(yield* findSourceRowById(id)).toEqual(stored)
          expect(yield* service.listRevisionHistory({ wikiArticleId: id })).toEqual(history)
          return { ...context, error }
        }),
    },
  )

const approval = ({
  keyword,
  pattern,
  evaluation = "APPROVED",
}: {
  keyword: typeof Given
  pattern: string
  evaluation?: "APPROVED" | "REJECTED"
}) =>
  keyword(pattern, {
    params: nameParams,
    handler: (context: WikiContext, { name }) => evaluate({ context, name, evaluation }),
  })

const deniedApproval = (creation = false) =>
  When(
    creation
      ? "{string:name} tries to approve the creation revision"
      : "{string:name} tries to approve the revision",
    {
      params: nameParams,
      handler: (context: WikiContext, { name }) =>
        evaluate({ context, name, evaluation: "APPROVED" }).pipe(
          Effect.flip,
          Effect.map((error) => ({ ...context, error })),
          Effect.tap(() =>
            currentRevision(context).pipe(
              Effect.tap((row) => Effect.sync(() => expect(row.evaluation).toBe("PENDING"))),
            ),
          ),
        ),
    },
  )

const evaluationStatus = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: Schema.Struct({ evaluation: WikiArticleRevisionRow.fields.evaluation }),
    handler: (context: WikiContext, { evaluation }) =>
      currentRevision(context).pipe(
        Effect.tap((row) =>
          Effect.sync(() => {
            expect(row.evaluation).toBe(evaluation)
            expect(Option.isSome(row.evaluatedAt)).toBe(evaluation !== "PENDING")
          }),
        ),
        Effect.as(context),
      ),
  })

const evaluator = (pattern: string, self = false) =>
  And(pattern, {
    params: nameParams,
    handler: (context: WikiContext, { name }) =>
      currentRevision(context).pipe(
        Effect.tap((row) =>
          Effect.sync(() => {
            expect(row.evaluatedById).toEqual(Option.some(personNamed(context.actors, name)))
            expect(row.createdById === personNamed(context.actors, name)).toBe(self)
          }),
        ),
        Effect.as(context),
      ),
  })

const pending = (creation = false) =>
  Then(
    creation
      ? "a creation revision is created with {string:evaluation} evaluation, created by {string:name}"
      : "a revision is created with {string:evaluation} evaluation, created by {string:name}",
    {
      params: Schema.Struct({
        ...nameParams.fields,
        evaluation: WikiArticleRevisionRow.fields.evaluation,
      }),
      handler: (context: WikiContext, { name, evaluation }) =>
        currentRevision(context).pipe(
          Effect.tap((row) =>
            Effect.sync(() => {
              expect(row.evaluation).toBe(evaluation)
              expect(row.createdById).toBe(personNamed(context.actors, name))
              expect(row.evaluatedById).toEqual(Option.none())
              expect(row.evaluatedAt).toEqual(Option.none())
              expect(EffectArray.isReadonlyArrayEmpty(row.fromCrdtFrontier)).toBe(creation)
            }),
          ),
          Effect.as(context),
        ),
    },
  )

const invisible = () =>
  And("{string:title} is not visible in the encyclopedia", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      Effect.gen(function* () {
        const service = yield* WikiArticlesService
        expect(
          (yield* service.listCards("pt")).some((row) => row.id === articleId(context, title)),
        ).toBe(false)
        return context
      }),
  })

const inaccessible = () =>
  And("visitors cannot access wiki article {string:title}", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      Effect.gen(function* () {
        const service = yield* WikiArticlesService

        expect(
          yield* withSession(
            service.getPage({
              handle: Handle.make(title.toLowerCase()),
              kind: "PLANT",
              language: "pt",
            }),
            VISITOR_SESSION,
          ).pipe(Effect.flip),
        ).toMatchObject({ _tag: "WikiArticleNotFoundError" })

        expect(
          yield* withSession(
            service.getPublishedArticle(articleId(context, title)),
            VISITOR_SESSION,
          ).pipe(Effect.flip),
        ).toMatchObject({ _tag: "WikiArticleNotFoundError" })

        return context
      }),
  })

const visible = () =>
  And("{string:title} is visible in the encyclopedia with content {string:content}", {
    params: Schema.Struct({ ...titleParams.fields, content: Schema.String }),
    handler: (context: WikiContext, { title, content }) =>
      Effect.gen(function* () {
        expect(
          (yield* (yield* WikiArticlesService).listCards("pt")).map((row) => row.id),
        ).toContain(articleId(context, title))
        return yield* expectContent({ context, title, content })
      }),
  })

const accessible = () =>
  And("visitors can access wiki article {string:title}", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      withSession(
        WikiArticlesService.use((service) =>
          service.getPublishedArticle(articleId(context, title)),
        ),
        VISITOR_SESSION,
      ).pipe(Effect.as(context)),
  })

const unchanged = () =>
  And("the wiki article {string:title} remains unchanged", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      expectContent({ context, title, content: "Original content" }),
  })

const reflected = () =>
  And("the wiki article {string:title} reflects the approved edit", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      expectContent({ context, title, content: "Approved edit" }),
  })

const history = ({
  keyword,
  pattern,
  filtered = false,
}: {
  keyword: typeof Given
  pattern: string
  filtered?: boolean
}) =>
  keyword(pattern, {
    params: Schema.Struct({
      ...titleParams.fields,
      evaluation: Schema.optional(WikiArticleRevisionRow.fields.evaluation),
    }),
    handler: (context: WikiContext, { title, evaluation }) =>
      WikiArticlesService.use((service) =>
        service.listRevisionHistory({
          wikiArticleId: articleId(context, title),
          evaluation: filtered ? evaluation : undefined,
        }),
      ).pipe(
        Effect.map((history): WikiContext => ({
          ...context,
          history,
          historyEvaluation: filtered ? evaluation : undefined,
        })),
      ),
  })

const rejectedVisible = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    handler: (context: WikiContext) =>
      Effect.gen(function* () {
        const revision = yield* currentRevision(context)

        const rows =
          context.history ??
          (yield* (yield* WikiArticlesService).listRevisionHistory({
            wikiArticleId: revision.wikiArticleId,
          }))

        expect(rows.find((row) => row.id === revision.id)).toEqual(revision)
        expect(revision.evaluation).toBe("REJECTED")
        return context
      }),
  })

const deniedCreation = (visitor = false) =>
  When(
    visitor
      ? "a visitor tries to create a wiki article"
      : "{string:name} tries to create a wiki article",
    {
      params: Schema.Struct({ name: Schema.optional(Schema.String) }),
      handler: (context: WikiContext, { name }) =>
        proposeCreation({
          context,
          name,
          title: "Mandioca",
          content: "Raiz tuberosa",
        }).pipe(
          Effect.flip,
          Effect.map((error) => ({ ...context, error })),
        ),
    },
  )

const publishedSeed = () =>
  And("the published wiki article {string:title} exists with content {string:content}", {
    params: Schema.Struct({ ...titleParams.fields, content: Schema.String }),
    handler: (context: WikiContext, { title, content }) => seed({ context, title, content }),
  })

const contentProposal = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: proposalParams,
    handler: (context: WikiContext, { name, title, content }) =>
      propose({ context, name, title, content }),
  })

const translationProposal = (pattern: string) =>
  Given(pattern, {
    params: Schema.Struct({ ...proposalParams.fields, language: SupportedLanguage }),
    handler: (context: WikiContext, { name, title, language, content }) =>
      propose({ context, name, title, content, language }),
  })

const translationContent = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: Schema.Struct({
      ...titleParams.fields,
      language: SupportedLanguage,
      content: Schema.String,
    }),
    handler: (context: WikiContext, { title, language, content }) =>
      expectContent({ context, title, content, language }),
  })

const concurrentProposals = () =>
  Given(
    "{string:first} and {string:second} have proposed concurrent revisions from the same published CRDT version of {string:title}",
    {
      params: Schema.Struct({ first: Schema.String, second: Schema.String, ...titleParams.fields }),
      handler: (context: WikiContext, { first, second, title }) =>
        Effect.gen(function* () {
          const one = yield* propose({
            context,
            name: first,
            title,
            content: "Raiz rica em amido",
          })

          const two = yield* propose({
            context,
            name: second,
            title,
            content: "Raiz cultivada nos trópicos",
          })

          const revisions = [revisionId(one), revisionId(two)]
          const rows = yield* Effect.forEach(revisions, findRevisionById, { concurrency: 1 })

          expect(
            Option.getOrThrow(Option.getOrThrow(Option.fromUndefinedOr(rows[0]))).fromCrdtFrontier,
          ).toEqual(
            Option.getOrThrow(Option.getOrThrow(Option.fromUndefinedOr(rows[1]))).fromCrdtFrontier,
          )

          return { ...context, concurrent: revisions }
        }),
    },
  )

const approveOppositeCopies = (context: WikiContext, name: string) =>
  Effect.gen(function* () {
    const revisions = Option.getOrThrow(Option.fromUndefinedOr(context.concurrent))
    const originalId = articleId(context, "Mandioca")
    const original = Option.getOrThrow(yield* findSourceRowById(originalId))
    const copy = yield* seed({ context, title: "Copy", content: "Raiz tuberosa" })
    const copyId = articleId(copy, "Copy")
    const copyRow = Option.getOrThrow(yield* findSourceRowById(copyId))
    // Preserve operation identities: regenerate neither the initial snapshot nor the proposed updates.
    const copyProjection = yield* findDatabaseRowById(copyId)

    yield* updateSourceRow({
      ...copyRow,
      crdtSnapshot: original.crdtSnapshot,
      expectedCrdtFrontier: Option.map(copyProjection, (row) => row.currentCrdtFrontier),
    })

    const copied = yield* Effect.forEach(
      revisions,
      (id) =>
        Effect.gen(function* () {
          const revision = Option.getOrThrow(yield* findRevisionById(id))
          const copiedId = yield* IdGen.make(WikiArticleRevisionId)

          yield* insertRevisionRow({
            ...revision,
            createdById: Option.getOrThrow(Option.fromNullishOr(revision.createdById)),
            id: copiedId,
            wikiArticleId: copyId,
          })

          return copiedId
        }),
      { concurrency: 1 },
    )

    yield* Effect.forEach(
      revisions,
      (revisionId) =>
        evaluate({ context: { ...context, revisionId }, name, evaluation: "APPROVED" }),
      { concurrency: 1 },
    )

    yield* Effect.forEach(
      [...copied].reverse(),
      (revisionId) =>
        evaluate({ context: { ...context, revisionId }, name, evaluation: "APPROVED" }),
      { concurrency: 1 },
    )

    return {
      ...context,
      opposite: { articleId: copyId, revisions: copied, snapshot: original.crdtSnapshot },
    }
  })

const oppositeApprovals = () =>
  When(
    "{string:name} approves the same revisions on two identical copies of that CRDT version in opposite orders",
    {
      params: nameParams,
      handler: (context: WikiContext, { name }) => approveOppositeCopies(context, name),
    },
  )

const assertCopiesConverge = (context: WikiContext) =>
  Effect.gen(function* () {
    const opposite = Option.getOrThrow(Option.fromUndefinedOr(context.opposite))
    const service = yield* WikiArticlesService
    const cards = yield* service.listCards("pt")

    const pages = yield* Effect.forEach(
      [articleId(context, "Mandioca"), opposite.articleId],
      (id) =>
        Effect.gen(function* () {
          const card = Option.getOrThrow(Option.fromUndefinedOr(cards.find((row) => row.id === id)))

          const page = yield* service.getPage({
            handle: card.handle,
            kind: "PLANT",
            language: "pt",
          })

          const stored = Option.getOrThrow(yield* findSourceRowById(id))
          const data = yield* WikiArticleCrdt.read(snapshotToLoroDoc(stored.crdtSnapshot))
          expect(page.content).toEqual(data.translations.pt?.content)
          return page
        }),
      { concurrency: 1 },
    )

    const one = Option.getOrThrow(Option.fromUndefinedOr(pages[0]))
    const two = Option.getOrThrow(Option.fromUndefinedOr(pages[1]))
    expect(one.content).toEqual(two.content)
    const merged = snapshotToLoroDoc(opposite.snapshot)
    const revisions = Option.getOrThrow(Option.fromUndefinedOr(context.concurrent))

    yield* Effect.forEach(
      revisions,
      (id) =>
        Effect.gen(function* () {
          const row = Option.getOrThrow(yield* findRevisionById(id))
          merged.import(row.crdtUpdate)
        }),
      { concurrency: 1 },
    )

    const expected = yield* WikiArticleCrdt.read(merged)
    expect(one.content).toEqual(expected.translations.pt?.content)
    return context
  })

const historyFixture = () =>
  Given("the wiki article {string:title} exists with the following revision history:", {
    params: Schema.Struct({
      ...titleParams.fields,
      table: Schema.Array(
        Schema.Struct({
          editor: Schema.String,
          action: Schema.String,
          evaluation: Schema.Literals(["APPROVED", "REJECTED"]),
          evaluated_by: Schema.String,
        }),
      ),
    }),
    handler: (_, { title, table }) =>
      Effect.gen(function* () {
        const context = yield* setupPeople([
          { name: "Maria", accessLevel: "COMMUNITY" },
          { name: "Carlos", accessLevel: "COMMUNITY" },
          { name: "Ana", accessLevel: "MODERATOR" },
          { name: "Ailton", accessLevel: "ADMIN" },
        ])

        return yield* Effect.reduce(
          table,
          (): WikiContext => ({ ...context, expectedHistory: [] }),
          (previous, entry) =>
            Effect.gen(function* () {
              const content = Option.getOrThrow(
                Option.fromUndefinedOr(/"(.+)"/.exec(entry.action)?.[1]),
              )
              const updated = entry.action.startsWith("created")
                ? yield* proposeCreation({ context: previous, name: entry.editor, title, content })
                : yield* propose({ context: previous, name: entry.editor, title, content })

              yield* evaluate({
                context: updated,
                name: entry.evaluated_by,
                evaluation: entry.evaluation,
              })

              return {
                ...updated,
                expectedHistory: [
                  ...(previous.expectedHistory ?? []),
                  {
                    id: revisionId(updated),
                    editor: entry.editor,
                    evaluation: entry.evaluation,
                    evaluator: entry.evaluated_by,
                    content,
                  },
                ],
              }
            }),
        )
      }),
  })

const historyCount = (pattern: string) =>
  Then(pattern, {
    params: Schema.Struct({ count: Schema.Int }),
    handler: (context: WikiContext, { count }) =>
      Effect.sync(() => {
        const history = Option.getOrThrow(Option.fromUndefinedOr(context.history))
        expect(history).toHaveLength(count)
        const expected = Option.getOrThrow(Option.fromUndefinedOr(context.expectedHistory))

        expect(history.map((row) => row.id)).toEqual(
          expected
            .filter(
              (entry) =>
                context.historyEvaluation === undefined ||
                entry.evaluation === context.historyEvaluation,
            )
            .map((entry) => entry.id),
        )

        return context
      }),
  })

const historyAudit = () =>
  And("each revision shows the editor, change, evaluation status, and evaluator", {
    handler: (context: WikiContext) =>
      Effect.gen(function* () {
        const rows = Option.getOrThrow(Option.fromUndefinedOr(context.history))
        const expected = Option.getOrThrow(Option.fromUndefinedOr(context.expectedHistory))
        const accepted = new LoroDoc()

        yield* Effect.forEach(
          rows,
          (row, index) =>
            Effect.gen(function* () {
              const entry = Option.getOrThrow(Option.fromUndefinedOr(expected[index]))
              expect(row.createdById).toBe(personNamed(context.actors, entry.editor))
              expect(row.evaluatedById).toEqual(
                Option.some(personNamed(context.actors, entry.evaluator)),
              )
              expect(row.evaluation).toBe(entry.evaluation)
              expect(Option.isSome(row.evaluatedAt)).toBe(true)
              const changed = accepted.fork()
              changed.import(row.crdtUpdate)
              const data = yield* WikiArticleCrdt.read(changed)
              expect(data.translations.pt?.content).toEqual(
                Option.some(textToRichTextDocument(entry.content)),
              )
              if (row.evaluation === "APPROVED") accepted.import(row.crdtUpdate)
            }),
          { concurrency: 1 },
        )

        return yield* expectContent({ context, title: "Mandioca", content: "Raiz rica" })
      }),
  })

await Effect.runPromise(
  describeFeature("./wiki-revisions.feature", ({ Rule }) => {
    Rule(
      "Wiki article creation requires an approved revision",
      ({ Background, Scenario, ScenarioOutline }) => {
        Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople()) })

        Scenario("Community member proposes a new article for review", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              creation(
                When,
                "{string:name} proposes a new wiki article {string:title} with content {string:content}",
              ),
              pending(true),
              invisible(),
              inaccessible(),
            ),
        })

        ScenarioOutline("Approval publishes the new article", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              creation(
                Given,
                "{string:name} has proposed a new wiki article {string:title} with content {string:content}",
              ),
              approval({ keyword: When, pattern: "{string:name} approves the creation revision" }),
              evaluationStatus(
                Then,
                "the creation revision evaluation becomes {string:evaluation}",
              ),
              evaluator("the creation revision shows evaluated by {string:name}"),
              visible(),
              accessible(),
            ),
        })

        Scenario("Rejected creation remains unpublished", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              creation(
                Given,
                "{string:name} has proposed a new wiki article {string:title} with content {string:content}",
              ),
              approval({
                keyword: When,
                pattern: "{string:name} rejects the creation revision",
                evaluation: "REJECTED",
              }),
              evaluationStatus(
                Then,
                "the creation revision evaluation becomes {string:evaluation}",
              ),
              evaluator("the creation revision shows evaluated by {string:name}"),
              invisible(),
              inaccessible(),
              rejectedVisible(And, "the rejected creation revision remains in revision history"),
            ),
        })

        Scenario("Community member cannot approve their own creation", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              creation(
                Given,
                "{string:name} has proposed a new wiki article {string:title} with content {string:content}",
              ),
              deniedApproval(true),
              denied(),
              evaluationStatus(And, "the creation revision evaluation remains {string:evaluation}"),
              invisible(),
            ),
        })

        ScenarioOutline("Evaluators can approve their own creations", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              creation(
                Given,
                "{string:name} has proposed a new wiki article {string:title} with content {string:content}",
              ),
              approval({ keyword: When, pattern: "{string:name} approves the creation revision" }),
              evaluationStatus(
                Then,
                "the creation revision evaluation becomes {string:evaluation}",
              ),
              evaluator(
                "the creation revision shows {string:name} as both editor and evaluator",
                true,
              ),
              visible(),
            ),
        })

        ScenarioOutline("People without community access cannot propose new articles", {
          layer: WikiTestLayer,
          steps: () => runSteps(deniedCreation(), denied(), noCreation()),
        })
        Scenario("Visitors cannot propose new articles", {
          layer: WikiTestLayer,
          steps: () => runSteps(deniedCreation(true), denied(), noCreation()),
        })
      },
    )

    Rule(
      "Only people with community access can propose revisions",
      ({ Background, ScenarioOutline }) => {
        Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople()) })

        ScenarioOutline("Person with community access can propose a revision", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              exists(),
              edit(When, "{string:name} proposes an edit to wiki article {string:title}"),
              pending(),
              unchanged(),
            ),
        })

        ScenarioOutline("Person awaiting access cannot propose a revision", {
          layer: WikiTestLayer,
          steps: () => runSteps(exists(), deniedEdit(), denied()),
        })
        ScenarioOutline("Blocked person cannot propose a revision", {
          layer: WikiTestLayer,
          steps: () => runSteps(exists(), deniedEdit(), denied()),
        })
        ScenarioOutline("Visitors cannot propose a revision", {
          layer: WikiTestLayer,
          steps: () => runSteps(exists(), deniedEdit(true), denied()),
        })
      },
    )

    Rule(
      "Revisions must be evaluated by moderators or admins",
      ({ Background, ScenarioOutline }) => {
        Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople()) })

        ScenarioOutline("Member with community access cannot evaluate a revision", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              exists(),
              edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
              deniedApproval(),
              denied(),
            ),
        })

        ScenarioOutline("Moderator approves a revision", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              exists(),
              edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
              approval({ keyword: When, pattern: "{string:name} approves the revision" }),
              evaluationStatus(Then, "the revision evaluation becomes {string:evaluation}"),
              evaluator("the revision shows evaluated by {string:name}"),
              reflected(),
            ),
        })

        ScenarioOutline("Admin approves a revision", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              exists(),
              edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
              approval({ keyword: When, pattern: "{string:name} approves the revision" }),
              evaluationStatus(Then, "the revision evaluation becomes {string:evaluation}"),
              evaluator("the revision shows evaluated by {string:name}"),
              reflected(),
            ),
        })

        ScenarioOutline("Moderator rejects a revision", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              exists(),
              edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
              approval({
                keyword: When,
                pattern: "{string:name} rejects the revision",
                evaluation: "REJECTED",
              }),
              evaluationStatus(Then, "the revision evaluation becomes {string:evaluation}"),
              unchanged(),
            ),
        })
      },
    )

    Rule("Evaluators can self-approve their own revisions", ({ Background, ScenarioOutline }) => {
      Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople()) })

      ScenarioOutline("Moderator can approve their own revision", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            exists(),
            edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
            approval({ keyword: When, pattern: "{string:name} approves the revision" }),
            evaluationStatus(Then, "the revision evaluation becomes {string:evaluation}"),
            evaluator("the revision shows {string:name} as both editor and evaluator", true),
            reflected(),
          ),
      })

      ScenarioOutline("Admin can approve their own revision", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            exists(),
            edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
            approval({ keyword: When, pattern: "{string:name} approves the revision" }),
            evaluationStatus(Then, "the revision evaluation becomes {string:evaluation}"),
            evaluator("the revision shows {string:name} as both editor and evaluator", true),
            reflected(),
          ),
      })
    })

    Rule("Rejected revisions remain visible in history", ({ Background, ScenarioOutline }) => {
      Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople()) })

      ScenarioOutline("Rejected revision remains visible in revision history", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            exists(),
            edit(And, "{string:name} has proposed a revision to wiki article {string:title}"),
            approval({
              keyword: And,
              pattern: "{string:name} has rejected the revision",
              evaluation: "REJECTED",
            }),
            history({
              keyword: When,
              pattern: "viewing wiki article {string:title} revision history",
            }),
            rejectedVisible(Then, "the rejected revision is visible with its rejection status"),
          ),
      })
    })

    Rule(
      "Concurrent pending revisions converge regardless of approval order",
      ({ Background, Scenario }) => {
        Background({ layer: WikiTestLayer, steps: () => runSteps(givenPeople(), publishedSeed()) })

        Scenario("Multiple pending revisions can coexist without changing published content", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              contentProposal(
                Given,
                "{string:name} has proposed a revision changing {string:title} content to {string:content}",
              ),
              contentProposal(
                When,
                "{string:name} proposes a revision changing {string:title} content to {string:content}",
              ),
              Then("there are {int:count} PENDING revisions for {string:title}", {
                params: Schema.Struct({ ...titleParams.fields, count: Schema.Int }),
                handler: (context: WikiContext, { title, count }) =>
                  listPendingRevisionsByWikiArticleId(articleId(context, title)).pipe(
                    Effect.tap((rows) => Effect.sync(() => expect(rows).toHaveLength(count))),
                    Effect.as(context),
                  ),
              }),
              And("{string:title}'s published content remains {string:content}", {
                params: Schema.Struct({ ...titleParams.fields, content: Schema.String }),
                handler: (context: WikiContext, { title, content }) =>
                  expectContent({ context, title, content }),
              }),
            ),
        })

        Scenario(
          "Approving the same concurrent revisions in either order produces the same content",
          {
            layer: WikiTestLayer,
            steps: () =>
              runSteps(
                concurrentProposals(),
                And("both revisions edit the same content", {
                  handler: (context: WikiContext) =>
                    Effect.gen(function* () {
                      const ids = Option.getOrThrow(Option.fromUndefinedOr(context.concurrent))
                      const stored = Option.getOrThrow(
                        yield* findSourceRowById(articleId(context, "Mandioca")),
                      )

                      const contents = yield* Effect.forEach(
                        ids,
                        (id) =>
                          Effect.gen(function* () {
                            const row = Option.getOrThrow(yield* findRevisionById(id))
                            const parsed = yield* WikiArticleCrdt.parseUpdate({
                              snapshot: stored.crdtSnapshot,
                              crdtUpdate: row.crdtUpdate,
                            })
                            return parsed.data.translations.pt?.content
                          }),
                        { concurrency: 1 },
                      )

                      expect(contents).toEqual([
                        Option.some(textToRichTextDocument("Raiz rica em amido")),
                        Option.some(textToRichTextDocument("Raiz cultivada nos trópicos")),
                      ])
                      return context
                    }),
                }),
                oppositeApprovals(),
                Then("both copies have identical published content", {
                  handler: assertCopiesConverge,
                }),
                And("both revisions have {string:evaluation} evaluation in each copy", {
                  params: Schema.Struct({ evaluation: WikiArticleRevisionRow.fields.evaluation }),
                  handler: (context: WikiContext, { evaluation }) =>
                    Effect.gen(function* () {
                      const original = Option.getOrThrow(Option.fromUndefinedOr(context.concurrent))
                      const opposite = Option.getOrThrow(Option.fromUndefinedOr(context.opposite))

                      yield* Effect.forEach(
                        [...original, ...opposite.revisions],
                        (id) =>
                          findRevisionById(id).pipe(
                            Effect.tap((row) =>
                              Effect.sync(() =>
                                expect(Option.getOrThrow(row).evaluation).toBe(evaluation),
                              ),
                            ),
                          ),
                        { concurrency: 1 },
                      )

                      return context
                    }),
                }),
              ),
          },
        )
      },
    )

    Rule("Translation changes require approved revisions", ({ Background, Scenario }) => {
      Background({
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} has COMMUNITY access", {
              params: nameParams,
              handler: (_, { name }) =>
                setupPeople([
                  { name, accessLevel: "COMMUNITY" },
                  { name: "Ana", accessLevel: "MODERATOR" },
                ]),
            }),
            And("{string:name} is a MODERATOR", {
              params: nameParams,
              handler: (context: WikiContext, { name }) =>
                Effect.sync(() => {
                  expect(personNamed(context.actors, name)).toBeDefined()
                  return context
                }),
            }),
            And("the wiki article {string:title} exists with pt content {string:content}", {
              params: Schema.Struct({ ...titleParams.fields, content: Schema.String }),
              handler: (context: WikiContext, { title, content }) =>
                seed({ context, title, content }),
            }),
          ),
      })

      Scenario("Add translation to another language", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            translationProposal(
              "{string:name} has submitted a {word:language} translation for {string:title} with content {string:content}",
            ),
            And("{string:title} has no published {word:language} translation", {
              params: Schema.Struct({ ...titleParams.fields, language: SupportedLanguage }),
              handler: (context: WikiContext, { title, language }) =>
                Effect.gen(function* () {
                  const page = yield* withSession(
                    (yield* WikiArticlesService).getPage({
                      handle: Handle.make(title.toLowerCase()),
                      kind: "PLANT",
                      language,
                    }),
                    VISITOR_SESSION,
                  )

                  expect(page.translationUnavailable).toBe(true)
                  expect(page.language).toBe("pt")
                  return context
                }),
            }),
            translationContent(
              And,
              "{string:title} still has {word:language} content {string:content}",
            ),
            approval({ keyword: When, pattern: "{string:name} approves the revision" }),
            translationContent(Then, "{string:title} has {word:language} content {string:content}"),
            translationContent(
              And,
              "{string:title} still has {word:language} content {string:content}",
            ),
          ),
      })

      Scenario("Edit existing translation", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            Given("{string:title} has {word:language} content {string:content}", {
              params: Schema.Struct({
                ...titleParams.fields,
                language: SupportedLanguage,
                content: Schema.String,
              }),
              handler: (context: WikiContext, { title, content, language }) =>
                propose({
                  context,
                  name: "Maria",
                  title,
                  content,
                  language,
                }).pipe(
                  Effect.flatMap((updated) =>
                    evaluate({ context: updated, name: "Ana", evaluation: "APPROVED" }),
                  ),
                ),
            }),
            translationProposal(
              "{string:name} has submitted an edit to {string:title} {word:language} content {string:content}",
            ),
            translationContent(
              And,
              "{string:title} still has {word:language} content {string:content}",
            ),
            approval({ keyword: When, pattern: "{string:name} approves the revision" }),
            translationContent(
              Then,
              "{string:title} {word:language} content becomes {string:content}",
            ),
            translationContent(
              And,
              "{string:title} still has {word:language} content {string:content}",
            ),
          ),
      })
    })

    Rule("Revision history provides auditability", ({ Background, Scenario }) => {
      Background({ layer: WikiTestLayer, steps: () => runSteps(historyFixture()) })

      Scenario("View complete revision history", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            history({ keyword: When, pattern: "viewing {string:title} revision history" }),
            historyCount("{int:count} revisions are shown in chronological order"),
            historyAudit(),
          ),
      })

      Scenario("Filter revision history by evaluation status", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            history({
              keyword: When,
              pattern: "viewing {string:title} revision history filtered to {string:evaluation}",
              filtered: true,
            }),
            historyCount("{int:count} revisions are shown"),
          ),
      })
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect(
  "concurrent rich-text revisions converge and history filters stay scoped to their article",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          first: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
          second: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
        }),
      ),
      options: { runs: 20 },
      predicate: ({ first, second }) =>
        Effect.gen(function* () {
          const people = yield* setupPeople([
            { name: "Maria", accessLevel: "COMMUNITY" },
            { name: "Carlos", accessLevel: "COMMUNITY" },
            { name: "Ana", accessLevel: "MODERATOR" },
          ])

          const context = yield* seed({
            context: people,
            title: "Mandioca",
            content: "Raiz tuberosa",
          })

          const one = yield* propose({
            context,
            name: "Maria",
            title: "Mandioca",
            content: first,
          })

          const two = yield* propose({
            context,
            name: "Carlos",
            title: "Mandioca",
            content: second,
          })

          const revisions = [revisionId(one), revisionId(two)]
          const service = yield* WikiArticlesService
          const id = articleId(context, "Mandioca")

          expect(
            (yield* service.listRevisionHistory({ wikiArticleId: id, evaluation: "PENDING" })).map(
              (row) => row.id,
            ),
          ).toEqual(revisions)

          yield* expectContent({ context, title: "Mandioca", content: "Raiz tuberosa" })
          const approved = yield* approveOppositeCopies(
            { ...context, concurrent: revisions },
            "Ana",
          )
          yield* assertCopiesConverge(approved)
          const all = yield* service.listRevisionHistory({ wikiArticleId: id })
          expect(all).toHaveLength(3)
          expect(
            all.every((row) => row.wikiArticleId === id && row.evaluation === "APPROVED"),
          ).toBe(true)
          expect(
            yield* service.listRevisionHistory({ wikiArticleId: id, evaluation: "APPROVED" }),
          ).toEqual(all)
          expect(
            yield* service.listRevisionHistory({ wikiArticleId: id, evaluation: "PENDING" }),
          ).toEqual([])
          expect(
            yield* service.listRevisionHistory({ wikiArticleId: id, evaluation: "REJECTED" }),
          ).toEqual([])
          return true
        }).pipe(Effect.provide(WikiTestLayer)),
    }),
)
