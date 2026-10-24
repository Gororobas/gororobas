import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  AuthenticationApi,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
  AuthSubjectId,
  ContentLanguage,
  Email,
  Handle,
  IdGen,
  MediaAssetId,
  PostSourceData,
  ProfileId,
  PublicationId,
  WikiArticleId,
  WikiPlantArticle,
} from "@gororobas/domain"
import { ApiLive } from "@gororobas/server/api-live"
import { makeAuthentication } from "@gororobas/server/authentication/app-auth"
import { authenticationLayer } from "@gororobas/server/authentication/authentication-live"
import { IdGenLive } from "@gororobas/server/id-gen-live"
import { makeAppSql } from "@gororobas/server/sql"
import { Auth, Proofs } from "@yielded/auth"
import {
  ConfigProvider,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Record,
  Schema,
  Schedule,
} from "effect"
import { HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import {
  authenticationTestBindingKey,
  authenticationTestProofKey,
  authenticationTestOrigin,
  captureEmailDelivery,
  makeAuthenticationTestBrowser,
  parseDeliveredCode,
} from "../../../apps/server/test/authentication-helpers.js"
import { ingestApplication } from "./ingest-application.js"
import { angieGelProfileId, fallbackGelProfileId, fredGelProfileId } from "./ingestion-policy.js"
import { PreviewRecord, previewCollections } from "./preview-exports.js"
import { UserDataForMigration } from "./schemas/gel/entities.js"
import { gelVegetableNamesToCrdtList } from "./vegetables/gel-vegetable-to-wiki-plant-article.js"
import { buildWikiMigrationHistory, WikiMigrationVersion } from "./wiki-migration-history.js"

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fs.makeTempDirectoryScoped()

  yield* Effect.forEach(
    [...Record.values(previewCollections), "references", "raw-gel", "media-cache"],
    (folder) => fs.makeDirectory(path.join(directory, folder)),
    { concurrency: 1 },
  )

  yield* fs.writeFileString(path.join(directory, "references/index.json"), "[]")
  const now = yield* DateTime.now
  const date = DateTime.toDateUtc(now)

  const identities = [
    fallbackGelProfileId,
    angieGelProfileId,
    fredGelProfileId,
    "excluded-source-profile",
  ]

  const users = yield* Effect.forEach(
    identities,
    (legacyId, index) =>
      Effect.gen(function* () {
        const id = yield* IdGen.make(ProfileId)
        const handle = Schema.decodeSync(Handle)(`person-${index}`)
        const name = `Person ${index}`
        const email = index < 2 ? Schema.decodeSync(Email)(`person-${index}@example.com`) : null

        const source = {
          id: `source-user-${index}`,
          identity: { id: `identity-${index}`, issuer: "legacy", subject: `subject-${index}` },
          email,
          created: date,
          updated: date,
          is_email_verified: true,
          profile: {
            id: legacyId,
            name,
            handle,
            bookmarks_count: 2,
            edit_suggestions_count: 1,
            notes_count: 1,
            images_count: 1,
          },
        }

        const user = UserDataForMigration.make({
          latest_source: source,
          account: {
            id: AuthSubjectId.make(id),
            name,
            email,
            is_email_verified: true,
            image: null,
            created_at: date,
            updated_at: date,
          },
          profile: {
            id,
            name,
            handle,
            type: "PERSON",
            visibility: "PUBLIC",
            bio: null,
            location: null,
            photo_gel_id: null,
            created_at: date,
            updated_at: date,
          },
          person: { access_level: "COMMUNITY", access_set_by_gel_id: null, access_set_at: null },
        })

        yield* fs.writeFileString(
          path.join(directory, "users", `${handle}.json`),
          yield* Schema.encodeEffect(Schema.fromJsonString(UserDataForMigration))(user),
        )
        return user
      }),
    { concurrency: 1 },
  )

  yield* fs.writeFileString(
    path.join(directory, "raw-gel/users.json"),
    Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(
      users.map((user) => user.latest_source),
    ),
  )

  const imageId = yield* IdGen.make(MediaAssetId)
  const sanityId = `image-${"a".repeat(40)}-2x2-svg`
  yield* fs.writeFileString(
    path.join(directory, "media-cache", sanityId),
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="green"/></svg>',
  )
  const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

  yield* fs.writeFileString(
    path.join(directory, "images/image.json"),
    json({
      id: imageId,
      latest_source: {
        sanity_id: sanityId,
        label: null,
        sources: [],
        created_by: { id: fredGelProfileId },
      },
    }),
  )

  const articleId = yield* IdGen.make(WikiArticleId)

  const article = WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        commonNames: gelVegetableNamesToCrdtList(["Buganvilia"]),
        origin: Option.none(),
        content: Option.none(),
      },
    },
  })

  const versions = yield* buildWikiMigrationHistory([
    {
      article,
      sourceEditId: null,
      actorId: null,
      reviewerId: null,
      timestamp: DateTime.formatIso(now),
    },
  ])

  yield* fs.writeFileString(
    path.join(directory, "vegetables/buganvilia.json"),
    yield* Schema.encodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          id: WikiArticleId,
          versions: Schema.Array(WikiMigrationVersion),
          latest_source: Schema.Unknown,
          photoIds: Schema.Array(MediaAssetId),
        }),
      ),
    )({
      id: articleId,
      versions,
      latest_source: { id: "source-plant", handle: "buganvilia" },
      photoIds: [imageId],
    }),
  )

  yield* fs.writeFileString(
    path.join(directory, "bookmarks.json"),
    json([
      {
        sourceId: "bookmark-fred",
        personId: users[2].profile.id,
        wikiArticleId: articleId,
        state: "ACTIVE",
      },
      {
        sourceId: "bookmark-excluded",
        personId: users[3].profile.id,
        wikiArticleId: articleId,
        state: "INTERESTED",
      },
    ]),
  )

  const publications = yield* Effect.forEach(
    ["PUBLIC", "COMMUNITY", "PUBLIC"] as const,
    (visibility, index) =>
      Effect.gen(function* () {
        const owner = users[index === 2 ? 3 : 0]
        const id = yield* IdGen.make(PublicationId)
        const handle = Schema.decodeSync(Handle)(`post-${index}`)

        const content = {
          type: "doc" as const,
          version: 1 as const,
          content: [
            {
              type: "paragraph" as const,
              content: [{ type: "text" as const, text: `Migrated ${visibility} post` }],
            },
          ],
        }

        const sourceData = PostSourceData.make({
          metadata: {
            kind: "POST",
            ownerProfileId: ProfileId.make(owner.profile.id ?? ""),
            handle,
            publishedAt: now,
            visibility,
          },
          sourceContent: content,
          sourceLanguage: ContentLanguage.make("pt"),
          translations: { pt: "original" },
        })

        yield* fs.writeFileString(
          path.join(directory, "notes", `${handle}.json`),
          json({
            id,
            wikiArticleIds: [articleId],
            latest_source: {
              id: `source-note-${index}`,
              created_at: date,
              updated_at: date,
              published_at: date,
              public: visibility === "PUBLIC",
              publish_status: visibility,
              types: [],
              title: content,
              handle,
              created_by: {
                id: owner.latest_source.profile.id,
                handle: owner.profile.handle,
                name: owner.profile.name,
              },
              related_to_vegetables: [],
              related_to_notes: [],
            },
            publication: yield* Schema.encodeEffect(PostSourceData)(sourceData),
            conversion_error: null,
          }),
        )

        return id
      }),
    { concurrency: 1 },
  )

  const configuration = Layer.succeed(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromUnknown({
      APP_DB_FILENAME: path.join(directory, "application.db"),
      MEDIA_ASSETS_DIRECTORY: path.join(directory, "media"),
      MIGRATION_MEDIA_CACHE_DIRECTORY: path.join(directory, "media-cache"),
    }),
  )

  return { fs, path, directory, configuration, users, imageId, articleId, publications }
})

it.live(
  "ingests cached media and bookmarks, preserves overrides, and reads imported data with real magic-link authentication",
  () =>
    Effect.gen(function* () {
      const data = yield* fixture
      const report = yield* ingestApplication(data.directory).pipe(
        Effect.provide(data.configuration),
      )
      expect(report.counts.users).toBe(3)
      expect(report.counts.notes).toBe(2)
      expect(report.bookmarks).toBe(1)
      expect(report.media).toEqual({ downloaded: 0, prepared: 1, total: 1 })
      const rerun = yield* ingestApplication(data.directory).pipe(
        Effect.provide(data.configuration),
      )
      expect(rerun.media).toEqual({ downloaded: 0, prepared: 0, total: 1 })
      expect(rerun.backup).toBeDefined()
      const { deliveries, layer: deliveryLayer } = captureEmailDelivery()

      const dependencies = Layer.mergeAll(
        makeAppSql(report.database),
        IdGenLive,
        NodeServices.layer,
        NodeHttpServer.layerHttpServices,
        WorkflowEngine.layerMemory,
      )

      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          HttpRouter.toWebHandler(
            ApiLive.pipe(
              makeAuthentication(authenticationTestOrigin, "test").http.middleware,
              Layer.provide(
                authenticationLayer({
                  origin: authenticationTestOrigin,
                  environment: "test",
                  requestBindingKey: authenticationTestBindingKey,
                  proofKey: authenticationTestProofKey,
                }).pipe(Layer.provide(deliveryLayer)),
              ),
              HttpRouter.provideRequest(dependencies),
              Layer.provideMerge(dependencies),
              Layer.provide(data.configuration),
            ),
            { disableLogger: true },
          ),
        ),
        (app) => Effect.tryPromise(() => app.dispose()).pipe(Effect.orDie),
      )

      const guest = Context.make(Auth.AuthRequest, {
        invocation: { _tag: "Guest" },
        credentials: {},
        credentialCommandSink: () => Effect.void,
      })

      const requestContext = Context.add(
        guest,
        Proofs.ProofRequestContext,
        Effect.succeed({ networkKey: Redacted.make("127.0.0.1") }),
      )

      const browser = makeAuthenticationTestBrowser((request) =>
        app.handler(request, requestContext),
      )
      const publicList = yield* browser.fetchRoute({
        path: "/publications?pageSize=10&currentPage=0",
      })
      expect(publicList.status).toBe(200)
      expect(yield* Effect.tryPromise(() => publicList.json())).toMatchObject([
        { id: data.publications[0] },
      ])
      expect(
        (yield* browser.fetchRoute({ path: `/publications/${data.publications[1]}` })).status,
      ).toBe(403)
      expect(
        (yield* browser.fetchRoute({ path: `/publications/${data.publications[1]}/history` }))
          .status,
      ).toBe(403)
      expect((yield* browser.fetchRoute({ path: "/wiki/bookmarks" })).status).toBe(403)
      const media = yield* browser.fetchRoute({ path: `/media/${data.imageId}/original/original` })
      expect(media.status).toBe(200)
      expect(media.headers.get("content-security-policy")).toContain("sandbox")
      expect(
        (yield* browser.fetchRoute({ path: `/media/${data.imageId}/images/1280` })).status,
      ).toBe(200)

      const signIn = {
        flowId: "migrated-fred",
        email: "fred@gororobas.com",
        returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
      }

      yield* browser.call(AuthenticationApi.actions.beginEmailSignIn, { flowId: signIn.flowId })

      const receipt = yield* browser.call(AuthenticationApi.actions.requestEmailCode, {
        ...signIn,
        requestId: "migrated-fred-request",
        locale: "pt",
      })

      yield* Effect.sync(() => deliveries.length).pipe(
        Effect.repeat({ until: (count) => count === 1, schedule: Schedule.spaced("10 millis") }),
        Effect.timeout("5 seconds"),
      )
      const { code } = parseDeliveredCode(deliveries[0])

      yield* browser.call(AuthenticationApi.actions.completeEmailSignIn, {
        ...signIn,
        reference: receipt.reference,
        secret: code,
      })

      const bookmarks = yield* browser.fetchRoute({ path: "/wiki/bookmarks" })
      expect(bookmarks.status).toBe(200)
      expect(yield* Effect.tryPromise(() => bookmarks.json())).toEqual([
        { wikiArticleId: data.articleId, state: "ACTIVE" },
      ])
      expect(
        (yield* browser.fetchRoute({ path: `/publications/${data.publications[1]}` })).status,
      ).toBe(200)

      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        expect(yield* sql`SELECT created_by_id FROM wiki_article_revisions`).toEqual([
          { createdById: data.users[1].profile.id },
        ])
        expect(yield* sql`SELECT owner_profile_id FROM media_assets`).toEqual([
          { ownerProfileId: data.users[2].profile.id },
        ])
        expect(yield* sql`PRAGMA foreign_key_check`).toEqual([])
      }).pipe(Effect.provide(makeAppSql(report.database)))
    }).pipe(Effect.scoped, Effect.provide(IdGenLive), Effect.provide(NodeServices.layer)),
  { timeout: 30000 },
)

it.live("rejects unresolved edit authors without replacing the application database", () =>
  Effect.gen(function* () {
    const data = yield* fixture
    const report = yield* ingestApplication(data.directory).pipe(Effect.provide(data.configuration))
    const originalDatabase = yield* data.fs.readFile(report.database)
    const filename = data.path.join(data.directory, "vegetables/buganvilia.json")
    const record = yield* data.fs
      .readFileString(filename)
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(PreviewRecord))))
    const versions = yield* Schema.decodeEffect(
      Schema.toCodecJson(Schema.Array(WikiMigrationVersion)),
    )(record.versions)
    const unknownAuthor = yield* IdGen.make(ProfileId)
    const history = yield* buildWikiMigrationHistory([
      ...versions,
      { ...versions[0], sourceEditId: "unresolved-edit", actorId: unknownAuthor },
    ])
    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(WikiMigrationVersion)),
    )(history).pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))))
    yield* data.fs.writeFileString(
      filename,
      Schema.encodeSync(Schema.fromJsonString(PreviewRecord))({ ...record, versions: encoded }),
    )

    expect(
      yield* ingestApplication(data.directory).pipe(
        Effect.provide(data.configuration),
        Effect.flip,
      ),
    ).toMatchObject({ _tag: "IngestionError", message: expect.stringContaining("unresolved-edit") })

    expect(yield* data.fs.readFile(report.database)).toEqual(originalDatabase)
  }).pipe(Effect.scoped, Effect.provide(IdGenLive), Effect.provide(NodeServices.layer)),
)
