import { NodePath, NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  ApiPublicationData,
  ApiUpdatePublicationData,
  PublicationCrdt,
  LoroDocUpdate,
  snapshotToLoroDoc,
  CurrentAuthenticationData,
  AuthenticationSession,
  GororobasApi,
  MediaAssetId,
} from "@gororobas/domain"
import { Auth } from "@yielded/auth"
import {
  FileSystem,
  ConfigProvider,
  Context,
  Effect,
  DateTime,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  Path,
} from "effect"
import { Etag, HttpPlatform, HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import { SqlClient } from "effect/sql"
import sharp from "sharp"

import { AppAuth } from "../src/authentication/app-auth.js"
import {
  authenticationLayer,
  ApiAuthenticationLive,
} from "../src/authentication/authentication-live.js"
import { IdGenLive } from "../src/id-gen-live.js"
import { MediaAssetsApiLive } from "../src/media-assets/api-live.js"
import { MediaAssetsRepository } from "../src/media-assets/repository.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { MediaAssetsStorage } from "../src/media-assets/storage.js"
import { PublicationsApiLive } from "../src/publications/api-live.js"
import { findPublicationCrdtSnapshotById } from "../src/publications/queries.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { makeAppSql } from "../src/sql.js"
import {
  authenticationTestOrigin,
  authenticationTestBindingKey,
  captureEmailDelivery,
} from "./authentication-helpers.js"
import { textToRichTextDocument } from "./feature-test-helpers.js"
const { join } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

it.live(
  "streams multipart uploads and serves validated variants, ranges and censorship through HTTP",
  Effect.fn(function* () {
    const filesystem = yield* Effect.provide(FileSystem.FileSystem, NodeServices.layer)
    const directory = yield* filesystem.makeTempDirectoryScoped({
      prefix: "mediaAssets-api-",
    })
    const root = join(directory, "assets")
    const databaseRuntime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(makeAppSql(join(directory, "preview.sqlite")))),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )
    const databaseRuntimeContext = yield* databaseRuntime.contextEffect
    const database = Layer.succeedContext(databaseRuntimeContext)
    const personId = "00000000-0000-7000-8000-000000000001"
    const timestamp = "2026-10-03T00:00:00Z"

    let authentication = Schema.decodeSync(CurrentAuthenticationData)({
      account: {
        id: personId,
        name: "Reviewer",
        email: "reviewer@example.invalid",
        isEmailVerified: true,
        image: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      session: {
        sessionId: "media-assets-test-session",
        subjectId: personId,
        securityRevision: "media-assets-test-revision",
        assurance: {
          method: "magic-link",
          factors: ["possession"],
          authenticatedAt: DateTime.toEpochMillis(DateTime.makeUnsafe(timestamp)),
        },
        issuedAt: DateTime.toEpochMillis(DateTime.makeUnsafe(timestamp)),
        expiresAt: DateTime.toEpochMillis(DateTime.makeUnsafe("2027-01-01T00:00:00Z")),
        absoluteExpiresAt: DateTime.toEpochMillis(DateTime.makeUnsafe("2027-01-01T00:00:00Z")),
        claims: {
          authSubjectId: personId,
        },
      },
    })

    const services = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
      Layer.provideMerge(Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
      Layer.provideMerge(
        Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make).pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(
            Layer.succeed(
              ConfigProvider.ConfigProvider,
              ConfigProvider.fromUnknown({
                MEDIA_ASSETS_DIRECTORY: root,
              }),
            ),
          ),
        ),
      ),
      Layer.provideMerge(
        Layer.effect(PublicationsService, PublicationsService.make).pipe(
          Layer.provideMerge(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
        ),
      ),
      Layer.provideMerge(HttpPlatform.layer),
      Layer.provideMerge(Layer.mergeAll(database, IdGenLive, NodeServices.layer, Etag.layer)),
    )

    const api = HttpApi.make("GororobasApi").add(
      GororobasApi.groups.mediaAssets,
      GororobasApi.groups.publications,
    )

    const authenticationServices = Layer.effect(
      AppAuth,
      Effect.gen(function* () {
        const api = yield* AppAuth

        return {
          ...api,
          getSession: () =>
            Effect.sync(() => (authentication === null ? null : authentication.session)),
        }
      }),
    ).pipe(
      Layer.provide(
        authenticationLayer({
          origin: authenticationTestOrigin,
          requestBindingKey: authenticationTestBindingKey,
        }).pipe(Layer.provide(captureEmailDelivery().layer), Layer.provide(services)),
      ),
    )

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          HttpApiBuilder.layer(api).pipe(
            Layer.provide([MediaAssetsApiLive, PublicationsApiLive]),
            Layer.provide(
              Layer.fresh(ApiAuthenticationLive).pipe(Layer.provide(authenticationServices)),
            ),
            Layer.provideMerge(services),
          ),
          {
            disableLogger: true,
          },
        ),
      ),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )

    const request = (path: string, init?: RequestInit) =>
      Effect.tryPromise(() =>
        app.handler(
          new Request(`http://localhost${path}`, init),
          Context.make(Auth.AuthRequest, {
            invocation: {
              _tag: "Guest",
            },
            credentials: {},
            credentialCommandSink: () => Effect.void,
          }),
        ),
      )

    yield* SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        yield* sql`INSERT INTO auth_subjects (id, name, email, is_email_verified, security_revision, created_at, updated_at) VALUES (${personId}, 'Reviewer', 'reviewer@example.invalid', 1, ${personId}, ${timestamp}, ${timestamp})`
        yield* sql`INSERT INTO profiles (id, type, handle, name, visibility, created_at, updated_at) VALUES (${personId}, 'PERSON', 'reviewer', 'Reviewer', 'PUBLIC', ${timestamp}, ${timestamp})`
        yield* sql`INSERT INTO people (id, access_level) VALUES (${personId}, 'ADMIN')`
      }),
    ).pipe(Effect.provide(database))

    const png = yield* Effect.tryPromise(() =>
      sharp({
        create: {
          width: 80,
          height: 40,
          channels: 3,
          background: "green",
        },
      })
        .png()
        .toBuffer(),
    )

    const file = new Uint8Array(12 * 1024 * 1024)
    file.set(png)
    const body = new FormData()

    body.append(
      "file",
      new Blob([file], {
        type: "image/png",
      }),
      "plant.png",
    )

    const uploaded = yield* request("/media/upload", {
      method: "POST",
      body,
    })
    expect(uploaded.status).toBe(200)

    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
    const media = Schema.decodeUnknownSync(
      Schema.Struct({
        id: Schema.String,
        url: Schema.String,
        byteSize: Schema.Number,
      }),
    )(yield* Effect.tryPromise(() => uploaded.json()))

    expect(media.byteSize).toBe(file.length)
    expect(new Uint8Array(yield* filesystem.readFile(join(root, media.id, "original")))).toEqual(
      new Uint8Array(file),
    )
    const image = yield* request(media.url)
    expect(image.headers.get("content-type")).toBe("image/avif")

    expect(
      yield* Effect.gen(function* () {
        const response6 = yield* Effect.tryPromise(() => image.arrayBuffer())
        return yield* Effect.tryPromise(() => sharp(Buffer.from(response6)).metadata())
      }),
    ).toMatchObject({
      format: "heif",
      width: 80,
    })

    yield* Effect.forEach(
      [
        ["bytes=2-6", 2, 6],
        ["bytes=-4", file.length - 4, file.length - 1],
        [`bytes=${file.length - 2}-`, file.length - 2, file.length - 1],
      ] as const,
      Effect.fn(function* ([range, start, end]) {
        const response = yield* request(`/media/${media.id}/original/original`, {
          headers: {
            range,
          },
        })

        expect(response.status).toBe(206)
        expect(response.headers.get("content-type")).toBe("image/png")
        expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/${file.length}`)
        expect(response.headers.get("content-length")).toBe(String(end - start + 1))
        expect(new Uint8Array(yield* Effect.tryPromise(() => response.arrayBuffer()))).toEqual(
          file.slice(start, end + 1),
        )
      }),
      { concurrency: 1, discard: true },
    )

    const head = yield* request(`/media/${media.id}/original/original`, {
      method: "HEAD",
    })
    expect(head.headers.get("content-length")).toBe(String(file.length))
    expect((yield* Effect.tryPromise(() => head.arrayBuffer())).byteLength).toBe(0)

    const staleRange = yield* request(`/media/${media.id}/original/original`, {
      headers: {
        range: "bytes=0-1",
        "if-range": "different-etag",
      },
    })

    expect(staleRange.status).toBe(200)
    expect(Buffer.from(yield* Effect.tryPromise(() => staleRange.arrayBuffer())).equals(file)).toBe(
      true,
    )

    expect(
      (yield* request(`/media/${media.id}/original/original`, {
        headers: {
          range: "bytes=-0",
        },
      })).status,
    ).toBe(416)

    expect((yield* request(`/media/${media.id}/images/51`)).status).toBe(400)
    expect((yield* request(`/media/${media.id}/audio/audio.m4a`)).status).toBe(404)

    // A playlist's relative segment URL must resolve through the same endpoint.
    yield* SqlClient.SqlClient.use(
      (sql) =>
        sql`UPDATE media_assets SET format = 'VIDEO', metadata = ${JSON.stringify({
          format: "VIDEO",
          originalWidth: 80,
          originalHeight: 40,
          duration: 1000,
        })} WHERE id = ${media.id}`,
    ).pipe(Effect.provide(database))

    yield* filesystem.writeFileString(
      join(root, media.id, "master.m3u8"),
      "#EXTM3U\nsegment-0.ts\n",
    )
    yield* filesystem.writeFile(join(root, media.id, "segment-0.ts"), new Uint8Array([1, 2, 3]))
    const playlistUrl = `/media/${media.id}/video/master.m3u8`
    const playlist = yield* request(playlistUrl)
    expect(playlist.headers.get("content-type")).toBe("application/vnd.apple.mpegurl")
    expect(yield* Effect.tryPromise(() => playlist.text())).toContain("segment-0.ts")

    expect(
      new Uint8Array(
        yield* Effect.gen(function* () {
          const response7 = yield* request(
            new URL("segment-0.ts", `http://localhost${playlistUrl}`).pathname,
          )
          return yield* Effect.tryPromise(() => response7.arrayBuffer())
        }),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]))

    const duplicate = new FormData()

    duplicate.append(
      "file",
      new Blob([png], {
        type: "image/png",
      }),
      "one.png",
    )

    duplicate.append(
      "file",
      new Blob([png], {
        type: "image/png",
      }),
      "two.png",
    )

    expect(
      (yield* request("/media/upload", {
        method: "POST",
        body: duplicate,
      })).status,
    ).toBe(413)

    const missing = new FormData()
    missing.append("other", "value")

    expect(
      (yield* request("/media/upload", {
        method: "POST",
        body: missing,
      })).status,
    ).toBe(400)

    const privateBody = new FormData()
    privateBody.append("file", new Blob([png], { type: "image/png" }), "community.png")
    const privateUpload = yield* request("/media/upload", { method: "POST", body: privateBody })
    expect(privateUpload.status).toBe(200)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Validate the JSON received from the HTTP boundary.
    const privateMedia = Schema.decodeUnknownSync(
      Schema.Struct({ id: MediaAssetId, url: Schema.String }),
    )(yield* Effect.tryPromise(() => privateUpload.json()))

    const privatePublicationResponse = yield* request(`/profiles/${personId}/publications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "POST",
        content: textToRichTextDocument("Community media"),
        handle: "community-media",
        visibility: "COMMUNITY",
        mediaIds: [privateMedia.id],
      }),
    })

    expect(privatePublicationResponse.status).toBe(200)
    expect((yield* request(privateMedia.url)).status).toBe(200)

    const publicPublicationResponse = yield* request(`/profiles/${personId}/publications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "POST",
        content: textToRichTextDocument("Public media"),
        handle: "public-media",
        visibility: "PUBLIC",
        mediaIds: [media.id],
      }),
    })

    expect(publicPublicationResponse.status).toBe(200)

    const eventResponse = yield* request(`/profiles/${personId}/publications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "EVENT",
        content: textToRichTextDocument("Community gathering"),
        handle: "community-gathering",
        visibility: "PUBLIC",
        startDate: "2026-10-09T12:00:00Z",
      }),
    })

    expect(eventResponse.status).toBe(200)

    yield* Effect.forEach(
      [publicPublicationResponse, eventResponse],
      Effect.fn(function* (response) {
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Validate the JSON received from the HTTP boundary.
        const publication = Schema.decodeUnknownSync(ApiPublicationData)(
          yield* Effect.tryPromise(() => response.json()),
        )
        const snapshot = Option.getOrThrow(
          yield* findPublicationCrdtSnapshotById(publication.id).pipe(Effect.provide(database)),
        ).crdtSnapshot
        const current = snapshotToLoroDoc(snapshot)
        const edited = current.fork()

        yield* PublicationCrdt.applyEdit(edited, {
          _tag: "SetPublicationLocale",
          locale: "pt",
          value: {
            content: textToRichTextDocument("Updated publication"),
            originalLocale: "pt",
            translationSource: "ORIGINAL",
            translatedAtCrdtFrontier: null,
          },
        })

        const updatedResponse = yield* request(`/publications/${publication.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            Schema.encodeSync(Schema.toCodecJson(ApiUpdatePublicationData))({
              expectedCurrentCrdtFrontier: publication.currentCrdtFrontier,
              crdtUpdate: LoroDocUpdate.make(
                edited.export({ from: current.version(), mode: "update" }),
              ),
            }),
          ),
        })

        expect(updatedResponse.status).toBe(200)
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Validate the JSON received from the HTTP boundary.
        const updated = Schema.decodeUnknownSync(ApiPublicationData)(
          yield* Effect.tryPromise(() => updatedResponse.json()),
        )
        expect(updated.kind).toBe(publication.kind)
        expect(updated.content).toEqual(textToRichTextDocument("Updated publication"))
      }),
      { concurrency: 1, discard: true },
    )

    const ownerAuthentication = Option.getOrThrow(Option.fromNullishOr(authentication))
    authentication = null
    expect((yield* request(media.url)).status).toBe(404) // This asset was changed to VIDEO above.
    expect((yield* request(playlistUrl)).status).toBe(200)
    expect((yield* request(privateMedia.url)).status).toBe(404)
    expect((yield* request(privateMedia.url, { method: "HEAD" })).status).toBe(404)
    expect((yield* request(privateMedia.url, { headers: { range: "bytes=0-1" } })).status).toBe(404)

    authentication = {
      ...ownerAuthentication,
      session: {
        ...ownerAuthentication.session,
        subjectId: Schema.decodeSync(AuthenticationSession.fields.subjectId)(
          "00000000-0000-7000-8000-000000000098",
        ),
      },
    }

    expect((yield* request(playlistUrl)).status).toBe(200)
    expect((yield* request(privateMedia.url)).status).toBe(404)

    authentication = ownerAuthentication
    expect((yield* request(privateMedia.url)).status).toBe(200)

    expect(
      (yield* request(`/media/${media.id}/moderate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ moderationStatus: "CENSORED" }),
      })).status,
    ).toBe(200)

    expect((yield* request(playlistUrl)).status).toBe(404)
    expect((yield* request(`/media/${media.id}/original/original`)).status).toBe(404)

    const reapproved = yield* request(`/media/${media.id}/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moderationStatus: "REAPPROVED_AFTER_CENSORING" }),
    })

    expect(reapproved.status).toBe(200)
    expect(yield* Effect.tryPromise(() => reapproved.json())).toEqual({
      moderationStatus: "REAPPROVED_AFTER_CENSORING",
    })
    expect((yield* request(playlistUrl)).status).toBe(200)

    expect(
      (yield* request(`/media/publications/00000000-0000-7000-8000-000000000001`, {
        method: "POST",
      })).status,
    ).toBe(404)

    authentication = null
    expect((yield* request(privateMedia.url)).status).toBe(404)

    expect(
      (yield* request("/media/upload", {
        method: "POST",
        body,
        headers: {
          authorization: `Bearer ${personId}`,
        },
      })).status,
    ).toBe(403)
  }),
)
