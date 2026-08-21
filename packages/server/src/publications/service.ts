/**
 * Publications service - business operations for publications.
 *
 * Based on BDD features in test/publications.feature:
 * - Create post/event publications with visibility (PUBLIC/COMMUNITY/PRIVATE)
 * - Edit publications with history tracking
 * - Delete publications
 * - View publication history
 */
import {
  assertAuthenticated,
  richTextToHandle,
  CorePublicationMetadata,
  CreateEventData,
  CreatePostData,
  EventSourceData,
  Handle,
  Locale,
  LoroDocFrontier,
  LoroDocUpdate,
  PostSourceData,
  Policies,
  PublicationId,
  PublicationLocalizedData,
  PublicationNotFoundError,
  ProfileId,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Option, Schema } from "effect"

import { HumanCrdtUpdate } from "./publication-repository-inputs.js"
import { PublicationsRepository } from "./repository.js"

export const CreatePostInput = Schema.Struct({
  ...CreatePostData.fields,
  kind: Schema.Literal("POST"),
  ownerProfileId: ProfileId,
})
export type CreatePostInput = typeof CreatePostInput.Type

export const CreateEventInput = Schema.Struct({
  ...CreateEventData.fields,
  kind: Schema.Literal("EVENT"),
  ownerProfileId: ProfileId,
})
export type CreateEventInput = typeof CreateEventInput.Type

export const CreatePublicationInput = Schema.Union([CreatePostInput, CreateEventInput])
export type CreatePublicationInput = typeof CreatePublicationInput.Type

const UpdatePostData = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})

export const UpdatePublicationInput = Schema.Struct({
  ...UpdatePostData.fields,
  publicationId: PublicationId,
})
export type UpdatePublicationInput = typeof UpdatePublicationInput.Type

export class PublicationsService extends Context.Service<PublicationsService>()(
  "PublicationsService",
  {
    make: Effect.gen(function* () {
      const repo = yield* PublicationsRepository

      const getPublicationById = (publicationId: PublicationId) =>
        repo.findPublicationRowById(publicationId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PublicationNotFoundError({ id: publicationId })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const getPublicationByHandle = (handle: Handle) =>
        repo.findPublicationRowByHandle(handle).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PublicationNotFoundError({ handle })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const createPublication = (input: CreatePublicationInput) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.publications.canCreate(input)

          const { locale } = input
          const localeData = PublicationLocalizedData.make({
            content: input.content,
            originalLocale: locale,
            translatedAtCrdtFrontier: null,
            translationSource: "ORIGINAL",
          })

          const handle = yield* richTextToHandle(input.content)

          const now = yield* DateTime.now
          const coreMetadata = CorePublicationMetadata.make({
            handle,
            ownerProfileId: input.ownerProfileId,
            publishedAt: now,
            visibility: input.visibility,
          })

          const sourceData: PostSourceData | EventSourceData =
            input.kind === "POST"
              ? PostSourceData.make({
                  locales: {
                    [locale]: localeData,
                  },
                  metadata: {
                    ...coreMetadata,
                    kind: "POST",
                  },
                })
              : EventSourceData.make({
                  locales: {
                    [locale]: localeData,
                  },
                  metadata: {
                    ...coreMetadata,
                    kind: "EVENT",
                    startDate: input.startDate,
                    attendanceMode: input.attendanceMode ?? null,
                    endDate: input.endDate ?? null,
                    locationOrUrl: input.locationOrUrl ?? null,
                  },
                })

          const publicationId = yield* repo.createPublication({
            createdById: session.personId,
            sourceData,
          })

          return { id: publicationId, handle }
        })

      const updatePublication = (input: UpdatePublicationInput) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.publications.canEdit(yield* getPublicationById(input.publicationId))

          yield* repo.updatePublication(
            HumanCrdtUpdate.make({
              authorId: session.personId,
              crdtUpdate: input.crdtUpdate,
              expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
              publicationId: input.publicationId,
            }),
          )
        })

      const deletePublication = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* Policies.publications.canDelete(yield* getPublicationById(publicationId))

          yield* repo.deletePublication(publicationId)
        })

      const getPublicationPageData = (handle: Handle, locale: Locale = "pt") =>
        Effect.gen(function* () {
          yield* Policies.publications.canView(yield* getPublicationByHandle(handle))

          const page = yield* repo.findPublicationPageData({ handle, locale }).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new PublicationNotFoundError({ handle })),
                onSome: Effect.succeed,
              }),
            ),
          )

          return page
        })

      const getContributors = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* Policies.publications.canViewContributors(yield* getPublicationById(publicationId))

          return yield* repo.listPublicationContributorIdsByPublicationId(publicationId)
        })

      const getHistory = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* Policies.publications.canViewHistory(yield* getPublicationById(publicationId))

          return yield* repo.listPublicationCommitRowsByPublicationIdAsc(publicationId)
        })

      return {
        createPublication,
        delete: deletePublication,
        updatePublication,
        getPublicationPageData,
        getHistory,
        getContributors,
      } as const
    }),
  },
) {}
