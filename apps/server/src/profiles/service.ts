import {
  Handle,
  Policies,
  type ProfileBookmark,
  type ProfileBookmarksQuery,
  type ProfileCollectionQuery,
  type ProfilePhotosQuery,
  type ProfilePageData,
  type ProfileWikiContribution,
  type SupportedLanguage,
  type WikiArticleId,
  ProfileId,
  ProfileNotFoundError,
  ProfileRowUpdate,
  type ProfileRow,
  type MediaAssetId,
  currentSession,
} from "@gororobas/domain"
import { InvalidMediaAssetError } from "@gororobas/domain/media-assets/errors"
import { Array as EffectArray, DateTime, Effect, HashMap, Option, Context } from "effect"
import { SqlClient } from "effect/sql"

import { claimHandle } from "../common/handle-allocation.js"
import { withMediaCredits } from "../media-assets/credits.js"
import { MediaAssetsRepository } from "../media-assets/repository.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import {
  findPageLocation,
  listBookmarkedArticles,
  listBookmarkedKinds,
  listContributedArticles,
  listVisiblePhotos,
} from "./queries.js"
import { ProfilesRepository } from "./repository.js"

/** @effect-expect-leaking SqlClient */
export class ProfileService extends Context.Service<ProfileService>()("ProfileService", {
  make: Effect.gen(function* () {
    const repo = yield* ProfilesRepository
    const mediaAssets = yield* MediaAssetsRepository
    const wikiRepository = yield* WikiArticlesRepository
    const sql = yield* SqlClient.SqlClient

    const authorizeRead = (profile: Option.Option<ProfileRow>) =>
      Option.match(profile, {
        onNone: () => Effect.void,
        onSome: Policies.profiles.canRead,
      })

    const findByHandle = (handle: Handle) =>
      repo.findByHandle(handle).pipe(Effect.tap(authorizeRead))

    const findById = (profileId: ProfileId) =>
      repo.findById(profileId).pipe(Effect.tap(authorizeRead))

    /** A profile someone may read, or why not: it doesn't exist or isn't theirs to see. */
    const findReadable = (handle: Handle) =>
      Effect.gen(function* () {
        const maybeProfile = yield* repo.findByHandle(handle)
        if (Option.isNone(maybeProfile)) return yield* new ProfileNotFoundError({ handle })

        yield* Policies.profiles.canRead(maybeProfile.value)
        return maybeProfile.value
      })

    const getPage = (handle: Handle, language: SupportedLanguage) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const { location } = yield* findPageLocation({ profileId: profile.id, language })
        const areBookmarksVisible = yield* Policies.profiles.canReadBookmarks(profile).pipe(
          Effect.as(true),
          Effect.catchTag("UnauthorizedError", () => Effect.succeed(false)),
        )
        const bookmarkedKinds = areBookmarksVisible
          ? (yield* listBookmarkedKinds(profile.id)).map(({ kind }) => kind)
          : []

        return {
          ...profile,
          location,
          areBookmarksVisible,
          bookmarkedKinds,
        } satisfies ProfilePageData
      })

    /** Articles' cards in `language`, keyed by their ID; unpublished articles have none. */
    const cardsById = (
      wikiArticleIds: ReadonlyArray<WikiArticleId>,
      language: SupportedLanguage,
    ) =>
      EffectArray.isReadonlyArrayEmpty(wikiArticleIds)
        ? Effect.succeed(HashMap.empty())
        : wikiRepository
            .listCardsByIds({ wikiArticleIds, language })
            .pipe(Effect.map((cards) => HashMap.fromIterable(cards.map((card) => [card.id, card]))))

    const listBookmarks = (handle: Handle, { language, ...filters }: ProfileBookmarksQuery) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        yield* Policies.profiles.canReadBookmarks(profile)
        const bookmarks = yield* listBookmarkedArticles({ profileId: profile.id, ...filters })
        const cards = yield* cardsById(
          bookmarks.map((bookmark) => bookmark.wikiArticleId),
          language,
        )

        return bookmarks.flatMap(({ wikiArticleId, state }) =>
          EffectArray.fromOption(
            Option.map(HashMap.get(cards, wikiArticleId), (article): ProfileBookmark => ({
              state,
              article,
            })),
          ),
        )
      })

    const listWikiContributions = (
      handle: Handle,
      { language, currentPage }: ProfileCollectionQuery,
    ) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const contributions = yield* listContributedArticles({
          profileId: profile.id,
          currentPage,
        })
        const cards = yield* cardsById(
          contributions.map((contribution) => contribution.wikiArticleId),
          language,
        )

        return contributions.flatMap(({ wikiArticleId, ...contribution }) =>
          EffectArray.fromOption(
            Option.map(HashMap.get(cards, wikiArticleId), (article): ProfileWikiContribution => ({
              ...contribution,
              article,
            })),
          ),
        )
      })

    const listPhotos = (handle: Handle, { currentPage }: ProfilePhotosQuery) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const photos = yield* listVisiblePhotos(yield* currentSession)({
          profileId: profile.id,
          currentPage,
        })
        return yield* withMediaCredits(photos)
      })

    /** A profile's photo must be an image it uploaded itself. */
    const assertOwnImage = (profileId: ProfileId, photoId: MediaAssetId) =>
      Effect.gen(function* () {
        const asset = yield* mediaAssets.findMediaAssetById(photoId)

        if (
          Option.isNone(asset) ||
          asset.value.ownerProfileId !== profileId ||
          asset.value.format !== "IMAGE"
        ) {
          return yield* new InvalidMediaAssetError({
            message: "A profile photo must be an image its profile uploaded",
          })
        }
      })

    /** Someone's own current handle is available to them. */
    const isHandleAvailableTo = (profileId: ProfileId, handle: Handle) =>
      Effect.gen(function* () {
        const profile = yield* repo.findById(profileId)
        if (Option.exists(profile, (current) => current.handle === handle)) return true
        // The EXISTS query always returns a row.
        const inUse = yield* repo
          .isHandleInUse(handle)
          .pipe(Effect.catchTag("NoSuchElementError", Effect.die))
        return !inUse
      })

    const updateProfile = (profileId: ProfileId, data: ProfileRowUpdate) =>
      Effect.gen(function* () {
        const profile = yield* repo.findById(profileId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ProfileNotFoundError({ id: profileId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        yield* Policies.profiles.canEdit(profile)

        if (data.photoId !== undefined && data.photoId !== null) {
          yield* assertOwnImage(profileId, data.photoId)
        }

        if (data.handle !== undefined) {
          yield* claimHandle({
            handle: data.handle,
            entity: "profile",
            // Keeping one's current handle isn't a conflict.
            isAvailable: (handle) =>
              handle === profile.handle
                ? Effect.succeed(true)
                : repo.isHandleInUse(handle).pipe(Effect.map((inUse) => !inUse)),
          })
        }

        return yield* repo.updateProfileRow({
          id: profileId,
          ...data,
          updatedAt: yield* DateTime.now,
        })
      }).pipe(sql.withTransaction)

    return {
      findByHandle,
      findById,
      getPage,
      listBookmarks,
      listWikiContributions,
      listPhotos,
      isHandleAvailableTo,
      updateProfile,
    } as const
  }),
}) {}
