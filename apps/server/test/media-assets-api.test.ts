import { NodePath, NodeServices } from "@effect/platform-node"
import { AuthenticationHttp, CurrentAuthenticationData, GororobasApi } from "@gororobas/domain"
import { Auth, Sessions } from "@yielded/auth"
import {
  FileSystem,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Schema,
  Path,
} from "effect"
import { Etag, HttpPlatform, HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import { SqlClient } from "effect/sql"
import sharp from "sharp"
import { expect, it } from "vitest"

import { IdGenLive } from "../src/id-gen-live.js"
import { MediaAssetsApiLive } from "../src/media-assets/api-live.js"
import { MediaAssetsRepository } from "../src/media-assets/repository.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { MediaAssetsStorage } from "../src/media-assets/storage.js"
import { makeAppSql } from "../src/sql.js"

const { join } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

it("streams multipart uploads and serves validated variants, ranges and censorship through HTTP", async () => {
  const filesystem = await Effect.runPromise(
    Effect.provide(FileSystem.FileSystem, NodeServices.layer),
  )
  const directory = await Effect.runPromise(
    filesystem.makeTempDirectory({ prefix: "mediaAssets-api-" }),
  )
  const root = join(directory, "assets")
  const databaseRuntime = ManagedRuntime.make(makeAppSql(join(directory, "preview.sqlite")))
  const database = Layer.succeedContext(await databaseRuntime.context())
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
        authenticatedAt: Date.parse(timestamp),
      },
      issuedAt: Date.parse(timestamp),
      expiresAt: Date.parse("2027-01-01T00:00:00Z"),
      absoluteExpiresAt: Date.parse("2027-01-01T00:00:00Z"),
      claims: { authSubjectId: personId },
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
            ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: root }),
          ),
        ),
      ),
    ),
    Layer.provideMerge(HttpPlatform.layer),
    Layer.provideMerge(Layer.mergeAll(database, IdGenLive, NodeServices.layer, Etag.layer)),
  )

  const api = HttpApi.make("GororobasApi").add(GororobasApi.groups.mediaAssets)

  const app = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(api).pipe(
      Layer.provide(MediaAssetsApiLive),
      Layer.provide(
        Layer.succeed(
          AuthenticationHttp.RequireSession,
          AuthenticationHttp.RequireSession.of({
            session: (httpEffect) =>
              authentication === null
                ? Effect.fail(Sessions.SessionInvalid.make({}))
                : Effect.provideService(
                    httpEffect,
                    AuthenticationHttp.CurrentSession,
                    authentication.session,
                  ),
          }),
        ),
      ),
      Layer.provideMerge(services),
    ),
    { disableLogger: true },
  )

  const request = (path: string, init?: RequestInit) =>
    app.handler(
      new Request(`http://localhost${path}`, init),
      Context.make(Auth.AuthRequest, {
        invocation: { _tag: "Guest" },
        credentials: {},
        credentialCommandSink: () => Effect.void,
      }),
    )

  try {
    await Effect.runPromise(
      SqlClient.SqlClient.use((sql) =>
        Effect.gen(function* () {
          yield* sql`INSERT INTO auth_subjects (id, name, email, is_email_verified, security_revision, created_at, updated_at) VALUES (${personId}, 'Reviewer', 'reviewer@example.invalid', 1, ${personId}, ${timestamp}, ${timestamp})`
          yield* sql`INSERT INTO profiles (id, type, handle, name, visibility, created_at, updated_at) VALUES (${personId}, 'PERSON', 'reviewer', 'Reviewer', 'PUBLIC', ${timestamp}, ${timestamp})`
          yield* sql`INSERT INTO people (id, access_level) VALUES (${personId}, 'ADMIN')`
        }),
      ).pipe(Effect.provide(database)),
    )

    const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: "green" } })
      .png()
      .toBuffer()
    const file = new Uint8Array(12 * 1024 * 1024)
    file.set(png)
    const body = new FormData()
    body.append("file", new Blob([file], { type: "image/png" }), "plant.png")
    const uploaded = await request("/media/upload", { method: "POST", body })
    expect(uploaded.status).toBe(200)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
    const media = Schema.decodeUnknownSync(
      Schema.Struct({ id: Schema.String, url: Schema.String, byteSize: Schema.Number }),
    )(await uploaded.json())
    expect(media.byteSize).toBe(file.length)

    expect(
      new Uint8Array(
        await Effect.runPromise(filesystem.readFile(join(root, media.id, "original"))),
      ),
    ).toEqual(new Uint8Array(file))

    const image = await request(media.url)
    expect(image.headers.get("content-type")).toBe("image/avif")
    expect(await sharp(Buffer.from(await image.arrayBuffer())).metadata()).toMatchObject({
      format: "heif",
      width: 80,
    })

    for (const [range, start, end] of [
      ["bytes=2-6", 2, 6],
      ["bytes=-4", file.length - 4, file.length - 1],
      [`bytes=${file.length - 2}-`, file.length - 2, file.length - 1],
    ] as const) {
      const response = await request(`/media/${media.id}/original/original`, { headers: { range } })
      expect(response.status).toBe(206)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/${file.length}`)
      expect(response.headers.get("content-length")).toBe(String(end - start + 1))
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(file.slice(start, end + 1))
    }

    const head = await request(`/media/${media.id}/original/original`, { method: "HEAD" })
    expect(head.headers.get("content-length")).toBe(String(file.length))
    expect((await head.arrayBuffer()).byteLength).toBe(0)
    const staleRange = await request(`/media/${media.id}/original/original`, {
      headers: { range: "bytes=0-1", "if-range": "different-etag" },
    })
    expect(staleRange.status).toBe(200)
    expect(Buffer.from(await staleRange.arrayBuffer()).equals(file)).toBe(true)
    expect(
      (await request(`/media/${media.id}/original/original`, { headers: { range: "bytes=-0" } }))
        .status,
    ).toBe(416)
    expect((await request(`/media/${media.id}/images/51`)).status).toBe(400)
    expect((await request(`/media/${media.id}/audio/audio.m4a`)).status).toBe(404)

    // A playlist's relative segment URL must resolve through the same endpoint.
    await Effect.runPromise(
      SqlClient.SqlClient.use(
        (sql) =>
          sql`UPDATE media_assets SET format = 'VIDEO', metadata = ${JSON.stringify({ format: "VIDEO", originalWidth: 80, originalHeight: 40, duration: 1000 })} WHERE id = ${media.id}`,
      ).pipe(Effect.provide(database)),
    )

    await Effect.runPromise(
      filesystem.writeFileString(join(root, media.id, "master.m3u8"), "#EXTM3U\nsegment-0.ts\n"),
    )
    await Effect.runPromise(
      filesystem.writeFile(join(root, media.id, "segment-0.ts"), new Uint8Array([1, 2, 3])),
    )
    const playlistUrl = `/media/${media.id}/video/master.m3u8`
    const playlist = await request(playlistUrl)
    expect(playlist.headers.get("content-type")).toBe("application/vnd.apple.mpegurl")
    expect(await playlist.text()).toContain("segment-0.ts")

    expect(
      new Uint8Array(
        await (
          await request(new URL("segment-0.ts", `http://localhost${playlistUrl}`).pathname)
        ).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]))

    const duplicate = new FormData()
    duplicate.append("file", new Blob([png], { type: "image/png" }), "one.png")
    duplicate.append("file", new Blob([png], { type: "image/png" }), "two.png")
    expect((await request("/media/upload", { method: "POST", body: duplicate })).status).toBe(413)
    const missing = new FormData()
    missing.append("other", "value")
    expect((await request("/media/upload", { method: "POST", body: missing })).status).toBe(400)

    expect(
      (
        await request(`/media/${media.id}/censor`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(200)

    expect((await request(playlistUrl)).status).toBe(404)
    expect((await request(`/media/${media.id}/original/original`)).status).toBe(404)
    authentication = null

    expect(
      (
        await request("/media/upload", {
          method: "POST",
          body,
          headers: { authorization: `Bearer ${personId}` },
        })
      ).status,
    ).toBe(401)
  } finally {
    await app.dispose()
    await databaseRuntime.dispose()
    await Effect.runPromise(filesystem.remove(directory, { recursive: true, force: true }))
  }
})
