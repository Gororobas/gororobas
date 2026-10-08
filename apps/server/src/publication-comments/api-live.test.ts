import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  ApiAuthentication,
  GororobasApi,
  IdGen,
  SessionContext,
  type CreatePublicationCommentData,
  type ApiUpdatePublicationCommentData,
  PublicationCommentData,
  type Session,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { makePersonFixture, makeProfileFixture } from "../../test/fixtures.js"
import {
  fixture,
  makeDocument,
  TestLayerWithRepositories,
} from "../../test/publication-comments/fixtures.js"
import { insertPersonWithDependencies } from "../../test/test-helpers.js"
import { VISITOR_SESSION, resolveSessionFromAuthSubjectId } from "../session-service.js"
import { LanguageDetectionServiceStub } from "../translation/language-detection-service.js"
import { PublicationCommentTranslationWorkflowLayer } from "../translation/publication-comment-translation-workflow.js"
import { TranslationService } from "../translation/translation-service.js"
import { PublicationCommentsApiLive } from "./api-live.js"
import { PublicationCommentsService } from "./service.js"

const dependencies = Layer.mergeAll(
  Layer.effect(PublicationCommentsService, PublicationCommentsService.make),
  PublicationCommentTranslationWorkflowLayer,
).pipe(
  Layer.provideMerge(TestLayerWithRepositories),
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provide(LanguageDetectionServiceStub),
  Layer.provide(
    Layer.succeed(TranslationService, {
      getServiceId: () => "test",
      translate: () => Effect.succeed("<p>Translated</p>"),
    }),
  ),
)

it.live(
  "serves publication comment mutations and enforces read, owner, and moderation permissions over HTTP",
  () =>
    Effect.gen(function* () {
      const { publicationComments, person, publicationCommentId } = yield* fixture
      const existing = Option.getOrThrow(
        yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
      )
      const owner = yield* resolveSessionFromAuthSubjectId(person.id)
      let session: Session = VISITOR_SESSION
      const context = yield* Effect.context<
        PublicationCommentsService | IdGen | SqlClient.SqlClient | WorkflowEngine.WorkflowEngine
      >()
      const api = HttpApi.make(GororobasApi.identifier).add(GororobasApi.groups.publicationComments)

      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          HttpRouter.toWebHandler(
            Layer.provide(HttpApiBuilder.layer(api), PublicationCommentsApiLive).pipe(
              HttpRouter.provideRequest(Layer.succeedContext(context)),
              Layer.provide(
                Layer.succeed(
                  ApiAuthentication,
                  ApiAuthentication.of((effect) =>
                    Effect.suspend(() =>
                      effect.pipe(Effect.provideService(SessionContext, session)),
                    ),
                  ),
                ),
              ),
              Layer.provide(NodeHttpServer.layerHttpServices),
            ),
            { disableLogger: true },
          ),
        ),
        (app) => Effect.tryPromise(() => app.dispose()).pipe(Effect.orDie),
      )

      const request = ({
        path,
        method = "GET",
        body,
      }: {
        path: string
        method?: string
        body?: CreatePublicationCommentData | ApiUpdatePublicationCommentData | { reason?: string }
      }) =>
        Effect.tryPromise(() =>
          app.handler(
            new Request(`http://localhost${path}`, {
              method,
              ...(body === undefined
                ? {}
                : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
            }),
          ),
        )

      const decodePublicationComment = (response: Response) =>
        Effect.tryPromise(() => response.json()).pipe(
          // The HTTP response JSON is an untrusted boundary.
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown
          Effect.flatMap(Schema.decodeUnknownEffect(PublicationCommentData)),
        )

      expect(
        (yield* request({ path: `/publication-comments/${publicationCommentId}` })).status,
      ).toBe(200)
      expect(
        (yield* request({ path: `/publication-comments?publicationId=${existing.publicationId}` }))
          .status,
      ).toBe(200)
      expect((yield* request({ path: "/publication-comments" })).status).toBe(400)

      expect(
        (yield* request({
          path: `/publications/${existing.publicationId}/comments`,
          method: "POST",
          body: {
            content: makeDocument("Guest"),
          },
        })).status,
      ).toBe(403)

      session = owner

      const createdResponse = yield* request({
        path: `/publications/${existing.publicationId}/comments`,
        method: "POST",
        body: { content: makeDocument("Created") },
      })

      expect(createdResponse.status).toBe(200)
      const created = yield* decodePublicationComment(createdResponse)
      expect(created.sourceLanguage).toBe("und")
      expect(created).not.toHaveProperty("content")

      const reply = yield* decodePublicationComment(
        yield* request({
          path: `/publication-comments/${created.id}/replies`,
          method: "POST",
          body: {
            content: makeDocument("Reply"),
          },
        }),
      )

      expect(reply.parentPublicationCommentId).toBe(created.id)
      const update = {
        sourceContent: makeDocument("Edited"),
        expectedCurrentRevisionId: created.currentRevisionId,
      }

      const edited = yield* decodePublicationComment(
        yield* request({
          path: `/publication-comments/${created.id}`,
          method: "PATCH",
          body: update,
        }),
      )

      expect(edited.editCount).toBe(1)

      expect(
        (yield* request({
          path: `/publication-comments/${created.id}`,
          method: "PATCH",
          body: update,
        })).status,
      ).toBe(409)

      session = VISITOR_SESSION
      expect(
        (yield* request({ path: `/publication-comments/${created.id}`, method: "DELETE" })).status,
      ).toBe(403)
      session = owner

      expect(
        (yield* request({
          path: `/publication-comments/${created.id}/censor`,
          method: "POST",
          body: {},
        })).status,
      ).toBe(403)

      const moderator = yield* makePersonFixture({ accessLevel: "MODERATOR" })
      yield* insertPersonWithDependencies({
        person: moderator,
        profile: yield* makeProfileFixture({ id: moderator.id }),
      })
      session = yield* resolveSessionFromAuthSubjectId(moderator.id)

      const censored = yield* decodePublicationComment(
        yield* request({
          path: `/publication-comments/${created.id}/censor`,
          method: "POST",
          body: {},
        }),
      )

      expect(censored.moderationStatus).toBe("CENSORED")
      session = VISITOR_SESSION
      expect((yield* request({ path: `/publication-comments/${created.id}` })).status).toBe(404)
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE publications SET visibility = 'COMMUNITY' WHERE id = ${existing.publicationId}`
      expect(
        (yield* request({ path: `/publication-comments/${publicationCommentId}` })).status,
      ).toBe(403)
      expect(
        (yield* request({ path: `/publication-comments?publicationId=${existing.publicationId}` }))
          .status,
      ).toBe(403)
      session = owner
      expect(
        (yield* request({ path: `/publication-comments/${created.id}`, method: "DELETE" })).status,
      ).toBe(200)
      expect((yield* request({ path: `/publication-comments/${reply.id}` })).status).toBe(404)
    }).pipe(Effect.provide(dependencies)),
)
