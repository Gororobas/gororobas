import { GororobasApi, MediaAssetRow, InvalidMediaAssetError, Policies } from "@gororobas/domain"
import { MediaUploadData } from "@gororobas/domain/media-assets/api"
import { Effect, Schema } from "effect"
import { HttpServerRespondable, Multipart } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { mediaFileResponse } from "./file-response.js"
import { MediaAssetsService } from "./service.js"

const formUploadResult = (mediaAsset: MediaAssetRow) =>
  MediaUploadData.make({
    id: mediaAsset.id,
    contentType: mediaAsset.contentType ?? "application/octet-stream",
    fileName: "original",
    moderationStatus: mediaAsset.moderationStatus,
    byteSize: mediaAsset.byteSize ?? 0,
    url: `/media/${mediaAsset.id}/${mediaAsset.format === "IMAGE" ? "images/1280" : mediaAsset.format === "AUDIO" ? "audio/audio.m4a" : "video/master.m3u8"}`,
  })

export const MediaAssetsApiLive = HttpApiBuilder.group(GororobasApi, "mediaAssets", (handlers) =>
  handlers
    .handle("uploadMedia", ({ payload }) =>
      Effect.gen(function* () {
        yield* Policies.media.canCreate
        const parts = yield* Multipart.toPersisted(payload)

        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Multipart fields have arbitrary names and must be validated for the required file field.
        const { file } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ file: Multipart.SingleFileSchema }),
        )(parts).pipe(
          Effect.mapError(
            () => new InvalidMediaAssetError({ message: "Expected exactly one file field" }),
          ),
        )

        const service = yield* MediaAssetsService

        return yield* service.upload({
          file: file.path,
          contentType: file.contentType,
          fileName: file.name,
        })
      }).pipe(
        Effect.map(formUploadResult),
        Effect.catchTag("MultipartError", HttpServerRespondable.toResponse),
        withApiInfrastructureErrors({ endpoint: "uploadMedia", group: "mediaAssets" }),
      ),
    )
    .handle("getMedia", ({ params }) =>
      MediaAssetsService.use((service) => service.getFile(params)).pipe(
        Effect.flatMap(mediaFileResponse),
        withApiInfrastructureErrors({ endpoint: "getMedia", group: "mediaAssets" }),
      ),
    )
    .handle("moderateMedia", ({ params, payload }) =>
      MediaAssetsService.use((service) => service.moderate({ ...params, ...payload })).pipe(
        withApiInfrastructureErrors({ endpoint: "moderateMedia", group: "mediaAssets" }),
      ),
    ),
)
