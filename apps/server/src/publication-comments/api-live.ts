import { ContentLanguage, GororobasApi, type PublicationCommentData } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { PublicationCommentTranslationWorkflow } from "../translation/publication-comment-translation-workflow.js"
import { PublicationCommentsService } from "./service.js"

const requestTranslations = (publicationComment: PublicationCommentData) =>
  PublicationCommentTranslationWorkflow.execute(
    {
      publicationCommentId: publicationComment.id,
      sourceRevisionId: publicationComment.currentRevisionId,
      sourceContent: publicationComment.sourceContent,
    },
    { discard: true },
  )

export const PublicationCommentsApiLive = HttpApiBuilder.group(
  GororobasApi,
  "publicationComments",
  (handlers) =>
    handlers
      .handle("getPublicationComments", ({ query }) =>
        PublicationCommentsService.use((service) =>
          service.listByPublicationId(query.publicationId),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "getPublicationComments",
          }),
        ),
      )
      .handle("getPublicationComment", ({ params }) =>
        PublicationCommentsService.use((service) =>
          service.getPublicationCommentData(params.id),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "getPublicationComment",
          }),
        ),
      )
      .handle("createPublicationComment", ({ params, payload }) =>
        PublicationCommentsService.use((service) =>
          Effect.gen(function* () {
            // @todo refactor service.createPublicationComment to return the entire comment row to avoid having to refetch it below
            const id = yield* service.createPublicationComment({
              publicationId: params.id,
              content: {
                sourceContent: payload.content,
                sourceLanguage: ContentLanguage.make("und"),
              },
            })

            const publicationComment = yield* service.getPublicationCommentById(id)
            yield* requestTranslations(publicationComment)
            return publicationComment
          }),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "createPublicationComment",
          }),
        ),
      )
      .handle("createReplyPublicationComment", ({ params, payload }) =>
        PublicationCommentsService.use((service) =>
          Effect.gen(function* () {
            const id = yield* service.createReplyPublicationComment({
              parentPublicationCommentId: params.id,
              content: {
                sourceContent: payload.content,
                sourceLanguage: ContentLanguage.make("und"),
              },
            })

            const publicationComment = yield* service.getPublicationCommentById(id)
            yield* requestTranslations(publicationComment)
            return publicationComment
          }),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "createReplyPublicationComment",
          }),
        ),
      )
      .handle("updatePublicationComment", ({ params, payload }) =>
        PublicationCommentsService.use((service) =>
          Effect.gen(function* () {
            yield* service.updatePublicationComment({ ...payload, publicationCommentId: params.id })
            const publicationComment = yield* service.getPublicationCommentById(params.id)
            yield* requestTranslations(publicationComment)
            return publicationComment
          }),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "updatePublicationComment",
          }),
        ),
      )
      .handle("deletePublicationComment", ({ params }) =>
        PublicationCommentsService.use((service) =>
          service.deletePublicationComment(params.id),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "deletePublicationComment",
          }),
        ),
      )
      .handle("censorPublicationComment", ({ params }) =>
        PublicationCommentsService.use((service) =>
          Effect.gen(function* () {
            yield* service.censorPublicationComment(params.id)
            return yield* service.getPublicationCommentById(params.id)
          }),
        ).pipe(
          withApiInfrastructureErrors({
            group: "publicationComments",
            endpoint: "censorPublicationComment",
          }),
        ),
      ),
)
