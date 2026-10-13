import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { assert, expect, it } from "@effect/vitest"
import {
  ApiAuthentication,
  GororobasApi,
  IdGen,
  type Session,
  BookmarkState,
  PlatformAccessLevelOrVisitor,
  SessionContext,
  IntNonNegative,
  LoroDocUpdate,
  MediaAssetRow,
  NameInCrdtList,
  SupportedLanguage,
  WikiArticleCrdt,
  WikiArticleEditableData,
  WikiArticleId,
  WikiArticleQueriedPageData,
  WikiArticleProjectionRow,
  WikiArticleRevisionId,
  WikiPlantArticle,
  WikiPlantCultivarArticle,
  snapshotToLoroDoc,
  type PlantCultivarEditableAttributes,
} from "@gororobas/domain"
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
import { Effect, Layer, Option, Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"
import sharp from "sharp"

import { MediaAssetsService } from "../src/media-assets/service.js"
import { resolveSessionFromAuthSubjectId } from "../src/session-service.js"
import { WikiApiLive } from "../src/wiki/api-live.js"
import {
  findCrdtRowById,
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
const WikiBackground = Schema.Struct({
  ...PeopleBackground.fields,
  articles: Schema.Record(Schema.String, WikiArticleId),
})

type WikiContext = typeof WikiBackground.Type & {
  revisionId?: WikiArticleRevisionId
  photo?: MediaAssetRow
  page?: WikiArticleQueriedPageData & {
    translationUnavailable: boolean
    cultivars: readonly (WikiArticleProjectionRow & { commonNames: readonly string[] })[]
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
    Schema.decodeSync(NameInCrdtList)({
      id: "wikicommon01",
      value: title,
    }),
  ] as const,
  content: Option.some(textToRichTextDocument(content)),
  grammaticalGender: Option.none(),
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

const editParent = (context: WikiContext, edit: Parameters<typeof WikiArticleCrdt.applyEdit>[1]) =>
  Effect.gen(function* () {
    const id = articleId(context, "Banana")
    const stored = Option.getOrThrow(yield* findCrdtRowById(id))
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
      action: service.evaluateRevision(revision, { status: "APPROVED" }),
    })

    return context
  })

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
                  const row = Option.getOrThrow(yield* findCrdtRowById(articleId(context, title)))
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
                      pageIn(page).cultivars.map((cultivar) => cultivar.commonNames),
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
                    expect(pageIn(context).cultivars.flatMap((row) => row.commonNames)).toEqual(
                      expect.arrayContaining([first, second]),
                    )

                    expect(pageIn(context).cultivars.map((row) => row.id)).toEqual(
                      expect.arrayContaining([
                        articleId(context, first),
                        articleId(context, second),
                      ]),
                    )

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
                expect(yield* read(service.toggleBookmark(id)).pipe(Effect.flip)).toMatchObject({
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

                yield* read(service.toggleBookmark(id))
                expect(yield* read(service.listBookmarks)).toEqual([])
                yield* read(service.toggleBookmark(id))
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
          const before = Option.getOrThrow(yield* findCrdtRowById(id))
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
          expect(Option.getOrThrow(yield* findCrdtRowById(id))).toEqual(before)

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
      const before = yield* sql`SELECT * FROM wiki_article_crdts ORDER BY id`

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
          expect(yield* sql`SELECT * FROM wiki_article_crdts ORDER BY id`).toEqual(before)
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
