import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { assert, expect, it } from "@effect/vitest"
import {
  Handle,
  ApiAuthentication,
  GororobasApi,
  IdGen,
  type Session,
  BookmarkState,
  PlatformAccessLevelOrVisitor,
  SessionContext,
  IntNonNegative,
  LinkSource,
  LoroDocUpdate,
  MediaAssetRow,
  WikiArticleCommonNameInCrdtList,
  type TiptapDocument,
  type TiptapNode,
  WikiArticleCommonName,
  SupportedLanguage,
  WikiArticleCrdt,
  WikiArticleEditableData,
  WikiArticleId,
  WikiArticleQueriedPageData,
  WikiArticleProjectionRow,
  WikiArticleRelationDirection,
  WikiArticleRevisionId,
  WikiSearchParams,
  WikiPlantArticle,
  WikiPlantCultivarArticle,
  snapshotToLoroDoc,
  nodeIdOf,
  type PlantCultivarEditableAttributes,
} from "@gororobas/domain"
import { LinkInferenceModel } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import {
  And,
  describeFeature,
  getBackgroundContext,
  Given,
  runSteps,
  Then,
  When,
} from "@gororobas/effect-bdd"
import { VISITOR_SESSION } from "@gororobas/server/session-service"
import {
  Context,
  Effect,
  Array as EffectArray,
  Layer,
  Option,
  Order,
  Predicate,
  Record,
  Ref,
  Result,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"
import sharp from "sharp"

import {
  WikiArticleLinkInferenceWorkflow,
  WikiArticleLinkInferenceWorkflowLayer,
} from "../src/link-inference/wiki-article-link-inference-workflow.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { resolveSessionFromAuthSubjectId } from "../src/session-service.js"
import { WikiApiLive } from "../src/wiki/api-live.js"
import {
  findSourceRowById,
  findDatabaseRowById,
  findRevisionById,
  listPendingRevisionsByWikiArticleId,
} from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { WikiArticlesService } from "../src/wiki/service.js"
import {
  PeopleBackground,
  PeopleFeatureTestLayer,
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
/** Names of the articles link inference infers from any content, as set by the scenario. */
const InferredNames = Context.Service<Ref.Ref<ReadonlyArray<string>>>("test/InferredNames")

/** Infers the scenario's articles from the first paragraph; finds no mentions beyond exact names. */
const RelationsTestLayer = WikiArticleLinkInferenceWorkflowLayer.pipe(
  Layer.provideMerge(
    Layer.effect(
      LinkInferenceModel,
      Effect.gen(function* () {
        const inferredNames = yield* InferredNames

        return {
          model: null,
          detectMentions: () => Effect.succeed([]),
          detectInferences: ({ source }) =>
            Effect.gen(function* () {
              const paragraph = source.segments.find(
                (segment) =>
                  segment.location.includes("content") && segment.isEntityReference !== true,
              )
              if (paragraph === undefined) return []

              return (yield* Ref.get(inferredNames)).map((name) => ({
                interval: { start: paragraph.start, end: paragraph.end },
                alignmentStatus: "EXACT" as const,
                names: { pt: [name], es: [], en: [] },
                rationale: `The paragraph is about ${name}.`,
              }))
            }),
          disambiguate: () => Effect.succeedNone,
        }
      }),
    ),
  ),
  Layer.provideMerge(Layer.effect(InferredNames, Ref.make<ReadonlyArray<string>>([]))),
  Layer.provideMerge(WikiTestLayer),
)

const WikiBackground = Schema.Struct({
  ...PeopleBackground.fields,
  articles: Schema.Record(Schema.String, WikiArticleId),
})

type WikiContext = typeof WikiBackground.Type & {
  revisionId?: WikiArticleRevisionId
  photo?: MediaAssetRow
  page?: WikiArticleQueriedPageData & {
    translationUnavailable: boolean
    cultivars: readonly (WikiArticleProjectionRow & {
      commonNames: readonly WikiArticleCommonName[]
    })[]
  }
  error?: unknown
}

const titleParams = Schema.Struct({
  title: Schema.String,
})
const background = () => getBackgroundContext(WikiBackground)
const articleId = (context: WikiContext, title: string) =>
  Option.getOrThrow(Option.fromNullishOr(context.articles[title]))
const revisionId = (context: WikiContext) =>
  Option.getOrThrow(Option.fromNullishOr(context.revisionId))
const photoIn = (context: WikiContext) => Option.getOrThrow(Option.fromNullishOr(context.photo))
const pageIn = (context: WikiContext) => Option.getOrThrow(Option.fromNullishOr(context.page))

const asPerson = <A, E, R>({
  context,
  name,
  action,
}: {
  context: WikiContext
  name: string
  action: Effect.Effect<A, E, R | SessionContext>
}) => withPerson(action, personNamed(context.actors, name))

const translation = (title: string, content = title) => ({
  commonNames: [
    Schema.decodeSync(WikiArticleCommonNameInCrdtList)({
      id: "wikicommon01",
      name: title,
    }),
  ] as const,
  content: Option.some(textToRichTextDocument(content)),
})

const plant = (title: string, content = title) =>
  WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        ...translation(title, content),
        origin: Option.none(),
      },
    },
  })

const plantWithSearchableAttributes = (
  title: string,
  attributes: {
    strata?: ReadonlyArray<"EMERGENT" | "HIGH" | "MEDIUM" | "LOW" | "GROUND">
    heightMin?: number
    heightMax?: number
  },
) =>
  WikiPlantArticle.EditableArticle.make({
    ...plant(title),
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({
      ...attributes,
      strata: attributes.strata
        ? Record.fromEntries(attributes.strata.map((stratum) => [stratum, true] as const))
        : undefined,
    }),
  })

const bilingualPlant = (title: string) => {
  const article = plant(title)

  return WikiPlantArticle.EditableArticle.make({
    ...article,
    translations: {
      pt: article.translations.pt,
      en: {
        ...translation(`${title} in English`),
        origin: Option.none(),
      },
    },
  })
}

const setupPeople = () =>
  provisionPeople([
    {
      name: "Maria",
      accessLevel: "COMMUNITY",
    },
    {
      name: "Ana",
      accessLevel: "MODERATOR",
    },
  ]).pipe(
    Effect.map((people): WikiContext => ({
      ...people,
      articles: {},
    })),
  )

const seedArticle = ({
  context,
  title,
  data = plant(title),
}: {
  context: WikiContext
  title: string
  data?: WikiArticleEditableData
}) =>
  Effect.gen(function* () {
    const id = yield* (yield* WikiArticlesRepository).createWikiArticle(
      {
        wikiArticle: data,
        createdById: context.administratorId,
        status: "PUBLISHED",
      },
      {
        enrichment: "skip",
      },
    )

    return {
      ...context,
      articles: {
        ...context.articles,
        [title]: id,
      },
    }
  })

const proposeCultivar = ({
  context,
  title,
  attributes = {},
}: {
  context: WikiContext
  title: string
  attributes?: Partial<PlantCultivarEditableAttributes>
}) =>
  Effect.gen(function* () {
    const id = yield* asPerson({
      context: context,
      name: "Maria",
      action: (yield* WikiArticlesService).createWikiArticle({
        wikiArticle: WikiPlantCultivarArticle.EditableArticle.make({
          kind: "PLANT_CULTIVAR",
          translations: {
            pt: translation(title),
          },
          attributes: WikiPlantCultivarArticle.EditableAttributes.make({
            parentPlantId: articleId(context, "Banana"),
            ...attributes,
          }),
        }),
      }),
    })

    const revisions = yield* listPendingRevisionsByWikiArticleId(id)
    expect(revisions).toHaveLength(1)

    return {
      ...context,
      articles: {
        ...context.articles,
        [title]: id,
      },
      revisionId: revisions[0]?.id,
    }
  })

const approve = (context: WikiContext) =>
  Effect.gen(function* () {
    yield* asPerson({
      context: context,
      name: "Ana",
      action: (yield* WikiArticlesService).evaluateRevision(revisionId(context), {
        status: "APPROVED",
      }),
    })

    return context
  })

const cultivar = (context: WikiContext, title: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* WikiArticlesService).getPublishedArticle(articleId(context, title))
    assert(row.kind === "PLANT_CULTIVAR")
    return row
  })

const range = (min: number, max: number) => ({
  min: IntNonNegative.make(min),
  max: IntNonNegative.make(max),
})

/** Maria proposes the edit and Ana approves it. */
const approvedEdit = ({
  context,
  title,
  edit,
  status = "APPROVED",
}: {
  context: WikiContext
  title: string
  edit: Parameters<typeof WikiArticleCrdt.applyEdit>[1]
  status?: "APPROVED" | "REJECTED"
}) =>
  Effect.gen(function* () {
    const id = articleId(context, title)
    const stored = Option.getOrThrow(yield* findSourceRowById(id))
    const current = snapshotToLoroDoc(stored.crdtSnapshot)
    const changed = current.fork()
    yield* WikiArticleCrdt.applyEdit(changed, edit)
    const service = yield* WikiArticlesService

    const revision = yield* asPerson({
      context: context,
      name: "Maria",
      action: service.createRevision(id, {
        crdtUpdate: LoroDocUpdate.make(
          changed.export({
            mode: "update",
            from: current.version(),
          }),
        ),
      }),
    })

    yield* asPerson({
      context: context,
      name: "Ana",
      action: service.evaluateRevision(revision, { status }),
    })

    return context
  })

const editParent = (context: WikiContext, edit: Parameters<typeof WikiArticleCrdt.applyEdit>[1]) =>
  approvedEdit({ context, title: "Banana", edit })

const setParentRange = ({
  context,
  min,
  max,
}: {
  context: WikiContext
  min: number
  max: number
}) =>
  editParent(context, {
    _tag: "SetDevelopmentCycleMin",
    value: IntNonNegative.make(min),
  }).pipe(
    Effect.flatMap((updated) =>
      editParent(updated, {
        _tag: "SetDevelopmentCycleMax",
        value: IntNonNegative.make(max),
      }),
    ),
  )

const community = () =>
  Given("{string:name} has COMMUNITY access", {
    params: Schema.Struct({
      name: Schema.String,
    }),
    handler: (_, { name }) =>
      setupPeople().pipe(
        Effect.tap((context) =>
          Effect.sync(() => {
            expect(context.actors[name]).toBeDefined()
          }),
        ),
      ),
  })

const moderator = () =>
  And("{string:name} is a MODERATOR", {
    params: Schema.Struct({
      name: Schema.String,
    }),
    handler: (context: WikiContext, { name }) =>
      Effect.sync(() => {
        expect(personNamed(context.actors, name)).toBeDefined()
        return context
      }),
  })

const publishedPlant = () =>
  And("the published plant article {string:title} exists", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      seedArticle({
        context: context,
        title: title,
      }),
  })

const articleExists = () =>
  And("the wiki article {string:title} exists", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      seedArticle({
        context: context,
        title: title,
      }),
  })

const approval = () =>
  When("{string:name} approves the creation revision", {
    params: Schema.Struct({
      name: Schema.String,
    }),
    handler: (context: WikiContext, { name }) =>
      Effect.gen(function* () {
        yield* asPerson({
          context: context,
          name: name,
          action: (yield* WikiArticlesService).evaluateRevision(revisionId(context), {
            status: "APPROVED",
          }),
        })

        return context
      }),
  })

const parentLifecycles = () =>
  Given("{string:title} has lifecycles {string:lifecycles}", {
    params: Schema.Struct({
      title: Schema.String,
      lifecycles: Schema.Literal("PERENNIAL"),
    }),
    handler: (_, { title, lifecycles }) =>
      background().pipe(
        Effect.flatMap((context) => {
          expect(title).toBe("Banana")
          return editParent(context, {
            _tag: "AddedPlantLifecycle",
            value: lifecycles,
          })
        }),
      ),
  })

const parentCycle = () =>
  Given("{string:title} has development cycle {int:min}-{int:max} days", {
    params: Schema.Struct({
      title: Schema.String,
      min: Schema.Int,
      max: Schema.Int,
    }),
    handler: (_, { title, min, max }) =>
      background().pipe(
        Effect.flatMap((context) => {
          expect(title).toBe("Banana")

          return setParentRange({
            context: context,
            min: min,
            max: max,
          })
        }),
      ),
  })

const propertyState = () =>
  Then("{string:title}'s lifecycles property has state {string:state}", {
    params: Schema.Struct({
      title: Schema.String,
      state: Schema.String,
    }),
    handler: (context: WikiContext, { title, state }) =>
      Effect.gen(function* () {
        expect((yield* cultivar(context, title)).attributes.lifecycles._tag).toBe(state)
        return context
      }),
  })

const view = (
  context: WikiContext,
  { title, language }: { title: string; language: SupportedLanguage },
) =>
  Effect.gen(function* () {
    const row = Option.getOrThrow(
      yield* (yield* WikiArticlesRepository).findBySearchableName(title.toLowerCase()),
    )

    return {
      ...context,
      page: yield* (yield* WikiArticlesService).getPage({
        handle: row.handle,
        kind: "PLANT",
        language,
      }),
    }
  })

const uploadPhoto = (
  context: WikiContext,
  { title = "Mandioca", category }: { title?: string; category?: string } = {},
) =>
  Effect.gen(function* () {
    const file = yield* Effect.tryPromise(() =>
      sharp({
        create: {
          width: 8,
          height: 4,
          channels: 3,
          background: "green",
        },
      })
        .png()
        .toBuffer(),
    )

    const photo = yield* asPerson({
      context: context,
      name: "Maria",
      action: (yield* MediaAssetsService).upload({
        file,
        fileName: "plant.png",
        contentType: "image/png",
      }),
    })

    yield* asPerson({
      context: context,
      name: "Maria",
      action: (yield* WikiArticlesService).attachMediaToWikiArticle({
        wikiArticleId: articleId(context, title),
        mediaAssetId: photo.id,
        category,
      }),
    })

    return {
      ...context,
      photo,
    }
  })

const photoAdded = () =>
  Given("{string:name} has added a photo to {string:title}", {
    params: Schema.Struct({
      name: Schema.Literal("Maria"),
      title: Schema.String,
    }),
    handler: (_, { title }) =>
      background().pipe(Effect.flatMap((context) => uploadPhoto(context, { title }))),
  })

const approvedPhotos = () =>
  Given("{string:title} has approved photos", {
    params: titleParams,
    handler: (_, { title }) =>
      background().pipe(Effect.flatMap((context) => uploadPhoto(context, { title }))),
  })

const bookmark = ({
  context,
  name,
  title,
  state,
}: {
  context: WikiContext
  name: string
  title: string
  state?: BookmarkState
}) =>
  Effect.gen(function* () {
    yield* asPerson({
      context: context,
      name: name,
      action: (yield* WikiArticlesService).bookmark(articleId(context, title), state),
    })

    return context
  })

const bookmarkVisible = () =>
  Then(
    "{string:title} appears in {string:name}'s bookmarked wiki articles with state {string:state}",
    {
      params: Schema.Struct({
        title: Schema.String,
        name: Schema.String,
        state: BookmarkState,
      }),
      handler: (context: WikiContext, { title, name, state }) =>
        Effect.gen(function* () {
          expect(
            yield* asPerson({
              context: context,
              name: name,
              action: (yield* WikiArticlesService).listBookmarks,
            }),
          ).toEqual([
            {
              wikiArticleId: articleId(context, title),
              state,
            },
          ])

          return context
        }),
    },
  )

const bookmarked = () =>
  Given("{string:name} has bookmarked {string:title} with state {string:state}", {
    params: Schema.Struct({
      title: Schema.String,
      name: Schema.String,
      state: BookmarkState,
    }),
    handler: (_, { title, name, state }) =>
      background().pipe(
        Effect.flatMap((context) =>
          bookmark({
            context: context,
            name: name,
            title: title,
            state: state,
          }),
        ),
      ),
  })

const findArticleHandle = SqlSchema.findOne({
  Request: WikiArticleId,
  Result: Schema.Struct({ handle: Handle }),
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT handle FROM wiki_article_handles WHERE wiki_article_id = ${id} LIMIT 1`,
    ),
})

const lookupOf = (context: WikiContext, title: string) =>
  Effect.gen(function* () {
    const id = articleId(context, title)
    const article = yield* (yield* WikiArticlesService).getPublishedArticle(id)
    const { handle } = yield* findArticleHandle(id)
    return { kind: article.kind, handle }
  })

const bookmarkersOf = (context: WikiContext, title: string) =>
  lookupOf(context, title).pipe(
    Effect.flatMap((lookup) =>
      WikiArticlesService.use((service) => service.listBookmarkers(lookup)),
    ),
  )

const contributorsOf = (context: WikiContext, title: string) =>
  lookupOf(context, title).pipe(
    Effect.flatMap((lookup) =>
      WikiArticlesService.use((service) => service.listContributors(lookup)),
    ),
  )

const communityOnlyProfile = () =>
  Given("{string:name}'s profile is only visible to the community", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (_, { name }) =>
      background().pipe(
        Effect.tap((context) =>
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            yield* sql`UPDATE profiles SET visibility = 'COMMUNITY' WHERE id = ${personNamed(context.actors, name)}`
          }),
        ),
      ),
  })

const listedBookmarker = () =>
  Then("{string:name} is listed among {string:title}'s bookmarkers with state {string:state}", {
    params: Schema.Struct({ name: Schema.String, title: Schema.String, state: BookmarkState }),
    handler: (context: WikiContext, { name, title, state }) =>
      Effect.gen(function* () {
        expect(
          (yield* bookmarkersOf(context, title)).map((bookmarker) => ({
            profileId: bookmarker.profile.id,
            state: bookmarker.state,
          })),
        ).toContainEqual({ profileId: personNamed(context.actors, name), state })

        return context
      }),
  })

const unlistedBookmarker = () =>
  Then("{string:name} is not listed among {string:title}'s bookmarkers", {
    params: Schema.Struct({ name: Schema.String, title: Schema.String }),
    handler: (context: WikiContext, { name, title }) =>
      Effect.gen(function* () {
        expect(
          (yield* bookmarkersOf(context, title)).map((bookmarker) => bookmarker.profile.id),
        ).not.toContain(personNamed(context.actors, name))

        return context
      }),
  })

const EvaluatedEditsParams = Schema.Struct({
  name: Schema.Literal("Maria"),
  count: Schema.Int,
  title: Schema.String,
  evaluation: Schema.Literals(["APPROVED", "REJECTED"]),
})

const evaluateEdits = (
  context: WikiContext,
  { count, title, evaluation }: typeof EvaluatedEditsParams.Type,
) =>
  Effect.forEach(
    EffectArray.range(1, count),
    (edition) =>
      approvedEdit({
        context,
        title,
        status: evaluation,
        edit: {
          _tag: "SetWikiArticleTranslationContent",
          language: "pt",
          content: textToRichTextDocument(`Edição ${edition}`),
        },
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.as(context))

const evaluatedEdits = () =>
  Given("{string:name} has {int:count} edits to {string:title} evaluated as {string:evaluation}", {
    params: EvaluatedEditsParams,
    handler: evaluateEdits,
  })

const evaluatedEdit = () =>
  Given("{string:name} has {int:count} edit to {string:title} evaluated as {string:evaluation}", {
    params: EvaluatedEditsParams,
    handler: evaluateEdits,
  })

const listedContributor = () =>
  Then("{string:name} is listed among {string:title}'s contributors with {int:count} revisions", {
    params: Schema.Struct({ name: Schema.String, title: Schema.String, count: Schema.Int }),
    handler: (context: WikiContext, { name, title, count }) =>
      Effect.gen(function* () {
        expect(
          (yield* contributorsOf(context, title)).map((contributor) => ({
            profileId: contributor.profile.id,
            revisionCount: contributor.revisionCount,
          })),
        ).toContainEqual({ profileId: personNamed(context.actors, name), revisionCount: count })

        return context
      }),
  })

const unlistedContributor = () =>
  Then("{string:name} is not listed among {string:title}'s contributors", {
    params: Schema.Struct({ name: Schema.String, title: Schema.String }),
    handler: (context: WikiContext, { name, title }) =>
      Effect.gen(function* () {
        expect(
          (yield* contributorsOf(context, title)).map((contributor) => contributor.profile.id),
        ).not.toContain(personNamed(context.actors, name))

        return context
      }),
  })

const referencing = (title: string, id: WikiArticleId): TiptapDocument => ({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Veja também " },
        {
          type: "entityReference",
          attrs: {
            referenceType: "WIKI_ARTICLE",
            referenceId: id,
            version: 1,
            labelAtInsertion: title,
          },
        },
      ],
    },
  ],
})

const ReferenceParams = Schema.Struct({ title: Schema.String, referenced: Schema.String })

const approveReference = (
  context: WikiContext,
  { title, referenced }: typeof ReferenceParams.Type,
) =>
  approvedEdit({
    context,
    title,
    edit: {
      _tag: "SetWikiArticleTranslationContent",
      language: "pt",
      content: referencing(referenced, articleId(context, referenced)),
    },
  })

const referencedInRevision = () =>
  Given("an approved revision makes {string:title}'s content reference {string:referenced}", {
    params: ReferenceParams,
    handler: (_, params) =>
      background().pipe(Effect.flatMap((context) => approveReference(context, params))),
  })

const approveSaying = (context: WikiContext, { title, text }: { title: string; text: string }) =>
  approvedEdit({
    context,
    title,
    edit: {
      _tag: "SetWikiArticleTranslationContent",
      language: "pt",
      content: textToRichTextDocument(text),
    },
  })

const saidInRevision = () =>
  Given("an approved revision makes {string:title}'s content say {string:text}", {
    params: Schema.Struct({ title: Schema.String, text: Schema.String }),
    handler: (_, params) =>
      background().pipe(Effect.flatMap((context) => approveSaying(context, params))),
  })

const inferredByLinkInference = () =>
  Given("link inference infers {string:inferred} from {string:title}'s content", {
    params: Schema.Struct({ inferred: Schema.String, title: Schema.String }),
    handler: (_, { inferred }) =>
      Effect.gen(function* () {
        const context = yield* background()
        yield* Ref.set(yield* InferredNames, [inferred])
        return context
      }),
  })

const linksInferred = () =>
  When("links are inferred from {string:title}'s content", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      Effect.gen(function* () {
        const article = Option.getOrThrow(yield* findDatabaseRowById(articleId(context, title)))
        yield* WikiArticleLinkInferenceWorkflow.execute({
          wikiArticleId: article.id,
          crdtFrontier: article.currentCrdtFrontier,
        })
        return context
      }),
  })

const relatedArticlesOf = (title: string) =>
  Effect.gen(function* () {
    const { handle } = Option.getOrThrow(
      yield* (yield* WikiArticlesRepository).findBySearchableName(title.toLowerCase()),
    )

    return yield* (yield* WikiArticlesService).listRelatedWikiArticles({
      handle,
      kind: "PLANT",
      language: "pt",
    })
  })

const RelatedArticlesParams = Schema.Struct({
  title: Schema.String,
  table: Schema.Array(Schema.Struct({ title: Schema.String })),
})

const expectRelatedArticles = (
  context: WikiContext,
  { title, table }: typeof RelatedArticlesParams.Type,
) =>
  Effect.gen(function* () {
    const related = yield* relatedArticlesOf(title)

    expect(
      EffectArray.sort(
        related.map((card) => card.id),
        Order.String,
      ),
    ).toEqual(
      EffectArray.sort(
        table.map((row) => articleId(context, row.title)),
        Order.String,
      ),
    )

    return context
  })

const relatedArticles = () =>
  Then("{string:title}'s related articles are:", {
    params: RelatedArticlesParams,
    handler: expectRelatedArticles,
  })

const RelationLinksParams = Schema.Struct({
  title: Schema.String,
  related: Schema.String,
  table: Schema.Array(
    Schema.Struct({
      source: LinkSource,
      direction: WikiArticleRelationDirection,
      text: Schema.String,
    }),
  ),
})

const expectRelationLinks = (
  context: WikiContext,
  { title, related, table }: typeof RelationLinksParams.Type,
) =>
  Effect.gen(function* () {
    const article = Option.getOrThrow(
      EffectArray.findFirst(
        yield* relatedArticlesOf(title),
        (card) => card.id === articleId(context, related),
      ),
    )

    expect(
      article.links.map((link) => ({
        source: link.source,
        direction: link.direction,
        text: link.source === "LEGACY_TAG" ? "" : link.evidence.map((item) => item.text).join(", "),
      })),
    ).toEqual(table)

    return context
  })

const relatedThrough = () =>
  Then("{string:title} is related to {string:related} through:", {
    params: RelationLinksParams,
    handler: expectRelationLinks,
  })

const findNode = (nodes: ReadonlyArray<TiptapNode>, nodeId: string): Option.Option<TiptapNode> =>
  EffectArray.findFirst(nodes, (node) =>
    Option.exists(nodeIdOf(node), (id) => id === nodeId)
      ? Option.some(node)
      : "content" in node
        ? findNode(node.content ?? [], nodeId)
        : Option.none(),
  )

const nodeText = (node: TiptapNode): string =>
  node.type === "text"
    ? node.text
    : node.type === "entityReference"
      ? node.attrs.labelAtInsertion
      : "content" in node
        ? (node.content ?? []).map(nodeText).join("")
        : ""

/** Readers verify a relation by finding its evidence in the content of the article holding it. */
const evidencePointsAtNodes = () =>
  And("every piece of evidence in {string:title}'s relations points at the node holding it", {
    params: titleParams,
    handler: (context: WikiContext, { title }) =>
      Effect.gen(function* () {
        const service = yield* WikiArticlesService
        const { handle } = Option.getOrThrow(
          yield* (yield* WikiArticlesRepository).findBySearchableName(title.toLowerCase()),
        )
        const related = yield* relatedArticlesOf(title)

        const evidence = related.flatMap((article) =>
          article.links.flatMap((link) =>
            link.source === "LEGACY_TAG"
              ? []
              : link.evidence.map((item) => ({
                  holder:
                    link.direction === "OUTGOING"
                      ? { handle, kind: "PLANT" as const }
                      : { handle: article.handle, kind: article.kind },
                  item,
                })),
          ),
        )

        expect(evidence).not.toHaveLength(0)

        yield* Effect.forEach(
          evidence,
          ({ holder, item }) =>
            Effect.gen(function* () {
              const [root, language, field, node] = item.location
              assert(root === "translations" && field === "content")
              assert(Schema.is(SupportedLanguage)(language) && Predicate.isObject(node))
              const page = yield* service.getPage({ ...holder, language })
              const found = findNode(Option.getOrThrow(page.content).content, node.id)

              expect(nodeText(Option.getOrThrow(found)).toLowerCase()).toContain(
                item.text.toLowerCase(),
              )
            }),
          { concurrency: 1, discard: true },
        )

        return context
      }),
  })

await Effect.runPromise(
  describeFeature("./wiki-articles.feature", ({ Rule }) => {
    Rule("Wiki articles support multiple translations", ({ Background, Scenario }) => {
      Background({
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            Given("the wiki article {string:title} exists with pt content {string:content}", {
              params: Schema.Struct({
                title: Schema.String,
                content: Schema.String,
              }),
              handler: (_, { title, content }) =>
                setupPeople().pipe(
                  Effect.flatMap((context) =>
                    seedArticle({
                      context: context,
                      title: title,
                      data: plant(title, content),
                    }),
                  ),
                ),
            }),
          ),
      })

      Scenario("Viewing wiki article in unsupported language falls back to original", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            Given("{string:title} has only pt content {string:content}", {
              params: Schema.Struct({
                title: Schema.String,
                content: Schema.String,
              }),
              handler: (_, { title, content }) =>
                Effect.gen(function* () {
                  const context = yield* background()
                  const row = Option.getOrThrow(yield* findSourceRowById(articleId(context, title)))
                  const data = yield* WikiArticleCrdt.read(snapshotToLoroDoc(row.crdtSnapshot))
                  expect(data.translations).toEqual({ pt: expect.anything() })
                  expect(data.translations.pt?.content).toEqual(
                    Option.some(textToRichTextDocument(content)),
                  )
                  return context
                }),
            }),
            When("a user with {word:language} language views {string:title}", {
              params: Schema.Struct({
                language: SupportedLanguage,
                title: Schema.String,
              }),
              handler: (context: WikiContext, { title, language }) =>
                Effect.gen(function* () {
                  const row = Option.getOrThrow(
                    yield* (yield* WikiArticlesRepository).findBySearchableName(
                      title.toLowerCase(),
                    ),
                  )

                  const page = yield* (yield* WikiArticlesService).getPage({
                    handle: row.handle,
                    kind: "PLANT",
                    language,
                  })

                  return {
                    ...context,
                    page,
                  }
                }),
            }),
            Then("they see content {string:content}", {
              params: Schema.Struct({
                content: Schema.String,
              }),
              handler: (context: WikiContext, { content }) =>
                Effect.sync(() => {
                  expect(pageIn(context).content).toEqual(
                    Option.some(textToRichTextDocument(content)),
                  )
                  return context
                }),
            }),
            And("they see an indicator that Spanish translation is unavailable", {
              handler: (context: WikiContext) =>
                Effect.sync(() => {
                  expect(pageIn(context).translationUnavailable).toBe(true)
                  expect(pageIn(context).language).toBe("pt")
                  return context
                }),
            }),
          ),
      })
    })

    Rule(
      "Plant cultivars reference parent plants and preserve authored property states",
      ({ Background, Scenario }) => {
        Background({
          layer: WikiTestLayer,
          steps: () => runSteps(community(), moderator(), publishedPlant()),
        })

        Scenario("Create a plant cultivar linked to its parent", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              When("{string:name} proposes a plant cultivar article for {string:title} with:", {
                params: Schema.Struct({
                  name: Schema.Literal("Maria"),
                  title: Schema.Literal("Banana"),
                  table: Schema.Array(
                    Schema.Struct({
                      field: Schema.Literal("commonNames"),
                      value: Schema.String,
                    }),
                  ),
                }),
                handler: (_, { table }) =>
                  background().pipe(
                    Effect.flatMap((context) =>
                      proposeCultivar({
                        context: context,
                        title: Option.getOrThrow(Option.fromNullishOr(table[0])).value,
                      }),
                    ),
                  ),
              }),
              Then(
                "a creation revision is created with {string:evaluation} evaluation, created by {string:name}",
                {
                  params: Schema.Struct({
                    evaluation: Schema.Literal("PENDING"),
                    name: Schema.String,
                  }),
                  handler: (context: WikiContext, { evaluation, name }) =>
                    Effect.gen(function* () {
                      const row = Option.getOrThrow(yield* findRevisionById(revisionId(context)))

                      expect(row).toMatchObject({
                        evaluation,
                        createdById: personNamed(context.actors, name),
                        evaluatedById: Option.none(),
                      })

                      expect(yield* findDatabaseRowById(row.wikiArticleId)).toEqual(Option.none())
                      return context
                    }),
                },
              ),
              And("{string:title} is not visible in {string:parent}'s cultivars list", {
                params: Schema.Struct({
                  title: Schema.String,
                  parent: Schema.String,
                }),
                handler: (context: WikiContext, { parent }) =>
                  Effect.gen(function* () {
                    expect(
                      yield* (yield* WikiArticlesService).listCultivars(articleId(context, parent)),
                    ).toEqual([])
                    return context
                  }),
              }),
              approval(),
              Then("{string:title} is published with kind {string:kind}", {
                params: Schema.Struct({
                  title: Schema.String,
                  kind: Schema.Literal("PLANT_CULTIVAR"),
                }),
                handler: (context: WikiContext, { title, kind }) =>
                  Effect.gen(function* () {
                    expect(yield* cultivar(context, title)).toMatchObject({
                      kind,
                      status: "PUBLISHED",
                    })
                    return context
                  }),
              }),
              And("{string:title} appears in {string:parent}'s cultivars list", {
                params: Schema.Struct({
                  title: Schema.String,
                  parent: Schema.String,
                }),
                handler: (context: WikiContext, { title, parent }) =>
                  Effect.gen(function* () {
                    const page = yield* view(context, { title: parent, language: "pt" })

                    expect(
                      pageIn(page).cultivars.map((cultivar) =>
                        cultivar.commonNames.map((name) => name.name),
                      ),
                    ).toContainEqual([title])

                    return context
                  }),
              }),
            ),
        })

        Scenario("Omitted cultivar properties remain Unknown", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              parentLifecycles(),
              When("{string:name} proposes {string:title} without specifying lifecycles", {
                params: Schema.Struct({
                  name: Schema.Literal("Maria"),
                  title: Schema.String,
                }),
                handler: (context: WikiContext, { title }) =>
                  proposeCultivar({
                    context: context,
                    title: title,
                  }),
              }),
              approval(),
              propertyState(),
              And(
                "parent lifecycles {string:lifecycles} do not become {string:title}'s authored lifecycles",
                {
                  params: Schema.Struct({
                    lifecycles: Schema.Literal("PERENNIAL"),
                    title: Schema.String,
                  }),
                  handler: (context: WikiContext, { title }) =>
                    Effect.gen(function* () {
                      const row = yield* cultivar(context, title)
                      expect(row.attributes.lifecycles).toEqual({
                        _tag: "Unknown",
                      })
                      expect(
                        (yield* (yield* WikiArticlesService).resolveCultivar(row.attributes))
                          .lifecycles,
                      ).toEqual(Option.none())
                      return context
                    }),
                },
              ),
            ),
        })

        Scenario("Explicit inheritance resolves the parent property", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              parentLifecycles(),
              When("{string:name} proposes {string:title} with lifecycles state {string:state}", {
                params: Schema.Struct({
                  name: Schema.Literal("Maria"),
                  title: Schema.String,
                  state: Schema.Literal("Inherit"),
                }),
                handler: (context: WikiContext, { title, state }) =>
                  proposeCultivar({
                    context: context,
                    title: title,
                    attributes: {
                      lifecycles: {
                        _tag: state,
                      },
                    },
                  }),
              }),
              approval(),
              propertyState(),
              And("{string:title}'s resolved lifecycles are {string:lifecycles}", {
                params: Schema.Struct({
                  title: Schema.String,
                  lifecycles: Schema.Literal("PERENNIAL"),
                }),
                handler: (context: WikiContext, { title, lifecycles }) =>
                  Effect.gen(function* () {
                    expect(
                      (yield* (yield* WikiArticlesService).resolveCultivar(
                        (yield* cultivar(context, title)).attributes,
                      )).lifecycles,
                    ).toEqual(Option.some([lifecycles]))

                    return context
                  }),
              }),
            ),
        })

        Scenario("Explicit cultivar values override parent values", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              parentCycle(),
              When(
                "{string:name} proposes {string:title} with developmentCycle state {string:state} and range {int:min}-{int:max} days",
                {
                  params: Schema.Struct({
                    name: Schema.Literal("Maria"),
                    title: Schema.String,
                    state: Schema.Literal("Value"),
                    min: Schema.Int,
                    max: Schema.Int,
                  }),
                  handler: (context: WikiContext, { title, state, min, max }) =>
                    proposeCultivar({
                      context: context,
                      title: title,
                      attributes: {
                        developmentCycle: {
                          _tag: state,
                          value: range(min, max),
                        },
                      },
                    }),
                },
              ),
              approval(),
              Then(
                "{string:title}'s developmentCycle property has state {string:state} and range {int:min}-{int:max} days",
                {
                  params: Schema.Struct({
                    title: Schema.String,
                    state: Schema.Literal("Value"),
                    min: Schema.Int,
                    max: Schema.Int,
                  }),
                  handler: (context: WikiContext, { title, state, min, max }) =>
                    Effect.gen(function* () {
                      expect((yield* cultivar(context, title)).attributes.developmentCycle).toEqual(
                        {
                          _tag: state,
                          value: range(min, max),
                        },
                      )

                      return context
                    }),
                },
              ),
              And("{string:title}'s resolved development cycle is {int:min}-{int:max} days", {
                params: Schema.Struct({
                  title: Schema.String,
                  min: Schema.Int,
                  max: Schema.Int,
                }),
                handler: (context: WikiContext, { title, min, max }) =>
                  Effect.gen(function* () {
                    expect(
                      (yield* (yield* WikiArticlesService).resolveCultivar(
                        (yield* cultivar(context, title)).attributes,
                      )).developmentCycle,
                    ).toEqual(Option.some(range(min, max)))

                    return context
                  }),
              }),
            ),
        })

        Scenario("Parent edits change inherited values without changing authored cultivar states", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              parentCycle(),
              And("published cultivar {string:title} has developmentCycle state {string:state}", {
                params: Schema.Struct({
                  title: Schema.String,
                  state: Schema.Literal("Inherit"),
                }),
                handler: (context: WikiContext, { title, state }) =>
                  proposeCultivar({
                    context: context,
                    title: title,
                    attributes: {
                      developmentCycle: {
                        _tag: state,
                      },
                    },
                  }).pipe(Effect.flatMap(approve)),
              }),
              And(
                "published cultivar {string:title} has developmentCycle state {string:state} and range {int:min}-{int:max} days",
                {
                  params: Schema.Struct({
                    title: Schema.String,
                    state: Schema.Literal("Value"),
                    min: Schema.Int,
                    max: Schema.Int,
                  }),
                  handler: (context: WikiContext, { title, state, min, max }) =>
                    proposeCultivar({
                      context: context,
                      title: title,
                      attributes: {
                        developmentCycle: {
                          _tag: state,
                          value: range(min, max),
                        },
                      },
                    }).pipe(Effect.flatMap(approve)),
                },
              ),
              And("published cultivar {string:title} has developmentCycle state {string:state}", {
                params: Schema.Struct({
                  title: Schema.String,
                  state: Schema.Literal("Unknown"),
                }),
                handler: (context: WikiContext, { title, state }) =>
                  proposeCultivar({
                    context: context,
                    title: title,
                    attributes: {
                      developmentCycle: {
                        _tag: state,
                      },
                    },
                  }).pipe(Effect.flatMap(approve)),
              }),
              When(
                "an approved revision changes {string:title} development cycle to {int:min}-{int:max} days",
                {
                  params: Schema.Struct({
                    title: Schema.Literal("Banana"),
                    min: Schema.Int,
                    max: Schema.Int,
                  }),
                  handler: (context: WikiContext, { min, max }) =>
                    setParentRange({
                      context: context,
                      min: min,
                      max: max,
                    }),
                },
              ),
              Then("{string:title}'s resolved development cycle is {int:min}-{int:max} days", {
                params: Schema.Struct({
                  title: Schema.String,
                  min: Schema.Int,
                  max: Schema.Int,
                }),
                handler: (context: WikiContext, { title, min, max }) =>
                  Effect.gen(function* () {
                    expect(
                      (yield* (yield* WikiArticlesService).resolveCultivar(
                        (yield* cultivar(context, title)).attributes,
                      )).developmentCycle,
                    ).toEqual(Option.some(range(min, max)))

                    return context
                  }),
              }),
              And("{string:title}'s developmentCycle property remains in state {string:state}", {
                params: Schema.Struct({
                  title: Schema.String,
                  state: Schema.Literals(["Inherit", "Unknown"]),
                }),
                handler: (context: WikiContext, { title, state }) =>
                  Effect.gen(function* () {
                    expect((yield* cultivar(context, title)).attributes.developmentCycle).toEqual({
                      _tag: state,
                    })
                    return context
                  }),
              }),
              And(
                "{string:title}'s developmentCycle property remains in state {string:state} with range {int:min}-{int:max} days",
                {
                  params: Schema.Struct({
                    title: Schema.String,
                    state: Schema.Literal("Value"),
                    min: Schema.Int,
                    max: Schema.Int,
                  }),
                  handler: (context: WikiContext, { title, state, min, max }) =>
                    Effect.gen(function* () {
                      const row = yield* cultivar(context, title)
                      expect(row.attributes.developmentCycle).toEqual({
                        _tag: state,
                        value: range(min, max),
                      })
                      expect(
                        (yield* (yield* WikiArticlesService).resolveCultivar(row.attributes))
                          .developmentCycle,
                      ).toEqual(Option.some(range(min, max)))
                      return context
                    }),
                },
              ),
              And("{string:title}'s developmentCycle property remains in state {string:state}", {
                params: Schema.Struct({
                  title: Schema.String,
                  state: Schema.Literal("Unknown"),
                }),
                handler: (context: WikiContext, { title, state }) =>
                  Effect.gen(function* () {
                    expect((yield* cultivar(context, title)).attributes.developmentCycle).toEqual({
                      _tag: state,
                    })
                    return context
                  }),
              }),
            ),
        })

        Scenario("Viewing a plant article lists its published cultivars", {
          layer: WikiTestLayer,
          steps: () =>
            runSteps(
              Given("{string:parent} has published cultivars {string:first} and {string:second}", {
                params: Schema.Struct({
                  parent: Schema.Literal("Banana"),
                  first: Schema.String,
                  second: Schema.String,
                }),
                handler: (_, { first, second }) =>
                  background().pipe(
                    Effect.flatMap((context) =>
                      proposeCultivar({
                        context: context,
                        title: first,
                      }),
                    ),
                    Effect.flatMap(approve),
                    Effect.flatMap((context) =>
                      proposeCultivar({
                        context: context,
                        title: second,
                      }),
                    ),
                    Effect.flatMap(approve),
                  ),
              }),
              When("viewing {string:title}", {
                params: titleParams,
                handler: (context: WikiContext, { title }) =>
                  Effect.gen(function* () {
                    const row = Option.getOrThrow(
                      yield* (yield* WikiArticlesRepository).findBySearchableName(
                        title.toLowerCase(),
                      ),
                    )

                    return {
                      ...context,
                      page: yield* (yield* WikiArticlesService).getPage({
                        handle: row.handle,
                        kind: "PLANT",
                        language: "pt",
                      }),
                    }
                  }),
              }),
              Then("the cultivars section lists {string:first} and {string:second}", {
                params: Schema.Struct({
                  first: Schema.String,
                  second: Schema.String,
                }),
                handler: (context: WikiContext, { first, second }) =>
                  Effect.sync(() => {
                    expect(pageIn(context).cultivars).toHaveLength(2)

                    expect(
                      pageIn(context).cultivars.flatMap((row) =>
                        row.commonNames.map((name) => name.name),
                      ),
                    ).toEqual(expect.arrayContaining([first, second]))

                    expect(pageIn(context).cultivars.map((row) => row.id)).toEqual(
                      expect.arrayContaining([
                        articleId(context, first),
                        articleId(context, second),
                      ]),
                    )

                    return context
                  }),
              }),
              And("their cards name {string:parent} as the plant they belong to", {
                params: Schema.Struct({ parent: Schema.String }),
                handler: (context: WikiContext, { parent }) =>
                  Effect.gen(function* () {
                    const cards = yield* (yield* WikiArticlesService).listCultivarCards({
                      handle: pageIn(context).handle,
                      kind: "PLANT",
                      language: "pt",
                    })

                    expect(cards.map((card) => card.id)).toEqual(
                      expect.arrayContaining(pageIn(context).cultivars.map((row) => row.id)),
                    )
                    expect(cards).toHaveLength(pageIn(context).cultivars.length)
                    expect(
                      cards.map((card) => Option.map(card.parentPlantName, (name) => name.name)),
                    ).toEqual(cards.map(() => Option.some(parent)))

                    return context
                  }),
              }),
            ),
        })
      },
    )

    Rule("Wiki articles can have categorized photos", ({ Background, Scenario }) => {
      Background({
        layer: WikiTestLayer,
        steps: () => runSteps(community(), articleExists()),
      })

      Scenario("Add photo with category", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            When("{string:name} adds a photo to {string:title} with category {string:category}", {
              params: Schema.Struct({
                name: Schema.Literal("Maria"),
                title: Schema.String,
                category: Schema.String,
              }),
              handler: (_, { title, category }) =>
                background().pipe(
                  Effect.flatMap((context) => uploadPhoto(context, { title, category })),
                ),
            }),
            Then("the photo appears in {string:title}'s gallery under {string:category}", {
              params: Schema.Struct({ title: Schema.String, category: Schema.String }),
              handler: (context: WikiContext, { title, category }) =>
                Effect.gen(function* () {
                  const page = yield* view(context, { title, language: "pt" })

                  expect(
                    pageIn(page)
                      .mediaAssets.filter((photo) => photo.category === category)
                      .map((photo) => photo.id),
                  ).toContain(photoIn(context).id)

                  return context
                }),
            }),
          ),
      })

      Scenario("Photos are approved by default", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            When("{string:name} adds a photo to {string:title}", {
              params: Schema.Struct({
                name: Schema.Literal("Maria"),
                title: Schema.String,
              }),
              handler: (_, { title }) =>
                background().pipe(Effect.flatMap((context) => uploadPhoto(context, { title }))),
            }),
            Then("the photo is visible in the encyclopedia", {
              handler: (context: WikiContext) =>
                Effect.gen(function* () {
                  expect(photoIn(context).moderationStatus).toBe("APPROVED_BY_DEFAULT")

                  expect(
                    (yield* (yield* WikiArticlesRepository).listWikiArticleMedia(
                      articleId(context, "Mandioca"),
                    )).map((row) => row.id),
                  ).toContain(photoIn(context).id)

                  return context
                }),
            }),
          ),
      })

      Scenario("Moderator can censor a photo", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            photoAdded(),
            moderator(),
            When("{string:name} censors the photo", {
              params: Schema.Struct({
                name: Schema.String,
              }),
              handler: (context: WikiContext, { name }) =>
                Effect.gen(function* () {
                  yield* asPerson({
                    context: context,
                    name: name,
                    action: (yield* MediaAssetsService).moderate({
                      id: photoIn(context).id,
                      moderationStatus: "CENSORED",
                    }),
                  })

                  return context
                }),
            }),
            Then("the photo becomes hidden in {string:title}'s gallery", {
              params: titleParams,
              handler: (context: WikiContext, { title }) =>
                Effect.gen(function* () {
                  expect(
                    yield* (yield* WikiArticlesRepository).listWikiArticleMedia(
                      articleId(context, title),
                    ),
                  ).toEqual([])

                  return context
                }),
            }),
          ),
      })

      Scenario("Moderators can set main photo for wiki article", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            approvedPhotos(),
            moderator(),
            When("{string:name} sets a photo as the main photo", {
              params: Schema.Struct({
                name: Schema.String,
              }),
              handler: (context: WikiContext, { name }) =>
                Effect.gen(function* () {
                  yield* asPerson({
                    context: context,
                    name: name,
                    action: (yield* WikiArticlesService).setMainMedia({
                      wikiArticleId: articleId(context, "Mandioca"),
                      mediaAssetId: photoIn(context).id,
                    }),
                  })

                  return context
                }),
            }),
            Then("that photo appears as {string:title}'s thumbnail in listings", {
              params: titleParams,
              handler: (context: WikiContext, { title }) =>
                Effect.gen(function* () {
                  expect(
                    (yield* (yield* WikiArticlesService).listCards("pt")).find(
                      (card) => card.id === articleId(context, title),
                    )?.thumbnailMediaAssetId,
                  ).toEqual(Option.some(photoIn(context).id))

                  return context
                }),
            }),
          ),
      })

      Scenario("Member with community access can't set main photo for wiki article", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            approvedPhotos(),
            When("{string:name} sets a photo as the main photo", {
              params: Schema.Struct({
                name: Schema.String,
              }),
              handler: (context: WikiContext, { name }) =>
                Effect.gen(function* () {
                  const error = yield* asPerson({
                    context: context,
                    name: name,
                    action: (yield* WikiArticlesService).setMainMedia({
                      wikiArticleId: articleId(context, "Mandioca"),
                      mediaAssetId: photoIn(context).id,
                    }),
                  }).pipe(Effect.flip)

                  return {
                    ...context,
                    error,
                  }
                }),
            }),
            Then("access is denied", {
              handler: (context: WikiContext) =>
                Effect.gen(function* () {
                  expect(context.error).toMatchObject({
                    _tag: "UnauthorizedError",
                  })

                  expect(
                    yield* (yield* WikiArticlesService).getThumbnail(
                      articleId(context, "Mandioca"),
                    ),
                  ).toEqual(Option.none())

                  return context
                }),
            }),
          ),
      })
    })

    Rule("People can bookmark wiki articles", ({ Background, Scenario, ScenarioOutline }) => {
      Background({
        layer: WikiTestLayer,
        steps: () => runSteps(community(), articleExists()),
      })

      Scenario("Bookmark a wiki article with the default state", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            When("{string:name} bookmarks {string:title} without selecting a state", {
              params: Schema.Struct({
                name: Schema.String,
                title: Schema.String,
              }),
              handler: (_, { name, title }) =>
                background().pipe(
                  Effect.flatMap((context) =>
                    bookmark({
                      context: context,
                      name: name,
                      title: title,
                    }),
                  ),
                ),
            }),
            bookmarkVisible(),
          ),
      })

      ScenarioOutline("Bookmark a wiki article with an explicit state", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            When("{string:name} bookmarks {string:title} with state {string:state}", {
              params: Schema.Struct({
                name: Schema.String,
                title: Schema.String,
                state: BookmarkState,
              }),
              handler: (_, { name, title, state }) =>
                background().pipe(
                  Effect.flatMap((context) =>
                    bookmark({
                      context: context,
                      name: name,
                      title: title,
                      state: state,
                    }),
                  ),
                ),
            }),
            bookmarkVisible(),
          ),
      })

      Scenario("Changing to INDIFFERENT retains the bookmark", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            bookmarked(),
            When("{string:name} changes the bookmark state to {string:state}", {
              params: Schema.Struct({
                name: Schema.String,
                state: BookmarkState,
              }),
              handler: (context: WikiContext, { name, state }) =>
                bookmark({
                  context: context,
                  name: name,
                  title: "Mandioca",
                  state: state,
                }),
            }),
            bookmarkVisible(),
            And("{string:name} has exactly one bookmark for {string:title}", {
              params: Schema.Struct({
                name: Schema.String,
                title: Schema.String,
              }),
              handler: (context: WikiContext, { name, title }) =>
                Effect.gen(function* () {
                  const sql = yield* SqlClient.SqlClient

                  expect(
                    yield* sql`SELECT state FROM bookmarks_wiki_articles WHERE person_id = ${personNamed(context.actors, name)} AND wiki_article_id = ${articleId(context, title)}`,
                  ).toEqual([
                    {
                      state: "INDIFFERENT",
                    },
                  ])

                  return context
                }),
            }),
          ),
      })

      Scenario("Remove bookmark", {
        layer: WikiTestLayer,
        steps: () =>
          runSteps(
            bookmarked(),
            When("{string:name} removes the bookmark", {
              params: Schema.Struct({
                name: Schema.String,
              }),
              handler: (context: WikiContext, { name }) =>
                Effect.gen(function* () {
                  yield* asPerson({
                    context: context,
                    name: name,
                    action: (yield* WikiArticlesService).removeBookmark(
                      articleId(context, "Mandioca"),
                    ),
                  })

                  return context
                }),
            }),
            Then("{string:title} no longer appears in {string:name}'s bookmarked wiki articles", {
              params: Schema.Struct({
                title: Schema.String,
                name: Schema.String,
              }),
              handler: (context: WikiContext, { name, title }) =>
                Effect.gen(function* () {
                  expect(
                    yield* asPerson({
                      context: context,
                      name: name,
                      action: (yield* WikiArticlesService).listBookmarks,
                    }),
                  ).toEqual([])

                  const sql = yield* SqlClient.SqlClient
                  expect(
                    yield* sql`SELECT * FROM bookmarks_wiki_articles WHERE person_id = ${personNamed(context.actors, name)} AND wiki_article_id = ${articleId(context, title)}`,
                  ).toEqual([])
                  return context
                }),
            }),
          ),
      })
    })

    Rule(
      "Anyone can see the public profiles that bookmarked an article",
      ({ Background, Scenario }) => {
        Background({
          layer: WikiTestLayer,
          steps: () => runSteps(community(), articleExists()),
        })

        Scenario("A bookmark lists its profile with the bookmark state", {
          layer: WikiTestLayer,
          steps: () => runSteps(bookmarked(), listedBookmarker()),
        })

        Scenario("INDIFFERENT bookmarks are not listed", {
          layer: WikiTestLayer,
          steps: () => runSteps(bookmarked(), unlistedBookmarker()),
        })

        Scenario("Profiles visible only to the community are not listed", {
          layer: WikiTestLayer,
          steps: () => runSteps(communityOnlyProfile(), bookmarked(), unlistedBookmarker()),
        })
      },
    )

    Rule(
      "Anyone can see the public profiles that contributed to an article",
      ({ Background, Scenario }) => {
        Background({
          layer: WikiTestLayer,
          steps: () => runSteps(community(), moderator(), articleExists()),
        })

        Scenario("Approved edits count as contributions", {
          layer: WikiTestLayer,
          steps: () => runSteps(evaluatedEdits(), listedContributor()),
        })

        Scenario("Rejected edits don't count as contributions", {
          layer: WikiTestLayer,
          steps: () => runSteps(evaluatedEdit(), unlistedContributor()),
        })
      },
    )

    Rule(
      "Wiki articles relate to the articles their content references, names or is about",
      ({ Background, Scenario }) => {
        Background({
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(community(), moderator(), articleExists(), articleExists(), articleExists()),
        })

        Scenario("Referencing an article relates both articles", {
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(
              When(
                "an approved revision makes {string:title}'s content reference {string:referenced}",
                {
                  params: ReferenceParams,
                  handler: approveReference,
                },
              ),
              relatedArticles(),
              And("{string:title}'s related articles are:", {
                params: RelatedArticlesParams,
                handler: expectRelatedArticles,
              }),
            ),
        })

        Scenario("Removing a reference removes its relation", {
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(
              referencedInRevision(),
              When(
                "an approved revision makes {string:title}'s content reference {string:referenced}",
                {
                  params: ReferenceParams,
                  handler: approveReference,
                },
              ),
              relatedArticles(),
            ),
        })

        Scenario("Naming an article in the content relates them", {
          layer: RelationsTestLayer,
          steps: () => runSteps(saidInRevision(), linksInferred(), relatedArticles()),
        })

        Scenario("Inferring what the content is about relates the articles", {
          layer: RelationsTestLayer,
          steps: () => runSteps(inferredByLinkInference(), linksInferred(), relatedArticles()),
        })

        Scenario("Link inference keeps the relations from references", {
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(
              inferredByLinkInference(),
              And(
                "an approved revision makes {string:title}'s content reference {string:referenced}",
                {
                  params: ReferenceParams,
                  handler: approveReference,
                },
              ),
              linksInferred(),
              relatedArticles(),
            ),
        })

        Scenario("Readers see which article's content established a relation", {
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(
              When(
                "an approved revision makes {string:title}'s content reference {string:referenced}",
                {
                  params: ReferenceParams,
                  handler: approveReference,
                },
              ),
              relatedThrough(),
              And("{string:title} is related to {string:related} through:", {
                params: RelationLinksParams,
                handler: expectRelationLinks,
              }),
            ),
        })

        Scenario("Each article's content keeps its own evidence for the same relation", {
          layer: RelationsTestLayer,
          steps: () =>
            runSteps(
              referencedInRevision(),
              And("an approved revision makes {string:title}'s content say {string:text}", {
                params: Schema.Struct({ title: Schema.String, text: Schema.String }),
                handler: approveSaying,
              }),
              linksInferred(),
              relatedThrough(),
              evidencePointsAtNodes(),
            ),
        })
      },
    )
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect(
  "bookmark transitions are isolated per person and denied writes leave storage unchanged",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          first: BookmarkState,
          next: BookmarkState,
          accessLevel: PlatformAccessLevelOrVisitor,
        }),
      ),
      options: {
        runs: 30,
      },
      predicate: ({ first, next, accessLevel }) =>
        Effect.gen(function* () {
          const people = yield* provisionPeople([
            {
              name: "Owner",
              accessLevel: "COMMUNITY",
            },
            ...(accessLevel === "VISITOR"
              ? []
              : [
                  {
                    name: "Reader",
                    accessLevel,
                  },
                ]),
          ])

          const context = yield* seedArticle({
            context: {
              ...people,
              articles: {},
            },
            title: "Mandioca",
          })

          const id = articleId(context, "Mandioca")
          const service = yield* WikiArticlesService
          const owner = personNamed(context.actors, "Owner")

          const read = <A, E, R>(action: Effect.Effect<A, E, R | SessionContext>) =>
            accessLevel === "VISITOR"
              ? withSession(action, VISITOR_SESSION)
              : asPerson({
                  context: context,
                  name: "Reader",
                  action: action,
                })

          yield* withPerson(service.bookmark(id, first), owner)
          const sql = yield* SqlClient.SqlClient
          const before =
            yield* sql`SELECT * FROM bookmarks_wiki_articles ORDER BY person_id, wiki_article_id`
          const result = yield* read(service.bookmark(id, next)).pipe(Effect.result)
          const allowed =
            accessLevel === "COMMUNITY" || accessLevel === "MODERATOR" || accessLevel === "ADMIN"
          expect(Result.isSuccess(result)).toBe(allowed)

          yield* Result.match(result, {
            onFailure: (error) =>
              Effect.gen(function* () {
                expect(error).toMatchObject({
                  _tag: "UnauthorizedError",
                })
                expect(
                  yield* sql`SELECT * FROM bookmarks_wiki_articles ORDER BY person_id, wiki_article_id`,
                ).toEqual(before)
              }),
            onSuccess: () =>
              Effect.gen(function* () {
                yield* read(service.bookmark(id, next))

                expect(yield* read(service.listBookmarks)).toEqual([
                  {
                    wikiArticleId: id,
                    state: next,
                  },
                ])

                yield* read(service.removeBookmark(id))
                expect(yield* read(service.listBookmarks)).toEqual([])
                yield* read(service.bookmark(id))
                expect(yield* read(service.listBookmarks)).toEqual([
                  { wikiArticleId: id, state: "INTERESTED" },
                ])
                yield* read(service.removeBookmark(id))
                expect(yield* read(service.listBookmarks)).toEqual([])
              }),
          })

          expect(yield* withPerson(service.listBookmarks, owner)).toEqual([
            {
              wikiArticleId: id,
              state: first,
            },
          ])

          return true
        }).pipe(Effect.provide(WikiTestLayer)),
    }),
)

it.effect(
  "cultivar resolution follows parent edits while preserving CRDT and authored states",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          state: Schema.Literals(["Unknown", "Inherit", "Value"]),
          min: Schema.Int.check(
            Schema.isBetween({
              minimum: 0,
              maximum: 1000,
            }),
          ),
          span: Schema.Int.check(
            Schema.isBetween({
              minimum: 0,
              maximum: 1000,
            }),
          ),
        }),
      ),
      options: {
        runs: 20,
      },
      predicate: ({ state, min, span }) =>
        Effect.gen(function* () {
          const initial = yield* seedArticle({
            context: yield* setupPeople(),
            title: "Banana",
          })

          const authored =
            state === "Value"
              ? {
                  _tag: state,
                  value: range(min, min + span),
                }
              : {
                  _tag: state,
                }

          const context = yield* proposeCultivar({
            context: initial,
            title: "Banana Prata",
            attributes: {
              developmentCycle: authored,
            },
          }).pipe(Effect.flatMap(approve))

          const id = articleId(context, "Banana Prata")
          const before = Option.getOrThrow(yield* findSourceRowById(id))
          const service = yield* WikiArticlesService
          const original = yield* cultivar(context, "Banana Prata")
          const missing = yield* service.resolveCultivar(original.attributes)
          expect(missing.developmentCycle).toEqual(
            state === "Value" ? Option.some(range(min, min + span)) : Option.none(),
          )

          yield* setParentRange({
            context: context,
            min: min + 1,
            max: min + span + 1,
          })

          const after = yield* cultivar(context, "Banana Prata")
          expect(after).toEqual(original)
          expect(Option.getOrThrow(yield* findSourceRowById(id))).toEqual(before)

          expect((yield* service.resolveCultivar(after.attributes)).developmentCycle).toEqual(
            state === "Unknown"
              ? Option.none()
              : Option.some(
                  state === "Value" ? range(min, min + span) : range(min + 1, min + span + 1),
                ),
          )

          return true
        }).pipe(Effect.provide(WikiTestLayer)),
    }),
)

it.effect("plant search ORs enum selections and matches overlapping numeric ranges", () =>
  Effect.gen(function* () {
    let context = yield* setupPeople()

    context = yield* seedArticle({
      context,
      title: "Tall emergent plant",
      data: plantWithSearchableAttributes("Tall emergent plant", {
        strata: ["EMERGENT"],
        heightMin: 100,
        heightMax: 200,
      }),
    })

    context = yield* seedArticle({
      context,
      title: "High plant",
      data: plantWithSearchableAttributes("High plant", { strata: ["HIGH"] }),
    })

    context = yield* seedArticle({
      context,
      title: "Ground plant",
      data: plantWithSearchableAttributes("Ground plant", { strata: ["GROUND"] }),
    })

    context = yield* seedArticle({
      context,
      title: "Bilingual plant",
      data: bilingualPlant("Bilingual plant"),
    })

    const service = yield* WikiArticlesService

    const matchingStrata = yield* service.searchWikiArticles({
      kind: "PLANT",
      text: undefined,
      strata: ["HIGH", "EMERGENT"],
    })

    const matchingHeight = yield* service.searchWikiArticles(
      Schema.decodeSync(WikiSearchParams)({
        kind: "PLANT",
        heightMin: 150,
        heightMax: 250,
      }),
    )

    const englishCards = yield* service.searchWikiArticles({
      kind: "PLANT",
      language: "en",
      text: "Bilingual plant in English",
    })

    expect(matchingStrata.map((article) => article.id)).toEqual(
      expect.arrayContaining([
        articleId(context, "Tall emergent plant"),
        articleId(context, "High plant"),
      ]),
    )

    expect(matchingStrata).toHaveLength(2)
    expect(matchingHeight.map((article) => article.id)).toEqual([
      articleId(context, "Tall emergent plant"),
    ])

    expect(englishCards).toEqual([
      expect.objectContaining({
        id: articleId(context, "Bilingual plant"),
        language: "en",
      }),
    ])

    expect(() =>
      Schema.decodeSync(WikiSearchParams)({
        kind: "PLANT",
        temperatureMin: 25,
        temperatureMax: 10,
      }),
    ).toThrow("Temperature minimum must not exceed maximum")
  }).pipe(Effect.provide(WikiTestLayer)),
)

it.effect("text search ranks names above mentions, folds accents and tolerates typos", () =>
  Effect.gen(function* () {
    const people = yield* setupPeople()

    let context = yield* Effect.reduce(
      [
        ["Fruta-de-papagaio", "Fruta silvestre, parecida com milho."],
        ["Milho", "Grão cultivado há milênios."],
        ["Feijão", "Leguminosa."],
        ["Batata", "Tubérculo."],
        ["Batata-doce", "Raiz doce."],
      ] as const,
      () => people,
      (context, [title, content]) => seedArticle({ context, title, data: plant(title, content) }),
    )

    // Matches in its title and alias add up, outscoring the article named just "Feijão"
    const blackBeans = translation("Feijão-preto", "Feijão de caldo grosso.")

    context = yield* seedArticle({
      context,
      title: "Feijão-preto",
      data: WikiPlantArticle.EditableArticle.make({
        ...plant("Feijão-preto"),
        translations: {
          pt: {
            ...blackBeans,
            commonNames: [
              ...blackBeans.commonNames,
              Schema.decodeSync(WikiArticleCommonNameInCrdtList)({
                id: "wikicommon02",
                name: "Feijão-da-feijoada",
              }),
            ],
            origin: Option.none(),
          },
        },
      }),
    })

    const service = yield* WikiArticlesService
    const search = (text: string) =>
      Effect.map(service.searchWikiArticles({ text }), (cards) =>
        cards.map((card) => card.commonNames[0]?.name),
      )

    expect(yield* search("milho")).toEqual(["Milho", "Fruta-de-papagaio"])
    expect(yield* search("FEIJAO")).toEqual(["Feijão", "Feijão-preto"])
    expect(yield* search("feijão preto")).toEqual(["Feijão-preto"])
    expect(yield* search("batata doce")).toEqual(["Batata-doce"])
    // Trigram indexes can't match shorter terms
    expect(yield* search("mi")).toEqual([])
    // Misspelled names come within a few edits of what was meant
    expect(yield* search("mlho")).toEqual(["Milho"])
    expect(yield* search("batata dose")).toEqual(["Batata-doce"])
    expect(yield* search("fiejao")).toEqual(["Feijão", "Feijão-preto"])
  }).pipe(Effect.provide(WikiTestLayer)),
)

it.effect("pending and rejected creation remain unavailable; only evaluators can publish", () =>
  Effect.gen(function* () {
    const context = yield* proposeCultivar({
      context: yield* seedArticle({
        context: yield* setupPeople(),
        title: "Banana",
      }),
      title: "Banana Prata",
    })

    const service = yield* WikiArticlesService
    const id = articleId(context, "Banana Prata")
    const before = Option.getOrThrow(yield* findRevisionById(revisionId(context)))
    expect(yield* service.getPublishedArticle(id).pipe(Effect.flip)).toMatchObject({
      _tag: "WikiArticleNotFoundError",
    })
    expect((yield* service.listCards("pt")).map((row) => row.id)).not.toContain(id)

    expect(
      yield* asPerson({
        context: context,
        name: "Maria",
        action: service.evaluateRevision(revisionId(context), { status: "APPROVED" }),
      }).pipe(Effect.flip),
    ).toMatchObject({
      _tag: "UnauthorizedError",
    })

    expect(Option.getOrThrow(yield* findRevisionById(revisionId(context)))).toEqual(before)

    yield* asPerson({
      context: context,
      name: "Ana",
      action: service.evaluateRevision(revisionId(context), { status: "REJECTED" }),
    })

    expect(yield* findDatabaseRowById(id)).toEqual(Option.none())
    expect(yield* service.getPublishedArticle(id).pipe(Effect.flip)).toMatchObject({
      _tag: "WikiArticleNotFoundError",
    })

    expect(
      yield* asPerson({
        context: context,
        name: "Ana",
        action: service.evaluateRevision(revisionId(context), { status: "APPROVED" }),
      }).pipe(Effect.flip),
    ).toMatchObject({
      _tag: "WikiArticleRevisionAlreadyEvaluatedError",
    })

    const sql = yield* SqlClient.SqlClient
    expect(yield* sql`PRAGMA foreign_key_check`).toEqual([])
  }).pipe(Effect.provide(WikiTestLayer)),
)

it.effect(
  "cultivar creation rejects missing, unpublished and non-plant parents without leaving drafts",
  () =>
    Effect.gen(function* () {
      const context = yield* seedArticle({
        context: yield* setupPeople(),
        title: "Banana",
      })
      const service = yield* WikiArticlesService

      const pending = yield* asPerson({
        context: context,
        name: "Maria",
        action: service.createWikiArticle({
          wikiArticle: plant("Banana Pendente"),
        }),
      })

      const nonPlant = yield* (yield* WikiArticlesRepository).createWikiArticle(
        {
          wikiArticle: {
            kind: "UNCATEGORIZED",
            attributes: {
              suggestedKind: Option.none(),
            },
            translations: {
              pt: translation("Conceito"),
            },
          },
          createdById: context.administratorId,
          status: "PUBLISHED",
        },
        {
          enrichment: "skip",
        },
      )

      const sql = yield* SqlClient.SqlClient
      const before = yield* sql`SELECT * FROM wiki_article_sources ORDER BY id`

      yield* Effect.forEach(
        [WikiArticleId.make("00000000-0000-7000-8000-000000000099"), pending, nonPlant],
        Effect.fn(function* (parentPlantId) {
          const error = yield* asPerson({
            context: context,
            name: "Maria",
            action: service.createWikiArticle({
              wikiArticle: WikiPlantCultivarArticle.EditableArticle.make({
                kind: "PLANT_CULTIVAR",
                attributes: WikiPlantCultivarArticle.EditableAttributes.make({
                  parentPlantId,
                }),
                translations: {
                  pt: translation("Banana Prata"),
                },
              }),
            }),
          }).pipe(Effect.flip)

          expect(error).toMatchObject({
            _tag:
              parentPlantId === nonPlant ? "InvalidCrdtUpdateError" : "WikiArticleNotFoundError",
          })
          expect(yield* sql`SELECT * FROM wiki_article_sources ORDER BY id`).toEqual(before)
        }),
        {
          concurrency: 1,
        },
      )
    }).pipe(Effect.provide(WikiTestLayer)),
)

it.effect(
  "main photos require a live attachment and disappear from listings after censorship",
  () =>
    Effect.gen(function* () {
      let context: WikiContext = yield* uploadPhoto(
        yield* seedArticle({
          context: yield* setupPeople(),
          title: "Mandioca",
        }),
      )

      context = yield* seedArticle({
        context: context,
        title: "Banana",
      })
      const service = yield* WikiArticlesService
      const photo = photoIn(context)
      const mandioca = articleId(context, "Mandioca")
      const banana = articleId(context, "Banana")

      expect(
        yield* asPerson({
          context: context,
          name: "Ana",
          action: service.setMainMedia({
            wikiArticleId: banana,
            mediaAssetId: photo.id,
          }),
        }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "MediaNotFoundError",
      })

      expect(yield* service.getThumbnail(banana)).toEqual(Option.none())

      expect(
        yield* asPerson({
          context: context,
          name: "Ana",
          action: service.attachMediaToWikiArticle({
            wikiArticleId: banana,
            mediaAssetId: photo.id,
          }),
        }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "UnauthorizedError",
      })

      yield* asPerson({
        context: context,
        name: "Ana",
        action: service.setMainMedia({
          wikiArticleId: mandioca,
          mediaAssetId: photo.id,
        }),
      })

      const second = yield* uploadPhoto(context)

      yield* asPerson({
        context: context,
        name: "Ana",
        action: service.setMainMedia({
          wikiArticleId: mandioca,
          mediaAssetId: photoIn(second).id,
        }),
      })

      expect(Option.getOrThrow(yield* service.getThumbnail(mandioca)).id).toBe(photoIn(second).id)

      yield* asPerson({
        context: context,
        name: "Ana",
        action: (yield* MediaAssetsService).moderate({
          id: photoIn(second).id,
          moderationStatus: "CENSORED",
        }),
      })

      expect(yield* service.getThumbnail(mandioca)).toEqual(Option.none())
      expect(
        (yield* service.listCards("pt")).find((card) => card.id === mandioca)
          ?.thumbnailMediaAssetId,
      ).toEqual(Option.none())

      expect(
        yield* asPerson({
          context: context,
          name: "Ana",
          action: service.setMainMedia({
            wikiArticleId: mandioca,
            mediaAssetId: photoIn(second).id,
          }),
        }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "MediaNotFoundError",
      })

      expect(
        (yield* (yield* WikiArticlesRepository).listWikiArticleMedia(mandioca)).map(
          (row) => row.id,
        ),
      ).toEqual([photo.id])
    }).pipe(Effect.provide(WikiTestLayer)),
)

it.live(
  "wiki HTTP mutations enforce moderation permissions and accept final revision statuses",
  () =>
    Effect.gen(function* () {
      const context = yield* uploadPhoto(
        yield* seedArticle({ context: yield* setupPeople(), title: "Mandioca" }),
      )
      let session: Session = yield* resolveSessionFromAuthSubjectId(
        personNamed(context.actors, "Maria"),
      )
      const services = yield* Effect.context<
        WikiArticlesService | IdGen | SqlClient.SqlClient | WorkflowEngine.WorkflowEngine
      >()
      const api = HttpApi.make(GororobasApi.identifier).add(GororobasApi.groups.wiki)

      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          HttpRouter.toWebHandler(
            Layer.provide(HttpApiBuilder.layer(api), WikiApiLive).pipe(
              HttpRouter.provideRequest(Layer.succeedContext(services)),
              Layer.provide(
                Layer.succeed(
                  ApiAuthentication,
                  ApiAuthentication.of((effect) =>
                    Effect.suspend(() =>
                      effect.pipe(Effect.provideService(SessionContext, session)),
                    ),
                  ),
                ),
              ),
              Layer.provide(NodeHttpServer.layerHttpServices),
            ),
            { disableLogger: true },
          ),
        ),
        (app) => Effect.tryPromise(() => app.dispose()).pipe(Effect.orDie),
      )

      const selectPhoto = (id: string) =>
        Effect.tryPromise(() =>
          app.handler(
            new Request(`http://localhost/wiki/${articleId(context, "Mandioca")}/main-media`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mediaAssetId: id }),
            }),
          ),
        )

      expect((yield* selectPhoto(photoIn(context).id)).status).toBe(403)
      expect(
        yield* (yield* WikiArticlesService).getThumbnail(articleId(context, "Mandioca")),
      ).toEqual(Option.none())
      session = yield* resolveSessionFromAuthSubjectId(personNamed(context.actors, "Ana"))
      expect((yield* selectPhoto(photoIn(context).id)).status).toBe(204)
      const listing = yield* Effect.tryPromise(() =>
        app.handler(new Request("http://localhost/wiki")),
      )
      expect(listing.status).toBe(200)

      expect(yield* Effect.tryPromise(() => listing.json())).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: articleId(context, "Mandioca"),
            thumbnailMediaAssetId: photoIn(context).id,
          }),
        ]),
      )

      expect((yield* selectPhoto("00000000-0000-7000-8000-000000000099")).status).toBe(404)
      expect((yield* selectPhoto("invalid")).status).toBe(400)

      const proposedId = yield* asPerson({
        context,
        name: "Maria",
        action: (yield* WikiArticlesService).createWikiArticle({
          wikiArticle: plant("Mandioca Nova"),
        }),
      })

      const pending = Option.getOrThrow(
        Option.fromNullishOr((yield* listPendingRevisionsByWikiArticleId(proposedId))[0]),
      )

      const evaluate = (payload: { status: string; reason?: string } | { isApproved: boolean }) =>
        Effect.tryPromise(() =>
          app.handler(
            new Request(`http://localhost/wiki/revisions/${pending.id}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            }),
          ),
        )

      expect((yield* evaluate({ status: "PENDING" })).status).toBe(400)
      expect((yield* evaluate({ isApproved: true })).status).toBe(400)
      expect(Option.getOrThrow(yield* findRevisionById(pending.id)).evaluation).toBe("PENDING")
      expect((yield* evaluate({ status: "REJECTED", reason: "Needs more detail" })).status).toBe(
        200,
      )
      expect(Option.getOrThrow(yield* findRevisionById(pending.id))).toMatchObject({
        evaluation: "REJECTED",
        evaluationReason: Option.some("Needs more detail"),
      })
    }).pipe(Effect.provide(WikiTestLayer)),
)
