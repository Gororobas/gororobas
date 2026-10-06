import { NodePath, NodeServices } from "@effect/platform-node"
import { AccountSession, IdGen, PersonId, SessionContext } from "@gororobas/domain"
import { ConfigProvider, Effect, Exit, FileSystem, Layer, Path } from "effect"
import { SqlClient } from "effect/sql"
import sharp from "sharp"
import { expect, it } from "vitest"

import { IdGenLive } from "../src/id-gen-live.js"
import { MediaAssetsRepository } from "../src/media-assets/repository.js"
import { MediaAssetsService } from "../src/media-assets/service.js"
import { MediaAssetsStorage } from "../src/media-assets/storage.js"
import { makeAppSql } from "../src/sql.js"

const { join } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

it("publishes processed files before rows, cleans up failures, and hides censored files", async () => {
  const filesystem = await Effect.runPromise(
    Effect.provide(FileSystem.FileSystem, NodeServices.layer),
  )
  const directory = await Effect.runPromise(
    filesystem.makeTempDirectory({ prefix: "mediaAssets-persistence-" }),
  )
  const root = join(directory, "media-assets")
  const file = await sharp({ create: { width: 80, height: 40, channels: 3, background: "green" } })
    .png()
    .toBuffer()

  const dependencies = Layer.mergeAll(
    makeAppSql(join(directory, "preview.sqlite")),
    IdGenLive,
    NodeServices.layer,
    Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make),
    Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make).pipe(
      Layer.provide(NodeServices.layer),
      Layer.provide(
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: root }),
        ),
      ),
    ),
  )

  const services = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
    Layer.provideMerge(dependencies),
  )

  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const filesystem = yield* FileSystem.FileSystem
        const service = yield* MediaAssetsService
        const personId = yield* IdGen.make(PersonId)
        yield* sql`INSERT INTO auth_subjects (id, name, email, is_email_verified, security_revision, created_at, updated_at) VALUES (${personId}, 'Importer', 'mediaAssets@example.invalid', 0, ${personId}, '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z')`
        yield* sql`INSERT INTO profiles (id, type, handle, name, visibility, created_at, updated_at) VALUES (${personId}, 'PERSON', 'importer', 'Importer', 'PUBLIC', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z')`
        yield* sql`INSERT INTO people (id, access_level) VALUES (${personId}, 'ADMIN')`

        const session = AccountSession.make({
          type: "ACCOUNT",
          personId,
          accessLevel: "ADMIN",
          memberships: [],
        })

        yield* Effect.gen(function* () {
          const mediaAsset = yield* service.upload({
            file,
            contentType: "image/png",
            fileName: "../../plant.png",
          })

          expect(yield* service.getRow(mediaAsset.id)).toEqual(mediaAsset)
          expect(mediaAsset.label).toBeNull()
          expect(yield* filesystem.readDirectory(join(root, mediaAsset.id))).toEqual(
            expect.arrayContaining(["original", "50.avif", "300.avif", "1280.avif", "2400.avif"]),
          )
          expect(
            new Uint8Array(yield* filesystem.readFile(join(root, mediaAsset.id, "original"))),
          ).toEqual(new Uint8Array(file))

          expect(
            yield* Effect.exit(
              service.getFile({ id: mediaAsset.id, format: "video", variant: "../../etc/passwd" }),
            ),
          ).toSatisfy(Exit.isFailure)

          yield* sql`CREATE TRIGGER reject_assets BEFORE INSERT ON media_assets BEGIN SELECT RAISE(FAIL, 'Rejected for test'); END`

          expect(
            yield* Effect.exit(
              service.upload({ file, contentType: "image/png", fileName: "plant.png" }),
            ),
          ).toSatisfy(Exit.isFailure)

          expect(yield* filesystem.readDirectory(root)).toEqual([mediaAsset.id])
          yield* sql`DROP TRIGGER reject_assets`

          expect(
            yield* Effect.exit(
              service.upload({
                file: new Uint8Array([1, 2, 3]),
                contentType: "image/png",
                fileName: "bad.png",
              }),
            ),
          ).toSatisfy(Exit.isFailure)

          expect(yield* filesystem.readDirectory(root)).toEqual([mediaAsset.id])
          expect(yield* sql`SELECT id FROM media_assets`).toEqual([{ id: mediaAsset.id }])

          const visitorUpload = yield* Effect.exit(
            service
              .upload({ file, contentType: "image/png", fileName: "plant.png" })
              .pipe(Effect.provideService(SessionContext, { type: "VISITOR" })),
          )

          expect(visitorUpload).toSatisfy(Exit.isFailure)
          yield* service.censor(mediaAsset.id)
          expect(yield* Effect.exit(service.getRow(mediaAsset.id))).toSatisfy(Exit.isFailure)

          expect(
            yield* Effect.exit(
              service.getFile({ id: mediaAsset.id, format: "original", variant: "original" }),
            ),
          ).toSatisfy(Exit.isFailure)

          expect(yield* sql`SELECT moderation_status FROM media_assets`).toEqual([
            { moderationStatus: "CENSORED" },
          ])
        }).pipe(Effect.provideService(SessionContext, session))
      }).pipe(Effect.provide(services)),
    )
  } finally {
    await Effect.runPromise(filesystem.remove(directory, { recursive: true, force: true }))
  }
})
