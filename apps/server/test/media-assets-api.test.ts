import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  ApiPublicationData,
  ApiUpdatePublicationData,
  PublicationCrdt,
  LoroDocUpdate,
  snapshotToLoroDoc,
  MediaAssetId,
} from "@gororobas/domain"
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"
import sharp from "sharp"

import { IdGenLive } from "../src/id-gen-live.js"
import { findPublicationCrdtSnapshotById } from "../src/publications/queries.js"
import { AppSqlTest } from "../src/sql.js"
import { ApiTestClient } from "./api-test-client.js"
import { textToRichTextDocument } from "./feature-test-helpers.js"

const ownerId = "00000000-0000-7000-8000-000000000001"
const ownerEmail = "reviewer@example.invalid"
const otherId = "00000000-0000-7000-8000-000000000098"
const otherEmail = "other@example.invalid"
const timestamp = "2026-10-03T00:00:00Z"

type Requester = ReturnType<ApiTestClient["Service"]["requestWith"]>

const insertPerson = (input: { id: string; email: string; handle: string; accessLevel: string }) =>
  SqlClient.SqlClient.use((sql) =>
    sql`INSERT INTO auth_subjects (id, email, is_email_verified, security_revision, claimed_at, created_at, updated_at) VALUES (${input.id}, ${input.email}, 1, ${input.id}, ${timestamp}, ${timestamp}, ${timestamp})`.pipe(
      Effect.andThen(
        sql`INSERT INTO profiles (id, type, handle, name, searchable_text, visibility, created_at, updated_at) VALUES (${input.id}, 'PERSON', ${input.handle}, ${input.handle}, ${input.handle}, 'PUBLIC', ${timestamp}, ${timestamp})`,
      ),
      Effect.andThen(
        sql`INSERT INTO people (id, access_level) VALUES (${input.id}, ${input.accessLevel})`,
      ),
    ),
  )

const withApi = <A, E, R>(
  scenario: (context: {
    api: ApiTestClient["Service"]
    root: string
    filesystem: FileSystem.FileSystem
    path: Path.Path
    owner: Requester
    other: Requester
    visitor: Requester
  }) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const filesystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* filesystem.makeTempDirectoryScoped({ prefix: "media-assets-api-" })
    const root = path.join(directory, "assets")

    return yield* Effect.gen(function* () {
      yield* insertPerson({
        id: ownerId,
        email: ownerEmail,
        handle: "reviewer",
        accessLevel: "ADMIN",
      })

      // Signed in, but without a profile: not (yet) a member of the community.
      yield* SqlClient.SqlClient.use(
        (sql) =>
          sql`INSERT INTO auth_subjects (id, email, is_email_verified, security_revision, claimed_at, created_at, updated_at) VALUES (${otherId}, ${otherEmail}, 1, ${otherId}, ${timestamp}, ${timestamp}, ${timestamp})`,
      )

      const api = yield* ApiTestClient

      return yield* scenario({
        api,
        root,
        filesystem,
        path,
        owner: api.requestWith(yield* api.signInBrowser(ownerEmail)),
        other: api.requestWith(yield* api.signInBrowser(otherEmail)),
        visitor: api.requestWith(api.newBrowser()),
      })
    }).pipe(
      Effect.provide(
        ApiTestClient.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              AppSqlTest,
              IdGenLive,
              WorkflowEngine.layerMemory,
              Layer.succeed(
                ConfigProvider.ConfigProvider,
                ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: root }),
              ),
            ),
          ),
        ),
      ),
    )
  }).pipe(Effect.provide(NodeServices.layer))

const MediaUpload = Schema.Struct({
  id: MediaAssetId,
  url: Schema.String,
  byteSize: Schema.Finite,
})

const png = Effect.tryPromise(() =>
  sharp({ create: { width: 80, height: 40, channels: 3, background: "green" } })
    .png()
    .toBuffer(),
)

/** A valid PNG followed by zeros: decoders stop at the image's end, the upload keeps every byte. */
const paddedPng = (byteSize: number) =>
  Effect.map(png, (image) => {
    const file = new Uint8Array(byteSize)
    file.set(image)
    return file
  })

const uploadForm = (files: ReadonlyArray<{ bytes: Uint8Array<ArrayBuffer>; name: string }>) => {
  const body = new FormData()
  files.forEach(({ bytes, name }) =>
    body.append("file", new Blob([bytes], { type: "image/png" }), name),
  )
  return body
}

const upload = ({
  request,
  bytes,
  name,
}: {
  request: Requester
  bytes: Uint8Array<ArrayBuffer>
  name: string
}) =>
  Effect.gen(function* () {
    const response = yield* request({
      path: "/media/upload",
      method: "POST",
      body: uploadForm([{ bytes, name }]),
    })

    expect(response.status).toBe(200)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
    return yield* Schema.decodeUnknownEffect(MediaUpload)(
      yield* Effect.tryPromise(() => response.json()),
    )
  })

const postJson = ({ request, path, body }: { request: Requester; path: string; body: object }) =>
  request({
    path,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const bytesOf = (response: Response) =>
  Effect.tryPromise(() => response.arrayBuffer()).pipe(
    Effect.map((buffer) => new Uint8Array(buffer)),
  )

const markAsVideo = (mediaAssetId: MediaAssetId) =>
  SqlClient.SqlClient.use(
    (sql) =>
      sql`UPDATE media_assets SET format = 'VIDEO', metadata = ${JSON.stringify({
        format: "VIDEO",
        originalWidth: 80,
        originalHeight: 40,
        duration: 1000,
      })} WHERE id = ${mediaAssetId}`,
  )

it.live("streams a multipart upload to storage and serves a validated AVIF variant", () =>
  withApi(({ owner, root, filesystem, path }) =>
    Effect.gen(function* () {
      const file = yield* paddedPng(12 * 1024 * 1024)
      const media = yield* upload({ request: owner, bytes: file, name: "plant.png" })

      expect(media.byteSize).toBe(file.length)
      expect(
        new Uint8Array(yield* filesystem.readFile(path.join(root, media.id, "original"))),
      ).toEqual(file)

      const image = yield* owner({ path: media.url })
      expect(image.headers.get("content-type")).toBe("image/avif")

      expect(
        yield* Effect.tryPromise(async () =>
          sharp(Buffer.from(await image.arrayBuffer())).metadata(),
        ),
      ).toMatchObject({ format: "heif", width: 80 })
    }),
  ),
)

it.live("serves byte ranges, HEAD and stale If-Range requests from the original", () =>
  withApi(({ owner }) =>
    Effect.gen(function* () {
      const file = yield* paddedPng(64 * 1024)
      const media = yield* upload({ request: owner, bytes: file, name: "plant.png" })
      const originalPath = `/media/${media.id}/original/original`

      yield* Effect.forEach(
        [
          ["bytes=2-6", 2, 6],
          ["bytes=-4", file.length - 4, file.length - 1],
          [`bytes=${file.length - 2}-`, file.length - 2, file.length - 1],
        ] as const,
        Effect.fn(function* ([range, start, end]) {
          const response = yield* owner({ path: originalPath, headers: { range } })

          expect(response.status).toBe(206)
          expect(response.headers.get("content-type")).toBe("image/png")
          expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/${file.length}`)
          expect(response.headers.get("content-length")).toBe(String(end - start + 1))
          expect(yield* bytesOf(response)).toEqual(file.slice(start, end + 1))
        }),
        { concurrency: 1, discard: true },
      )

      const head = yield* owner({ path: originalPath, method: "HEAD" })
      expect(head.headers.get("content-length")).toBe(String(file.length))
      expect((yield* bytesOf(head)).byteLength).toBe(0)

      const staleRange = yield* owner({
        path: originalPath,
        headers: { range: "bytes=0-1", "if-range": "different-etag" },
      })
      expect(staleRange.status).toBe(200)
      expect(yield* bytesOf(staleRange)).toEqual(file)

      expect((yield* owner({ path: originalPath, headers: { range: "bytes=-0" } })).status).toBe(
        416,
      )
    }),
  ),
)

it.live("rejects unknown variants and malformed uploads", () =>
  withApi(({ owner, visitor }) =>
    Effect.gen(function* () {
      const file = yield* paddedPng(64 * 1024)
      const media = yield* upload({ request: owner, bytes: file, name: "plant.png" })

      expect((yield* owner({ path: `/media/${media.id}/images/51` })).status).toBe(400)
      expect((yield* owner({ path: `/media/${media.id}/audio/audio.m4a` })).status).toBe(404)

      const twoFiles = uploadForm([
        { bytes: file, name: "one.png" },
        { bytes: file, name: "two.png" },
      ])
      expect((yield* owner({ path: "/media/upload", method: "POST", body: twoFiles })).status).toBe(
        413,
      )

      const missing = new FormData()
      missing.append("other", "value")
      expect((yield* owner({ path: "/media/upload", method: "POST", body: missing })).status).toBe(
        400,
      )

      expect(
        (yield* visitor({
          path: "/media/upload",
          method: "POST",
          body: uploadForm([{ bytes: file, name: "plant.png" }]),
          headers: { authorization: `Bearer ${ownerId}` },
        })).status,
      ).toBe(403)
    }),
  ),
)

it.live("resolves a playlist's relative segments through the media endpoint", () =>
  withApi(({ owner, visitor, root, filesystem, path }) =>
    Effect.gen(function* () {
      const media = yield* upload({
        request: owner,
        bytes: yield* paddedPng(64 * 1024),
        name: "clip.png",
      })

      yield* markAsVideo(media.id)
      yield* filesystem.writeFileString(
        path.join(root, media.id, "master.m3u8"),
        "#EXTM3U\nsegment-0.ts\n",
      )
      yield* filesystem.writeFile(
        path.join(root, media.id, "segment-0.ts"),
        new Uint8Array([1, 2, 3]),
      )

      expect(
        (yield* postJson({
          request: owner,
          path: `/profiles/${ownerId}/publications`,
          body: {
            kind: "POST",
            content: textToRichTextDocument("Public media"),
            handle: "public-media",
            visibility: "PUBLIC",
            mediaIds: [media.id],
          },
        })).status,
      ).toBe(200)

      const playlistUrl = `/media/${media.id}/video/master.m3u8`
      const playlist = yield* visitor({ path: playlistUrl })
      expect(playlist.headers.get("content-type")).toBe("application/vnd.apple.mpegurl")
      expect(yield* Effect.tryPromise(() => playlist.text())).toContain("segment-0.ts")

      const segment = yield* visitor({
        path: new URL("segment-0.ts", `https://localhost:4443${playlistUrl}`).pathname,
      })
      expect(yield* bytesOf(segment)).toEqual(new Uint8Array([1, 2, 3]))
    }),
  ),
)

it.live("keeps a publication's kind when its content is updated", () =>
  withApi(({ owner }) =>
    Effect.gen(function* () {
      const created = yield* Effect.forEach(
        [
          { kind: "POST", handle: "plain-post", extra: {} },
          {
            kind: "EVENT",
            handle: "community-gathering",
            extra: { startDate: "2026-10-09T12:00:00Z" },
          },
        ],
        ({ kind, handle, extra }) =>
          postJson({
            request: owner,
            path: `/profiles/${ownerId}/publications`,
            body: {
              kind,
              content: textToRichTextDocument("Original publication"),
              handle,
              visibility: "PUBLIC",
              ...extra,
            },
          }),
        { concurrency: 1 },
      )

      yield* Effect.forEach(
        created,
        Effect.fn(function* (response) {
          expect(response.status).toBe(200)
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Validate the JSON received from the HTTP boundary.
          const publication = Schema.decodeUnknownSync(ApiPublicationData)(
            yield* Effect.tryPromise(() => response.json()),
          )
          const current = snapshotToLoroDoc(
            Option.getOrThrow(yield* findPublicationCrdtSnapshotById(publication.id)).crdtSnapshot,
          )
          const edited = current.fork()
          yield* PublicationCrdt.applyEdit(edited, {
            _tag: "SetPublicationSourceContent",
            content: textToRichTextDocument("Updated publication"),
          })

          const updatedResponse = yield* owner({
            path: `/publications/${publication.id}`,
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              Schema.encodeSync(Schema.toCodecJson(ApiUpdatePublicationData))({
                crdtEdit: {
                  expectedCurrentCrdtFrontier: publication.currentCrdtFrontier,
                  crdtUpdate: LoroDocUpdate.make(
                    edited.export({ from: current.version(), mode: "update" }),
                  ),
                },
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
    }),
  ),
)

it.live(
  "hides community media from visitors and other people, and censored media from all but its uploader",
  () =>
    withApi(({ owner, other, visitor, root, filesystem, path }) =>
      Effect.gen(function* () {
        const file = yield* paddedPng(64 * 1024)
        const communityMedia = yield* upload({ request: owner, bytes: file, name: "community.png" })

        expect(
          (yield* postJson({
            request: owner,
            path: `/profiles/${ownerId}/publications`,
            body: {
              kind: "POST",
              content: textToRichTextDocument("Community media"),
              handle: "community-media",
              visibility: "COMMUNITY",
              mediaIds: [communityMedia.id],
            },
          })).status,
        ).toBe(200)

        expect((yield* owner({ path: communityMedia.url })).status).toBe(200)
        expect((yield* visitor({ path: communityMedia.url })).status).toBe(404)
        expect((yield* visitor({ path: communityMedia.url, method: "HEAD" })).status).toBe(404)
        expect(
          (yield* visitor({ path: communityMedia.url, headers: { range: "bytes=0-1" } })).status,
        ).toBe(404)
        expect((yield* other({ path: communityMedia.url })).status).toBe(404)

        const publicMedia = yield* upload({ request: owner, bytes: file, name: "public.png" })
        yield* markAsVideo(publicMedia.id)
        yield* filesystem.writeFileString(
          path.join(root, publicMedia.id, "master.m3u8"),
          "#EXTM3U\nsegment-0.ts\n",
        )

        expect(
          (yield* postJson({
            request: owner,
            path: `/profiles/${ownerId}/publications`,
            body: {
              kind: "POST",
              content: textToRichTextDocument("Public media"),
              handle: "public-media",
              visibility: "PUBLIC",
              mediaIds: [publicMedia.id],
            },
          })).status,
        ).toBe(200)

        const playlistUrl = `/media/${publicMedia.id}/video/master.m3u8`
        expect((yield* visitor({ path: playlistUrl })).status).toBe(200)
        expect((yield* other({ path: playlistUrl })).status).toBe(200)

        expect(
          (yield* postJson({
            request: owner,
            path: `/media/${publicMedia.id}/moderate`,
            body: {
              moderationStatus: "CENSORED",
            },
          })).status,
        ).toBe(200)

        // Uploaders keep seeing their censored media; nobody else does.
        expect((yield* owner({ path: playlistUrl })).status).toBe(200)
        expect((yield* other({ path: playlistUrl })).status).toBe(404)
        expect((yield* other({ path: `/media/${publicMedia.id}/original/original` })).status).toBe(
          404,
        )

        const reapproved = yield* postJson({
          request: owner,
          path: `/media/${publicMedia.id}/moderate`,
          body: {
            moderationStatus: "REAPPROVED_AFTER_CENSORING",
          },
        })

        expect(reapproved.status).toBe(200)
        expect(yield* Effect.tryPromise(() => reapproved.json())).toEqual({
          moderationStatus: "REAPPROVED_AFTER_CENSORING",
        })
        expect((yield* other({ path: playlistUrl })).status).toBe(200)

        expect(
          (yield* owner({
            path: `/media/publications/00000000-0000-7000-8000-000000000001`,
            method: "POST",
          })).status,
        ).toBe(404)
      }),
    ),
)
