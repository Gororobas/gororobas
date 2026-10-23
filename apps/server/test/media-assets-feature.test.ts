import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ContentLanguage, Handle, ModerationStatus } from "@gororobas/domain"
import {
  PublicationCrdt,
  WikiArticleCrdt,
  LoroDocFrontier,
  LoroDocUpdate,
  snapshotToLoroDoc,
  MediaAssetRow,
  MediaAssetId,
  MediaAssetStorageError,
  WikiArticleCommonNameInCrdtList,
  PersonId,
  ProfileVisibility,
  PublicationId,
  SessionContext,
  WikiArticleId,
} from "@gororobas/domain"
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
  ConfigProvider,
  Deferred,
  Effect,
  FileSystem,
  Path,
  Layer,
  Option,
  Result,
  Schema,
  Record,
} from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { Workflow, WorkflowEngine } from "effect/workflow"
import sharp from "sharp"

import {
  MediaDeletionWorkflow,
  MediaDeletionWorkflowLayer,
} from "../src/media-assets/media-deletion-workflow.js"
import { MediaAssetsRepository } from "../src/media-assets/repository.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { MediaAssetsStorage } from "../src/media-assets/storage.js"
import { PeopleService } from "../src/people/service.js"
import { findPublicationCrdtSnapshotById } from "../src/publications/queries.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { findCrdtRowById, findRevisionById, listRevisionMediaAssets } from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { WikiArticlesService } from "../src/wiki/service.js"
import {
  createPost,
  PeopleBackground,
  PeopleFeatureTestLayer,
  PeopleTestDataTable,
  personNamed,
  provisionPeople,
  textToRichTextDocument,
  withPerson,
} from "./feature-test-helpers.js"
import { withSession } from "./test-helpers.js"

const storage = Layer.effect(
  MediaAssetsStorage,
  Effect.gen(function* () {
    const directory = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: "media-assets-feature-",
    })

    return yield* MediaAssetsStorage.make.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: directory }),
      ),
    )
  }),
).pipe(Layer.provide(NodeServices.layer))

const MediaServicesLayer = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
  Layer.provideMerge(
    Layer.mergeAll(storage, Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
  ),
  Layer.provideMerge(
    MediaDeletionWorkflowLayer.pipe(
      Layer.provide(storage),
      Layer.provideMerge(WorkflowEngine.layerMemory),
    ),
  ),
  Layer.provideMerge(PeopleFeatureTestLayer),
  Layer.provideMerge(NodeServices.layer),
)

const MediaFeatureTestLayer = Layer.effect(WikiArticlesService, WikiArticlesService.make).pipe(
  Layer.provideMerge(MediaServicesLayer),
)

const MediaBackground = Schema.Struct({
  ...PeopleBackground.fields,
  articles: Schema.optional(Schema.Record(Schema.String, WikiArticleId)),
})

type MediaContext = typeof MediaBackground.Type & {
  actorId?: PersonId | undefined
  publicationId?: PublicationId
  media?: MediaAssetRow
  error?: unknown
}

const background = () => getBackgroundContext(MediaBackground)
const mediaIn = (context: MediaContext) => Option.getOrThrow(Option.fromNullishOr(context.media))
const publicationIn = (context: MediaContext) =>
  Option.getOrThrow(Option.fromNullishOr(context.publicationId))
const articleIn = (context: MediaContext, name: string) =>
  Option.getOrThrow(Option.fromNullishOr(context.articles?.[name]))
const asViewer = <A, E, R>(
  context: MediaContext,
  action: Effect.Effect<A, E, R | SessionContext>,
) => (context.actorId ? withPerson(action, context.actorId) : withSession(action, VISITOR_SESSION))

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) => provisionPeople(table),
  })

const loggedIn = () =>
  Given("{string:name} is logged in", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (_, { name }) =>
      background().pipe(
        Effect.map((context) => ({ ...context, actorId: personNamed(context.actors, name) })),
      ),
  })

const visitor = () => Given("a visitor is browsing", { handler: () => background() })

const createPublication = () =>
  When("they create a {string:visibility} publication under their profile", {
    params: Schema.Struct({ visibility: ProfileVisibility }),
    handler: (context: MediaContext, { visibility }) =>
      Effect.gen(function* () {
        const personId = Option.getOrThrow(Option.fromNullishOr(context.actorId))

        const publication = yield* createPost({
          personId,
          ownerProfileId: personId,
          content: "Planting together",
          visibility,
        })

        return { ...context, publicationId: publication.id }
      }),
  })

const upload = (context: MediaContext) =>
  Effect.gen(function* () {
    const file = yield* Effect.tryPromise(() =>
      sharp({ create: { width: 8, height: 4, channels: 3, background: "green" } })
        .png()
        .toBuffer(),
    )

    return yield* asViewer(
      context,
      (yield* MediaAssetsService).upload({ file, contentType: "image/png", fileName: "plant.png" }),
    )
  })

const uploadPublication = () =>
  And("they upload media to the publication", {
    handler: (context: MediaContext) =>
      Effect.gen(function* () {
        const media = yield* upload(context)

        yield* asViewer(
          context,
          (yield* PublicationsService).attachMediaToPublication({
            publicationId: publicationIn(context),
            mediaIds: [media.id],
          }),
        )

        return { ...context, media }
      }),
  })

const readState = SqlClient.SqlClient.use((sql) =>
  Effect.all(
    {
      files: Effect.gen(function* () {
        const storage = yield* MediaAssetsStorage
        const path = yield* Path.Path

        const root = path.dirname(
          path.dirname(
            storage.filePath(MediaAssetId.make("00000000-0000-7000-8000-000000000001"), "original"),
          ),
        )

        return yield* (yield* FileSystem.FileSystem).readDirectory(root)
      }),
      media: sql`SELECT * FROM media_assets ORDER BY id`,
      publications: sql`SELECT * FROM publication_media_assets ORDER BY publication_id, media_asset_id`,
      attachments: sql`SELECT * FROM wiki_article_media_assets ORDER BY wiki_article_id, media_asset_id`,
    },
    { concurrency: 1 },
  ),
)

const deny = <A, E, R>(context: MediaContext, action: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const before = yield* readState
    const error = yield* action.pipe(Effect.flip)
    expect(yield* readState).toEqual(before)
    return { ...context, error }
  })

const accessDenied = () =>
  Then("access is denied", {
    handler: (context: MediaContext) =>
      Effect.sync(() => {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const deniedPublicationUpload = () =>
  When("they try to upload media to a publication", {
    handler: (context: MediaContext) =>
      Effect.gen(function* () {
        return yield* deny(context, upload(context))
      }),
  })

const attached = () =>
  And("the media is attached to the publication", {
    handler: (context: MediaContext) =>
      Effect.gen(function* () {
        expect(
          (yield* asViewer(
            context,
            (yield* PublicationsService).listPublicationMedia(publicationIn(context)),
          )).map((media) => media.id),
        ).toEqual([mediaIn(context).id])

        return context
      }),
  })

const publicationCreated = () =>
  Then("the publication is created in {string:name}'s profile", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (context: MediaContext, { name }) =>
      Effect.gen(function* () {
        expect(
          Option.getOrThrow(
            yield* (yield* PublicationsRepository).findPublicationRowById(publicationIn(context)),
          ).ownerProfileId,
        ).toBe(personNamed(context.actors, name))

        return context
      }),
  })

const checkVisibility = (context: MediaContext, visible: boolean) =>
  Effect.gen(function* () {
    const service = yield* MediaAssetsService
    const media = mediaIn(context)

    yield* Effect.forEach(
      [
        service.getRow(media.id).pipe(Effect.asVoid),
        service
          .getFile({ id: media.id, format: "original", variant: "original" })
          .pipe(Effect.asVoid),
        service.getFile({ id: media.id, format: "images", variant: "1280" }).pipe(Effect.asVoid),
      ],
      (action) =>
        Effect.gen(function* () {
          const result = yield* asViewer(context, action).pipe(Effect.result)
          expect(Result.isSuccess(result)).toBe(visible)
          Result.match(result, {
            onSuccess: () => {},
            onFailure: (error) => expect(error).toMatchObject({ _tag: "MediaNotFoundError" }),
          })
        }),
      { concurrency: 1 },
    )

    return context
  })

const visibilityStep = {
  params: Schema.Struct({
    table: Schema.Array(
      Schema.Struct({ viewer: Schema.String, visible: Schema.Literals(["yes", "no"]) }),
    ),
  }),
  handler: (
    context: MediaContext,
    { table }: { table: readonly { viewer: string; visible: "yes" | "no" }[] },
  ) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        table,
        ({ viewer, visible }) =>
          checkVisibility(
            {
              ...context,
              actorId: viewer === "visitors" ? undefined : personNamed(context.actors, viewer),
            },
            visible === "yes",
          ),
        { concurrency: 1 },
      )

      return context
    }),
}

const visibility = () => Then("the media should have the following visibility:", visibilityStep)
const sameVisibility = () =>
  Then("the same media should have the following visibility:", visibilityStep)

const promote = () =>
  When("{string:actor} promotes {string:target} to COMMUNITY", {
    params: Schema.Struct({ actor: Schema.String, target: Schema.String }),
    handler: (context: MediaContext, { actor, target }) =>
      withPerson(
        PeopleService.use((people) =>
          people.setAccessLevel(personNamed(context.actors, target), "COMMUNITY"),
        ),
        personNamed(context.actors, actor),
      ).pipe(Effect.as(context)),
  })

const createWikiArticles = (context: MediaContext, names: readonly string[]) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository

    const entries = yield* Effect.forEach(
      names,
      (name) =>
        Effect.gen(function* () {
          const id = yield* wiki
            .createWikiArticle(
              {
                createdById: context.administratorId,
                status: "PUBLISHED",
                wikiArticle: {
                  kind: "UNCATEGORIZED",
                  attributes: { suggestedKind: Option.none() },
                  translations: {
                    pt: {
                      commonNames: [
                        Schema.decodeSync(WikiArticleCommonNameInCrdtList)({
                          name: name,
                          id: "mediaplant01",
                        }),
                      ],
                      content: Option.some(textToRichTextDocument(name)),
                    },
                  },
                },
              },
              { enrichment: "skip" },
            )
            .pipe(Effect.provide(WorkflowEngine.layerMemory))

          return [name, id] as const
        }),
      { concurrency: 1 },
    )

    return { ...context, articles: Record.fromEntries(entries) }
  })

const uploadWikiMedia = (context: MediaContext, names: readonly string[]) =>
  Effect.gen(function* () {
    const media = yield* upload(context)
    const wiki = yield* WikiArticlesService

    yield* Effect.forEach(
      names,
      (name) =>
        asViewer(
          context,
          wiki.attachMediaToWikiArticle({
            wikiArticleId: articleIn(context, name),
            mediaAssetId: media.id,
          }),
        ),
      { concurrency: 1 },
    )

    return { ...context, media }
  })

const uploadedWikiMedia = (keyword: typeof Given, pattern: string) =>
  keyword(pattern, {
    params: Schema.Struct({ first: Schema.String, second: Schema.optional(Schema.String) }),
    handler: (context: MediaContext, { first, second }) =>
      uploadWikiMedia(context, second === undefined ? [first] : [first, second]),
  })

const wikiMediaVisible = ({
  keyword,
  pattern,
  visible = true,
}: {
  keyword: typeof Then
  pattern: string
  visible?: boolean
}) =>
  keyword(pattern, {
    params: Schema.Struct({ title: Schema.String }),
    handler: (context: MediaContext, { title }) =>
      Effect.gen(function* () {
        const page = yield* withSession(
          (yield* WikiArticlesService).getPage({
            kind: "UNCATEGORIZED",
            handle: Handle.make(title.toLowerCase()),
            language: "pt",
          }),
          VISITOR_SESSION,
        )

        expect(page.id).toBe(articleIn(context, title))
        expect(page.mediaAssets.some((asset) => asset.id === mediaIn(context).id)).toBe(visible)
        return context
      }),
  })

const visitorMediaAccess = (visible = true) =>
  And(visible ? "visitors can access the media" : "visitors cannot access the media", {
    handler: (context: MediaContext) =>
      checkVisibility({ ...context, actorId: undefined }, visible),
  })

const censorMedia = (denied = false) =>
  When(denied ? "{string:name} tries to censor the media" : "{string:name} censors the media", {
    params: Schema.Struct({ name: Schema.String }),
    handler: (context: MediaContext, { name }) =>
      Effect.gen(function* () {
        const action = withPerson(
          (yield* MediaAssetsService).moderate({
            id: mediaIn(context).id,
            moderationStatus: "CENSORED",
          }),
          personNamed(context.actors, name),
        )

        return denied ? yield* deny(context, action) : yield* action.pipe(Effect.as(context))
      }),
  })

await Effect.runPromise(
  describeFeature("./media-assets.feature", ({ Rule }) => {
    Rule(
      "Media uploaded inside publications inherits the publication visibility",
      ({ Background, Scenario }) => {
        Background({ layer: MediaFeatureTestLayer, steps: () => runSteps(givenPeople()) })

        const visibleScenarios = [
          "Public publication media is visible to the same audience as the publication",
          "Community publication media is visible to the same audience as the publication",
        ]

        visibleScenarios.forEach((title) => {
          Scenario(title, {
            layer: MediaFeatureTestLayer,
            steps: () =>
              runSteps(loggedIn(), createPublication(), uploadPublication(), visibility()),
          })
        })

        Scenario("Person awaiting access can upload media inside publications", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              loggedIn(),
              createPublication(),
              uploadPublication(),
              publicationCreated(),
              attached(),
              visibility(),
              promote(),
              sameVisibility(),
            ),
        })

        const deniedScenarios = [
          ["Blocked person cannot upload media inside publications", loggedIn],
          ["Visitors cannot upload media inside publications", visitor],
        ] as const

        deniedScenarios.forEach(([title, actor]) => {
          Scenario(title, {
            layer: MediaFeatureTestLayer,
            steps: () => runSteps(actor(), deniedPublicationUpload(), accessDenied()),
          })
        })
      },
    )

    Rule(
      "Uncensored wiki article media is public and can be moderated",
      ({ Background, Scenario }) => {
        Background({
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              givenPeople(),
              And("the wiki articles {string:first} and {string:second} exist", {
                params: Schema.Struct({ first: Schema.String, second: Schema.String }),
                handler: (context: MediaContext, { first, second }) =>
                  createWikiArticles(context, [first, second]),
              }),
            ),
        })

        Scenario("Member with community access attaches media to a wiki article", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              loggedIn(),
              uploadedWikiMedia(When, "they upload media attached to wiki article {string:first}"),
              wikiMediaVisible({
                keyword: Then,
                pattern: "the media is visible on wiki article {string:title}",
              }),
              visitorMediaAccess(),
            ),
        })

        Scenario(
          "Member with community access can attach the same media to multiple wiki articles",
          {
            layer: MediaFeatureTestLayer,
            steps: () =>
              runSteps(
                loggedIn(),
                uploadedWikiMedia(
                  When,
                  "they upload media attached to wiki articles {string:first} and {string:second}",
                ),
                wikiMediaVisible({
                  keyword: Then,
                  pattern: "the media is visible on wiki article {string:title}",
                }),
                wikiMediaVisible({
                  keyword: And,
                  pattern: "the media is visible on wiki article {string:title}",
                }),
              ),
          },
        )

        Scenario("Wiki article media is approved by default", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              loggedIn(),
              uploadedWikiMedia(When, "they upload media attached to wiki article {string:first}"),
              Then("the media is visible to everyone", {
                handler: (context: MediaContext) =>
                  Effect.gen(function* () {
                    const stored = Option.getOrThrow(
                      yield* (yield* MediaAssetsRepository).findMediaAssetById(mediaIn(context).id),
                    )
                    expect(stored.moderationStatus).toBe("APPROVED_BY_DEFAULT")

                    yield* Effect.forEach(
                      [undefined, context.administratorId, ...Record.values(context.actors)],
                      (actorId) => checkVisibility({ ...context, actorId }, true),
                      { concurrency: 1 },
                    )

                    return context
                  }),
              }),
            ),
        })

        Scenario("Moderator can censor wiki article media", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              loggedIn(),
              uploadedWikiMedia(
                And,
                "they have uploaded media attached to wiki article {string:first}",
              ),
              censorMedia(),
              Then("the media has moderation_status {string:status}", {
                params: Schema.Struct({ status: ModerationStatus }),
                handler: (context: MediaContext, { status }) =>
                  Effect.gen(function* () {
                    const stored = Option.getOrThrow(
                      yield* (yield* MediaAssetsRepository).findMediaAssetById(mediaIn(context).id),
                    )
                    expect(stored.moderationStatus).toBe(status)
                    return context
                  }),
              }),
              visitorMediaAccess(false),
              wikiMediaVisible({
                keyword: And,
                pattern: "the media is hidden on wiki article {string:title}",
                visible: false,
              }),
            ),
        })

        Scenario("Community member cannot censor wiki article media", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              Given("{string:name} has uploaded media attached to wiki article {string:title}", {
                params: Schema.Struct({ name: Schema.String, title: Schema.String }),
                handler: (context: MediaContext, { name, title }) =>
                  uploadWikiMedia({ ...context, actorId: personNamed(context.actors, name) }, [
                    title,
                  ]),
              }),
              censorMedia(true),
              accessDenied(),
              visitorMediaAccess(),
              wikiMediaVisible({
                keyword: And,
                pattern: "the media is visible on wiki article {string:title}",
              }),
            ),
        })

        Scenario("Censoring hides media everywhere it is attached", {
          layer: MediaFeatureTestLayer,
          steps: () =>
            runSteps(
              loggedIn(),
              uploadedWikiMedia(
                And,
                "they have uploaded media attached to wiki articles {string:first} and {string:second}",
              ),
              censorMedia(),
              wikiMediaVisible({
                keyword: Then,
                pattern: "the media is hidden on wiki article {string:title}",
                visible: false,
              }),
              wikiMediaVisible({
                keyword: And,
                pattern: "the media is hidden on wiki article {string:title}",
                visible: false,
              }),
            ),
        })

        const deniedWikiScenarios = [
          ["Person awaiting access cannot attach media to wiki articles", loggedIn],
          ["Blocked person cannot attach media to wiki articles", loggedIn],
          ["Visitors cannot attach media to wiki articles", visitor],
        ] as const

        deniedWikiScenarios.forEach(([title, actor]) => {
          Scenario(title, {
            layer: MediaFeatureTestLayer,
            steps: () =>
              runSteps(
                actor(),
                When("they try to upload media attached to wiki article {string:title}", {
                  params: Schema.Struct({ title: Schema.String }),
                  handler: (context: MediaContext, { title }) =>
                    Effect.gen(function* () {
                      // Upload authorization is independent of attachment authorization.
                      const media = yield* upload(context).pipe(
                        Effect.catchTag("UnauthorizedError", () =>
                          upload({ ...context, actorId: context.administratorId }),
                        ),
                      )

                      return yield* deny(
                        context,
                        asViewer(
                          context,
                          WikiArticlesService.use((wiki) =>
                            wiki.attachMediaToWikiArticle({
                              wikiArticleId: articleIn(context, title),
                              mediaAssetId: media.id,
                            }),
                          ),
                        ),
                      )
                    }),
                }),
                accessDenied(),
              ),
          })
        })
      },
    )
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect("only the uploader can attach media, even when another person owns the publication", () =>
  Effect.gen(function* () {
    const people = yield* provisionPeople([{ name: "Owner", accessLevel: "COMMUNITY" }])
    const ownerId = personNamed(people.actors, "Owner")

    const publication = yield* createPost({
      personId: ownerId,
      ownerProfileId: ownerId,
      content: "Owner's photo",
    })

    const context = { ...people, actorId: ownerId }
    const media = yield* upload({ ...people, actorId: people.administratorId })

    const denied = yield* deny(
      context,
      asViewer(
        context,
        (yield* PublicationsService).attachMediaToPublication({
          publicationId: publication.id,
          mediaIds: [media.id],
        }),
      ),
    )

    expect(denied.error).toMatchObject({ _tag: "UnauthorizedError" })
  }).pipe(Effect.provide(MediaFeatureTestLayer)),
)

it.effect(
  "a failed second wiki attachment rolls back attachments and retains the independent upload",
  () =>
    Effect.gen(function* () {
      const people = yield* provisionPeople([{ name: "Maria", accessLevel: "COMMUNITY" }])
      const context = yield* createWikiArticles(
        { ...people, actorId: personNamed(people.actors, "Maria") },
        ["Mandioca", "Banana"],
      )
      const media = yield* upload(context)
      const sql = yield* SqlClient.SqlClient
      const wiki = yield* WikiArticlesService
      const before = yield* readState
      yield* sql`CREATE TRIGGER reject_second_attachment BEFORE INSERT ON wiki_article_media_assets
      WHEN (SELECT count(*) FROM wiki_article_media_assets WHERE media_asset_id = NEW.media_asset_id) = 1
      BEGIN SELECT RAISE(FAIL, 'Rejected for test'); END`

      const result = yield* asViewer(
        context,
        Effect.forEach(
          ["Mandioca", "Banana"],
          (title) =>
            wiki.attachMediaToWikiArticle({
              wikiArticleId: articleIn(context, title),
              mediaAssetId: media.id,
            }),
          { concurrency: 1 },
        ).pipe(sql.withTransaction),
      ).pipe(Effect.flip)

      expect(result).toMatchObject({ _tag: "SqlError" })
      expect(yield* readState).toEqual(before)
      yield* checkVisibility({ ...context, media }, true)
      yield* checkVisibility({ ...context, media, actorId: undefined }, false)
    }).pipe(Effect.provide(MediaFeatureTestLayer)),
)

it.effect(
  "one upload can be attached to several publications and follows their current audiences",
  () =>
    Effect.gen(function* () {
      const people = yield* provisionPeople([{ name: "Uploader", accessLevel: "COMMUNITY" }])
      const personId = personNamed(people.actors, "Uploader")
      const context = { ...people, actorId: personId }
      const media = yield* upload(context)

      const privatePublication = yield* createPost({
        personId,
        ownerProfileId: personId,
        content: "Community media",
        visibility: "COMMUNITY",
      })

      const publicPublication = yield* createPost({
        personId,
        ownerProfileId: personId,
        content: "Public media",
        visibility: "PUBLIC",
      })

      const publications = yield* PublicationsService

      yield* asViewer(
        context,
        publications.attachMediaToPublication({
          publicationId: privatePublication.id,
          mediaIds: [media.id],
        }),
      )

      yield* checkVisibility({ ...context, media, actorId: undefined }, false)

      yield* asViewer(
        context,
        publications.attachMediaToPublication({
          publicationId: publicPublication.id,
          mediaIds: [media.id],
        }),
      )

      yield* checkVisibility({ ...context, media, actorId: undefined }, true)
      const sql = yield* SqlClient.SqlClient
      yield* sql`DELETE FROM publication_crdts WHERE id = ${publicPublication.id}`
      expect(
        Option.getOrThrow(yield* (yield* MediaAssetsRepository).findMediaAssetById(media.id)).id,
      ).toBe(media.id)
      yield* checkVisibility({ ...context, media, actorId: undefined }, false)
    }).pipe(Effect.provide(MediaFeatureTestLayer)),
)

const publicationEdit = (id: PublicationId, text: string) =>
  Effect.gen(function* () {
    const row = Option.getOrThrow(yield* findPublicationCrdtSnapshotById(id))
    const initial = snapshotToLoroDoc(row.crdtSnapshot)
    const next = initial.fork()

    yield* PublicationCrdt.applyEdit(next, {
      _tag: "SetPublicationSourceContent",

      content: textToRichTextDocument(text),
    })

    return {
      publicationId: id,
      expectedCurrentCrdtFrontier: LoroDocFrontier.make(initial.frontiers()),
      crdtUpdate: LoroDocUpdate.make(next.export({ from: initial.version(), mode: "update" })),
    }
  })

it.effect("publication creation and edits commit content and media together", () =>
  Effect.gen(function* () {
    const people = yield* provisionPeople([{ name: "Uploader", accessLevel: "COMMUNITY" }])
    const personId = personNamed(people.actors, "Uploader")
    const context = { ...people, actorId: personId }
    const media = yield* upload(context)
    const publications = yield* PublicationsService

    const input = {
      kind: "POST" as const,
      ownerProfileId: personId,
      content: textToRichTextDocument("Mango"),
      sourceLanguage: ContentLanguage.make("pt"),
      visibility: "PUBLIC" as const,
      mediaIds: [media.id],
    }

    const sql = yield* SqlClient.SqlClient

    const state = Effect.all(
      {
        crdts: sql`SELECT * FROM publication_crdts ORDER BY id`,
        commits: sql`SELECT * FROM publication_commits ORDER BY id`,
        projections: sql`SELECT * FROM publications ORDER BY id`,
        attachments: sql`SELECT * FROM publication_media_assets ORDER BY publication_id, media_asset_id`,
      },
      { concurrency: 1 },
    )

    const before = yield* state
    yield* sql`CREATE TRIGGER reject_publication_media BEFORE INSERT ON publication_media_assets BEGIN SELECT RAISE(FAIL, 'Rejected for test'); END`
    expect(
      yield* asViewer(context, publications.createPublication(input)).pipe(Effect.flip),
    ).toMatchObject({ _tag: "SqlError" })
    expect(yield* state).toEqual(before)
    yield* sql`DROP TRIGGER reject_publication_media`
    const publication = yield* asViewer(context, publications.createPublication(input))

    expect(
      (yield* asViewer(context, publications.listPublicationMedia(publication.id))).map(
        (row) => row.id,
      ),
    ).toEqual([media.id])

    const outsiderMedia = yield* upload({ ...people, actorId: people.administratorId })
    const edit = yield* publicationEdit(publication.id, "Coffee")
    const existing = yield* state

    expect(
      yield* asViewer(
        context,
        publications.updatePublication({ ...edit, mediaIds: [outsiderMedia.id] }),
      ).pipe(Effect.flip),
    ).toMatchObject({ _tag: "UnauthorizedError" })

    expect(yield* state).toEqual(existing)
    yield* asViewer(context, publications.updatePublication(edit))

    expect(
      (yield* asViewer(context, publications.listPublicationMedia(publication.id))).map(
        (row) => row.id,
      ),
    ).toEqual([media.id])

    yield* asViewer(
      context,
      publications.updatePublication({
        ...(yield* publicationEdit(publication.id, "Coffee without media")),
        mediaIds: [],
      }),
    )

    expect(yield* asViewer(context, publications.listPublicationMedia(publication.id))).toEqual([])
    expect(yield* asViewer(context, (yield* MediaAssetsService).getRow(media.id))).toEqual(media)
  }).pipe(Effect.provide(MediaFeatureTestLayer)),
)

it.effect("revision media references preserve selections and roll back invalid attachments", () =>
  Effect.gen(function* () {
    const people = yield* provisionPeople([{ name: "Uploader", accessLevel: "COMMUNITY" }])
    const createdById = personNamed(people.actors, "Uploader")
    const context = yield* createWikiArticles({ ...people, actorId: createdById }, ["Mandioca"])
    const wikiArticleId = articleIn(context, "Mandioca")
    const media = yield* upload(context)
    const repository = yield* WikiArticlesRepository
    const row = Option.getOrThrow(yield* findCrdtRowById(wikiArticleId))
    const document = snapshotToLoroDoc(row.crdtSnapshot)
    const edited = document.fork()
    yield* WikiArticleCrdt.applyEdit(edited, { _tag: "SetSuggestedKind", value: "Plant" })

    const input = {
      wikiArticleId,
      createdById,
      crdtUpdate: LoroDocUpdate.make(edited.export({ mode: "update", from: document.version() })),
    }

    const descriptions = { en: textToRichTextDocument("Shared photo") }
    const revisionId = yield* repository.createRevision({
      ...input,
      mediaAssets: [{ mediaAssetId: media.id, category: null, descriptions }],
    })

    expect(yield* listRevisionMediaAssets(revisionId)).toEqual([
      {
        wikiArticleRevisionId: revisionId,
        mediaAssetId: media.id,
        category: null,
        hasCategoryOverride: true,
        descriptions: Option.some(descriptions),
      },
    ])

    const unchanged = yield* repository.createRevision(input)
    const cleared = yield* repository.createRevision({ ...input, mediaAssets: [] })
    const retained = yield* repository.createRevision({
      ...input,
      mediaAssets: [{ mediaAssetId: media.id }],
    })
    expect(yield* listRevisionMediaAssets(retained)).toMatchObject([
      { category: null, hasCategoryOverride: false, descriptions: Option.none() },
    ])
    expect(Option.getOrThrow(yield* findRevisionById(unchanged)).hasMediaSelection).toBe(false)
    expect(Option.getOrThrow(yield* findRevisionById(cleared)).hasMediaSelection).toBe(true)
    expect(yield* listRevisionMediaAssets(cleared)).toEqual([])

    const sql = yield* SqlClient.SqlClient
    const before = yield* sql`SELECT id FROM wiki_article_revisions ORDER BY id`

    expect(
      yield* repository
        .createRevision({
          ...input,
          mediaAssets: [
            {
              mediaAssetId: Schema.decodeSync(MediaAssetId)("00000000-0000-7000-8000-000000000099"),
            },
          ],
        })
        .pipe(Effect.flip),
    ).toMatchObject({ _tag: "SqlError" })

    expect(yield* sql`SELECT id FROM wiki_article_revisions ORDER BY id`).toEqual(before)

    yield* sql`DELETE FROM wiki_article_revisions WHERE id = ${revisionId}`
    expect(yield* listRevisionMediaAssets(revisionId)).toEqual([])
    expect(
      Option.getOrThrow(yield* (yield* MediaAssetsRepository).findMediaAssetById(media.id)).id,
    ).toBe(media.id)
  }).pipe(Effect.provide(MediaFeatureTestLayer)),
)

const REVISION_CASES = [false, true] as const

REVISION_CASES.forEach((hasRevisions) => {
  it.effect(`account deletion removes wiki media and files with revisions=${hasRevisions}`, () =>
    Effect.gen(function* () {
      const people = yield* provisionPeople([{ name: "Uploader", accessLevel: "COMMUNITY" }])
      const personId = personNamed(people.actors, "Uploader")
      const context = yield* createWikiArticles({ ...people, actorId: personId }, ["Mandioca"])
      const wikiArticleId = articleIn(context, "Mandioca")
      const media = yield* upload(context)
      const wiki = yield* WikiArticlesRepository
      yield* wiki.attachMediaToWikiArticle({ wikiArticleId, mediaAssetId: media.id })
      yield* wiki.setMainMedia({ wikiArticleId, mediaAssetId: media.id })
      let revisionId

      if (hasRevisions) {
        const original = Option.getOrThrow(yield* findCrdtRowById(wikiArticleId))
        const document = snapshotToLoroDoc(original.crdtSnapshot)
        const edited = document.fork()
        yield* WikiArticleCrdt.applyEdit(edited, { _tag: "SetSuggestedKind", value: "Plant" })

        revisionId = yield* wiki.createRevision({
          wikiArticleId,
          createdById: personId,
          crdtUpdate: LoroDocUpdate.make(
            edited.export({ mode: "update", from: document.version() }),
          ),
          mediaAssets: [{ mediaAssetId: media.id }],
        })
      }

      const sql = yield* SqlClient.SqlClient
      const before = yield* findCrdtRowById(wikiArticleId)
      const files = yield* MediaAssetsStorage
      const filesystem = yield* FileSystem.FileSystem
      expect(yield* filesystem.exists(files.filePath(media.id, "original"))).toBe(true)

      expect(
        yield* withPerson(
          (yield* PeopleService).deleteCurrentPerson({
            shouldDeleteContent: true,
            shouldDeleteOrgs: false,
          }),
          personId,
        ),
      ).toEqual({ _tag: "Success" })

      yield* MediaDeletionWorkflow.execute({ mediaAssetIds: [media.id] })

      expect(yield* filesystem.exists(files.filePath(media.id, "original"))).toBe(false)
      expect(yield* sql`SELECT * FROM media_assets WHERE id = ${media.id}`).toEqual([])
      expect(
        yield* sql`SELECT * FROM wiki_article_media_assets WHERE media_asset_id = ${media.id}`,
      ).toEqual([])
      expect(
        yield* sql`SELECT * FROM wiki_article_main_media WHERE wiki_article_id = ${wikiArticleId}`,
      ).toEqual([])
      expect(yield* findCrdtRowById(wikiArticleId)).toEqual(before)
      const revision =
        revisionId === undefined
          ? undefined
          : Option.getOrThrow(yield* findRevisionById(revisionId))
      expect(revision?.createdById).toBe(hasRevisions ? null : undefined)
      expect(
        revisionId === undefined ? undefined : yield* listRevisionMediaAssets(revisionId),
      ).toEqual(hasRevisions ? [] : undefined)
      expect(yield* sql`PRAGMA foreign_key_check`).toEqual([])
    }).pipe(Effect.provide(MediaFeatureTestLayer)),
  )
})

it.effect("media deletion workflow retries failed removals and memoizes successful ones", () =>
  Effect.gen(function* () {
    const mediaAssetId = MediaAssetId.make("00000000-0000-7000-8000-000000000123")
    const failed = yield* Deferred.make<void>()
    let attempts = 0
    const removed: MediaAssetId[] = []

    const files = MediaAssetsStorage.of({
      root: "unused-root",
      stage: () => Effect.die("unused staging"),
      publish: () => Effect.void,
      filePath: (id, name) => `${id}/${name}`,
      remove: (id) =>
        Effect.gen(function* () {
          attempts += 1
          if (attempts === 1) {
            yield* Deferred.succeed(failed, undefined)
            return yield* new MediaAssetStorageError({ cause: "temporary file removal failure" })
          }
          removed.push(id)
        }),
    })

    const workflow = MediaDeletionWorkflowLayer.pipe(
      Layer.provide(Layer.succeed(MediaAssetsStorage, files)),
      Layer.provideMerge(WorkflowEngine.layerMemory),
    )

    yield* Effect.gen(function* () {
      const payload = { mediaAssetIds: [mediaAssetId] }
      const executionId = yield* MediaDeletionWorkflow.execute(payload, { discard: true })
      yield* Deferred.await(failed)
      const poll = MediaDeletionWorkflow.poll(executionId).pipe(Effect.tap(() => Effect.yieldNow))

      yield* poll.pipe(
        Effect.repeat({
          until: (result) => Option.exists(result, (value) => value instanceof Workflow.Suspended),
        }),
      )

      yield* TestClock.adjust("1 minute")

      yield* poll.pipe(
        Effect.repeat({
          until: (result) => Option.exists(result, (value) => value instanceof Workflow.Complete),
        }),
      )

      expect(attempts).toBe(2)
      expect(removed).toEqual([mediaAssetId])
      yield* MediaDeletionWorkflow.execute(payload)
      expect(attempts).toBe(2)
    }).pipe(Effect.provide(workflow))
  }),
)
