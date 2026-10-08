import {
  MediaAssetId,
  MediaAssetRow,
  MediaAssetRequest,
  InvalidMediaAssetError,
  MediaAssetStorageError,
  IdGen,
  MediaNotFoundError,
  Policies,
  ProfileId,
  assertAuthenticated,
} from "@gororobas/domain"
import { Record, Context, DateTime, Effect, Option, Schema, Array as EffectArray } from "effect"
import { SqlClient } from "effect/sql"

import { assertCanViewPublication } from "../publications/service.js"
import { processMediaAsset, readMediaAssetMetadata } from "./processing.js"
import { MediaAssetsRepository } from "./repository.js"
import { MediaAssetsStorage } from "./storage.js"

const contentTypes = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/avif": "IMAGE",
  "image/gif": "IMAGE",
  "audio/wav": "AUDIO",
  "audio/x-wav": "AUDIO",
  "audio/mpeg": "AUDIO",
  "audio/mp4": "AUDIO",
  "audio/ogg": "AUDIO",
  "audio/webm": "AUDIO",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
} as const

export class MediaAssetsService extends Context.Service<MediaAssetsService>()(
  "MediaAssetsService",
  {
    make: Effect.gen(function* () {
      const repository = yield* MediaAssetsRepository
      const storage = yield* MediaAssetsStorage

      const getRow = (id: MediaAssetId) =>
        Effect.gen(function* () {
          const mediaAsset = yield* repository.findMediaAssetById(id)
          if (Option.isNone(mediaAsset)) {
            return yield* new MediaNotFoundError({ id })
          }
          const row = mediaAsset.value

          const wiki = yield* repository.listMediaAssetWikiArticles(id)
          const publications = yield* repository.listMediaAssetPublications(id)

          const access = yield* Effect.forEach(
            publications,
            (publication) =>
              assertCanViewPublication(publication).pipe(
                Effect.as(true),
                Effect.catchTag("UnauthorizedError", () => Effect.succeed(false)),
              ),
            { concurrency: 1 },
          )

          yield* Policies.media
            .canView(row, {
              hasWikiAttachment: EffectArray.isReadonlyArrayNonEmpty(wiki),
              canViewPublication: access.some((allowed) => allowed),
              isAttached:
                EffectArray.isReadonlyArrayNonEmpty(publications) ||
                EffectArray.isReadonlyArrayNonEmpty(wiki),
            })
            .pipe(Effect.mapError(() => new MediaNotFoundError({ id })))

          return row
        })

      const getFile = (input: MediaAssetRequest) =>
        Effect.gen(function* () {
          // @todo do we really need to re-decode this?
          const request = yield* Schema.decodeEffect(MediaAssetRequest)(input)
          const { id, format, variant } = request

          const mediaAsset = yield* getRow(id)

          if (format !== "original") {
            const expectedFormat =
              format === "images" ? "IMAGE" : format === "audio" ? "AUDIO" : "VIDEO"
            if (mediaAsset.format !== expectedFormat) return yield* new MediaNotFoundError({ id })
          }

          return {
            filename: storage.filePath(id, format === "images" ? `${variant}.avif` : variant),
            contentType:
              format === "original"
                ? (mediaAsset.contentType ?? "application/octet-stream")
                : undefined,
          }
        })

      const prepare = (input: {
        id: MediaAssetId
        file: Uint8Array | string
        contentType: string
      }) =>
        Effect.scoped(
          // Conversion is interruptible; publication must finish before the staging scope is released.
          Effect.uninterruptible(
            Effect.gen(function* () {
              const media = Record.toEntries(contentTypes).find(
                ([type]) => type === input.contentType,
              )?.[1]
              if (!media) {
                return yield* new InvalidMediaAssetError({ message: "Unsupported media type" })
              }
              const staged = yield* Effect.interruptible(storage.stage({ file: input.file }))
              if (staged.byteSize === 0) {
                return yield* new InvalidMediaAssetError({ message: "Empty media file" })
              }

              const metadata = yield* Effect.interruptible(
                readMediaAssetMetadata(staged.filename, media),
              ).pipe(
                Effect.mapError(
                  () =>
                    new InvalidMediaAssetError({
                      message: "File does not match a supported media format",
                    }),
                ),
              )

              yield* Effect.interruptible(processMediaAsset({ ...staged, metadata })).pipe(
                Effect.mapError((cause) => new MediaAssetStorageError({ cause })),
              )
              yield* storage.publish(input.id, staged.directory)

              return {
                metadata,
                contentType: input.contentType,
                byteSize: staged.byteSize,
              }
            }),
          ),
        )

      const upload = (input: {
        file: Uint8Array | string
        contentType: string
        fileName: string
      }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.media.canCreate
          const id = yield* IdGen.make(MediaAssetId)
          const now = yield* DateTime.now

          // Keep publication and insertion together across interruption; failures remove published files.
          return yield* Effect.uninterruptibleMask(() =>
            Effect.gen(function* () {
              const stored = yield* prepare({ ...input, id })

              return yield* Effect.gen(function* () {
                const mediaAsset = yield* Schema.decodeEffect(Schema.toType(MediaAssetRow))({
                  ...stored,
                  id,
                  ...(stored.metadata.format === "IMAGE"
                    ? { format: stored.metadata.format, metadata: stored.metadata }
                    : stored.metadata.format === "AUDIO"
                      ? { format: stored.metadata.format, metadata: stored.metadata }
                      : { format: stored.metadata.format, metadata: stored.metadata }),
                  ownerProfileId: ProfileId.make(session.personId),
                  category: null,
                  descriptions: {},
                  moderationStatus: "APPROVED_BY_DEFAULT",
                  createdAt: now,
                  updatedAt: now,
                })

                yield* repository.insertMediaAsset(mediaAsset)

                return mediaAsset
              }).pipe(
                (effect) => SqlClient.SqlClient.use((sql) => sql.withTransaction(effect)),
                Effect.onError(() => storage.remove(id).pipe(Effect.orDie)),
              )
            }),
          )
        })

      const getMediaForAttachment = (id: MediaAssetId, options: { isAlreadyAttached: boolean }) =>
        Effect.gen(function* () {
          const media = yield* repository.findMediaAssetById(id)
          if (Option.isNone(media)) return yield* new MediaNotFoundError({ id })
          yield* Policies.media.canAttach(media.value, options)

          if (media.value.moderationStatus === "CENSORED") {
            return yield* new MediaNotFoundError({ id })
          }
          return media.value
        })

      const moderate = (input: {
        id: MediaAssetId
        moderationStatus: "CENSORED" | "REAPPROVED_AFTER_CENSORING"
      }) =>
        SqlClient.SqlClient.use((sql) =>
          Effect.gen(function* () {
            yield* Policies.media.canModerate
            const media = yield* repository.findMediaAssetById(input.id)
            if (Option.isNone(media)) return yield* new MediaNotFoundError({ id: input.id })

            if (
              input.moderationStatus === "CENSORED" ||
              media.value.moderationStatus === "CENSORED"
            ) {
              yield* repository.moderateMediaAsset({
                id: input.id,
                moderationStatus: input.moderationStatus,
                updatedAt: yield* DateTime.now,
              })
            }

            const updated = yield* repository.findMediaAssetById(input.id)
            if (Option.isNone(updated)) return yield* new MediaNotFoundError({ id: input.id })
            return { moderationStatus: updated.value.moderationStatus }
          }).pipe(sql.withTransaction),
        )

      return {
        upload,
        getMediaForAttachment,
        moderate,
        prepare,
        getRow,
        getFile,
      }
    }),
  },
) {}
