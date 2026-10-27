import {
  ApiPublicationCardData,
  ApiPublicationSearchParams,
  ContentLanguage,
  PublicationCrdt,
} from "@gororobas/domain"
/**
 * Publications service - business operations for publications.
 *
 * Based on BDD features in test/publications.feature:
 * - Create post/event publications with visibility (PUBLIC/COMMUNITY)
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
  SupportedLanguage,
  LoroDocFrontier,
  LoroDocUpdate,
  PostSourceData,
  Policies,
  PublicationId,
  PublicationNotFoundError,
  ProfileId,
  PersonId,
  OrganizationId,
  MediaAssetId,
  isCensored,
  type ModeratedPublicationRow,
  type ModerationDecision,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { LoroDoc } from "loro-crdt"

import { requestPublicationLinkInference } from "../link-inference/publication-link-inference-workflow.js"
import { MediaAssetsService } from "../media-assets/service.js"
import { moderateContent } from "../moderation/moderate-content.js"
import { findById as findOrganizationById } from "../organizations/queries.js"
import { findById as findPersonById } from "../people/queries.js"
import { HumanCrdtUpdate } from "./publication-repository-inputs.js"
import {
  listPublicationMediaAssets,
  findPublicationApiData,
  searchPublicationRows,
} from "./queries.js"
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

const UpdatePublicationData = Schema.Struct({
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})

export const UpdatePublicationInput = Schema.Struct({
  ...UpdatePublicationData.fields,
  publicationId: PublicationId,
})
export type UpdatePublicationInput = typeof UpdatePublicationInput.Type

/**
 * Censored publications are hidden from every reader but their authors, as if they didn't exist.
 *
 * Otherwise fetches the owner of the publication. If it's a person and they're a NEWCOMER,
 * Policies.publications.canView will ensure publications aren't truly public.
 **/
export const assertCanViewPublication = (
  publication: Pick<
    ModeratedPublicationRow,
    "id" | "moderationStatus" | "ownerProfileId" | "visibility"
  >,
) =>
  Effect.gen(function* () {
    if (isCensored(publication.moderationStatus)) {
      return yield* Policies.publications.canViewCensored(publication).pipe(
        Effect.catchTag("UnauthorizedError", () =>
          Effect.fail(new PublicationNotFoundError({ id: publication.id })),
        ),
        Effect.asVoid,
      )
    }

    const owner = yield* findPersonById(Schema.decodeSync(PersonId)(publication.ownerProfileId))
    yield* Policies.publications.canView(publication, Option.getOrUndefined(owner)?.accessLevel)
  })

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

      const getAttributionOrganization = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          const publication = yield* getPublicationById(publicationId)
          yield* assertCanViewPublication(publication)
          const organization = yield* findOrganizationById(
            Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
          )
          return Option.getOrUndefined(organization)
        })

      const attachMediaToPublication = (input: {
        publicationId: PublicationId
        mediaIds: readonly MediaAssetId[]
      }) =>
        Effect.gen(function* () {
          yield* Policies.publications.canEdit(yield* getPublicationById(input.publicationId))
          const existingMediaAttachments = yield* repo.listPublicationMediaAttachments(
            input.publicationId,
          )
          const media = yield* MediaAssetsService

          yield* repo.deletePublicationMediaAttachments(input.publicationId)

          yield* Effect.forEach(
            input.mediaIds,
            (mediaAssetId) =>
              Effect.gen(function* () {
                yield* media.getMediaForAttachment(mediaAssetId, {
                  isAlreadyAttached: existingMediaAttachments.some(
                    (row) => row.mediaAssetId === mediaAssetId,
                  ),
                })

                yield* repo.attachMediaToPublication({
                  publicationId: input.publicationId,
                  mediaAssetId,
                })
              }),
            { concurrency: 1 },
          )
        }).pipe((effect) => SqlClient.SqlClient.use((sql) => sql.withTransaction(effect)))

      const createPublication = (input: CreatePublicationInput) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.publications.canCreate(input)

          const sourceLanguage = input.sourceLanguage ?? ContentLanguage.make("und")

          const sourceContent = {
            sourceContent: input.content,
            sourceLanguage,
            translations: Schema.is(SupportedLanguage)(sourceLanguage)
              ? { [sourceLanguage]: "original" as const }
              : {},
          }

          const handle = input.handle ?? (yield* richTextToHandle(input.content))

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
                  ...sourceContent,
                  metadata: {
                    ...coreMetadata,
                    kind: "POST",
                  },
                })
              : EventSourceData.make({
                  ...sourceContent,
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

          if (input.mediaIds !== undefined) {
            yield* attachMediaToPublication({ publicationId, mediaIds: input.mediaIds })
          }

          return { id: publicationId, handle }
        }).pipe(
          (effect) => SqlClient.SqlClient.use((sql) => sql.withTransaction(effect)),
          Effect.tap(({ id }) => requestLinkInference(id)),
        )

      /** Best-effort, after the transaction commits, so the workflow reads the committed content. */
      const requestLinkInference = (publicationId: PublicationId) =>
        repo.findPublicationRowById(publicationId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: (row) =>
                requestPublicationLinkInference({
                  id: publicationId,
                  currentCrdtFrontier: row.currentCrdtFrontier,
                }),
            }),
          ),
          Effect.catchCause((cause) => Effect.logError("Link inference submission failed", cause)),
        )

      const updatePublication = (input: UpdatePublicationInput) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.publications.canEdit(yield* getPublicationById(input.publicationId))

          yield* repo
            .updatePublication(
              HumanCrdtUpdate.make({
                authorId: session.personId,
                crdtUpdate: input.crdtUpdate,
                expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
                publicationId: input.publicationId,
              }),
            )
            .pipe(
              // Only system translations can be stale; a human edit never produces this error.
              Effect.catchTag("StalePublicationTranslationError", Effect.die),
            )

          if (input.mediaIds !== undefined) {
            yield* attachMediaToPublication({
              publicationId: input.publicationId,
              mediaIds: input.mediaIds,
            })
          }
        }).pipe(
          (effect) => SqlClient.SqlClient.use((sql) => sql.withTransaction(effect)),
          Effect.tap(() => requestLinkInference(input.publicationId)),
        )

      const deletePublication = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* Policies.publications.canDelete(yield* getPublicationById(publicationId))

          yield* repo.deletePublication(publicationId)
        })

      const getPublicationPageData = (handle: Handle, language: SupportedLanguage = "pt") =>
        Effect.gen(function* () {
          yield* assertCanViewPublication(yield* getPublicationByHandle(handle))

          const page = yield* repo.findPublicationPageData({ handle, language }).pipe(
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
          yield* Policies.publications.canViewContributors(
            yield* getAttributionOrganization(publicationId),
          )

          return yield* repo.listPublicationContributorIdsByPublicationId(publicationId)
        })

      const getHistory = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* assertCanViewPublication(yield* getPublicationById(publicationId))
          yield* Policies.publications.canViewHistory(
            yield* getAttributionOrganization(publicationId),
          )

          return yield* repo.listPublicationCommitRowsByPublicationIdAsc(publicationId)
        })

      const getApiHistory = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          const rows = yield* getHistory(publicationId)
          const document = new LoroDoc()

          return yield* Effect.forEach(
            rows,
            (row, index) =>
              Effect.gen(function* () {
                document.import(row.crdtUpdate)
                const data = yield* PublicationCrdt.read(document)

                return {
                  authorId: row.createdById ? ProfileId.make(row.createdById) : null,
                  content: data.sourceContent,
                  createdAt: row.createdAt,
                  version: index + 1,
                }
              }),
            { concurrency: 1 },
          )
        })

      const listPublicationMedia = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* assertCanViewPublication(yield* getPublicationById(publicationId))
          return yield* listPublicationMediaAssets(publicationId)
        })

      const getPublicationData = (id: PublicationId) =>
        Effect.gen(function* () {
          yield* assertCanViewPublication(yield* getPublicationById(id))
          const data = yield* findPublicationApiData(id)
          if (Option.isNone(data)) return yield* new PublicationNotFoundError({ id })
          return data.value
        })

      const searchPublications = (query: typeof ApiPublicationSearchParams.Type) =>
        Effect.gen(function* () {
          const rows = yield* searchPublicationRows(query)

          const visible = yield* Effect.filter(rows, (row) =>
            assertCanViewPublication(row).pipe(
              Effect.as(true),
              Effect.catchTags({
                UnauthorizedError: () => Effect.succeed(false),
                PublicationNotFoundError: () => Effect.succeed(false),
              }),
            ),
          )

          return visible
            .slice(query.currentPage * query.pageSize, (query.currentPage + 1) * query.pageSize)
            .map((row) => ApiPublicationCardData.make(row))
        })

      const moderate = (input: { id: PublicationId; moderationStatus: ModerationDecision }) =>
        moderateContent({
          contentType: "PUBLICATION",
          id: input.id,
          decision: input.moderationStatus,
          notFound: () => new PublicationNotFoundError({ id: input.id }),
        })

      return {
        moderate,
        searchPublications,
        attachMediaToPublication,
        getPublicationData,
        listPublicationMedia,
        getPublicationById,
        getPublicationByHandle,
        createPublication,
        delete: deletePublication,
        updatePublication,
        getPublicationPageData,
        getHistory,
        getApiHistory,
        getContributors,
      } as const
    }),
  },
) {}
