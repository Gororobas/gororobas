import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ContentLanguage } from "@gororobas/domain"
import {
  PublicationCrdt,
  WikiArticleCrdt,
  LoroDocFrontier,
  LoroDocUpdate,
  snapshotToLoroDoc,
  MediaAssetRow,
  MediaAssetId,
  NameInCrdtList,
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
import { WorkflowEngine } from "effect/workflow"
import sharp from "sharp"

import { MediaAssetsRepository } from "../src/media-assets/repository.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { MediaAssetsStorage } from "../src/media-assets/storage.js"
import { PeopleService } from "../src/people/service.js"
import { findPublicationCrdtSnapshotById } from "../src/publications/queries.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { findCrdtRowById, findRevisionById, listRevisionMediaAssets } from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
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

const MediaFeatureTestLayer = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
  Layer.provideMerge(
    Layer.mergeAll(storage, Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
  ),
  Layer.provideMerge(PeopleFeatureTestLayer),
  Layer.provideMerge(NodeServices.layer),
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
                        Schema.decodeSync(NameInCrdtList)({ value: name, id: "mediaplant01" }),
                      ],
                      content: Option.some(textToRichTextDocument(name)),
                      grammaticalGender: Option.none(),
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

// oxlint-disable vitest/warn-todo -- Pending the wiki attachment service.
it.todo("Wiki article media is approved by default")
it.todo("Person awaiting access cannot attach media to wiki articles")
it.todo("Blocked person cannot attach media to wiki articles")
it.todo("Visitors cannot attach media to wiki articles")
it.todo("a failed second wiki attachment rolls back attachments and retains the independent upload")

// oxlint-enable vitest/warn-todo

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
