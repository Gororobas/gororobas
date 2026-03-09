/**
 * Posts service - business operations for posts.
 *
 * Based on BDD features in test/posts.feature:
 * - Create note/event posts with visibility (PUBLIC/COMMUNITY/PRIVATE)
 * - Edit posts with history tracking
 * - Delete posts
 * - View post history
 */
import {
  assertAuthenticated,
  contentToHandle,
  CorePostMetadata,
  CreateEventData,
  CreateNoteData,
  EventSourceData,
  Handle,
  Locale,
  NoteSourceData,
  PersonId,
  Policies,
  PostId,
  PostLocalizedData,
  PostNotFoundError,
  ProfileId,
  UpdateNoteData,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema, ServiceMap } from "effect"

import { HumanUpdatePtContent } from "./post-repository-inputs.js"
import { PostsRepository } from "./repository.js"

export const CreateNoteInput = Schema.Struct({
  ...CreateNoteData.fields,
  kind: Schema.Literal("NOTE"),
  ownerProfileId: ProfileId,
})
export type CreateNoteInput = typeof CreateNoteInput.Type

export const CreateEventInput = Schema.Struct({
  ...CreateEventData.fields,
  kind: Schema.Literal("EVENT"),
  ownerProfileId: ProfileId,
})
export type CreateEventInput = typeof CreateEventInput.Type

export const CreatePostInput = Schema.Union([CreateNoteInput, CreateEventInput])
export type CreatePostInput = typeof CreatePostInput.Type

export const UpdatePostInput = Schema.Struct({
  ...UpdateNoteData.fields,
  authorId: PersonId,
  postId: PostId,
})
export type UpdatePostInput = typeof UpdatePostInput.Type

export class PostsService extends ServiceMap.Service<PostsService>()("PostsService", {
  make: Effect.gen(function* () {
    const repo = yield* PostsRepository

    const getPostById = (postId: PostId) =>
      repo.findPostRowById(postId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new PostNotFoundError({ id: postId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const getPostByHandle = (handle: Handle) =>
      repo.findPostRowByHandle(handle).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new PostNotFoundError({ handle })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const createPost = (input: CreatePostInput) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        yield* Policies.posts.canCreate(input)

        const { locale } = input
        const localeData = PostLocalizedData.makeUnsafe({
          content: input.content,
          originalLocale: locale,
          translatedAtCrdtFrontier: null,
          translationSource: "ORIGINAL",
        })

        const handle = contentToHandle(input.content)

        const now = yield* DateTime.now
        const coreMetadata = CorePostMetadata.makeUnsafe({
          handle,
          ownerProfileId: input.ownerProfileId,
          publishedAt: now,
          visibility: input.visibility,
        })

        const sourceData: NoteSourceData | EventSourceData =
          input.kind === "NOTE"
            ? NoteSourceData.makeUnsafe({
                locales: {
                  [locale]: localeData,
                },
                metadata: {
                  ...coreMetadata,
                  kind: "NOTE",
                },
              })
            : EventSourceData.makeUnsafe({
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

        const postId = yield* repo.createPost({
          createdById: session.personId,
          sourceData,
        })

        return { id: postId, handle }
      })

    const updatePost = (input: UpdatePostInput) =>
      Effect.gen(function* () {
        yield* Policies.posts.canEdit(yield* getPostById(input.postId))

        yield* repo.updatePost(
          HumanUpdatePtContent.makeUnsafe({
            authorId: input.authorId,
            content: input.content,
            postId: input.postId,
          }),
        )
      })

    const deletePost = (postId: PostId) =>
      Effect.gen(function* () {
        yield* Policies.posts.canDelete(yield* getPostById(postId))

        yield* repo.deletePost(postId)
      })

    const getPostPageData = (handle: Handle, locale: Locale = "pt") =>
      Effect.gen(function* () {
        yield* Policies.posts.canView(yield* getPostByHandle(handle))

        const page = yield* repo.findPostPageData({ handle, locale }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ handle })),
              onSome: Effect.succeed,
            }),
          ),
        )

        return page
      })

    const getContributors = (postId: PostId) =>
      Effect.gen(function* () {
        yield* Policies.posts.canViewContributors(yield* getPostById(postId))

        return yield* repo.listPostContributorIdsByPostId(postId)
      })

    const getHistory = (postId: PostId) =>
      Effect.gen(function* () {
        yield* Policies.posts.canViewHistory(yield* getPostById(postId))

        return yield* repo.listPostCommitRowsByPostIdAsc(postId)
      })

    return {
      createPost,
      delete: deletePost,
      updatePost,
      getPostPageData,
      getHistory,
      getContributors,
    } as const
  }),
}) {}
