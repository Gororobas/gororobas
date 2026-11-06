import {
  Handle,
  Policies,
  type ProfileBookmark,
  type ProfilePageData,
  type ProfileWikiContribution,
  SessionContext,
  type SupportedLanguage,
  type WikiArticleId,
  ProfileId,
  ProfileNotFoundError,
  ProfileRowUpdate,
  type ProfileRow,
} from "@gororobas/domain"
import { Array as EffectArray, DateTime, Effect, HashMap, Option, Context } from "effect"
import { SqlClient } from "effect/sql"

import { claimHandle } from "../common/handle-allocation.js"
import { withMediaCredits } from "../media-assets/credits.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import {
  findPageLocation,
  listBookmarkedArticles,
  listContributedArticles,
  listVisiblePhotos,
} from "./queries.js"
import { ProfilesRepository } from "./repository.js"

/** @effect-expect-leaking SqlClient */
export class ProfileService extends Context.Service<ProfileService>()("ProfileService", {
  make: Effect.gen(function* () {
    const repo = yield* ProfilesRepository
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
        return { ...profile, location } satisfies ProfilePageData
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

    const listBookmarks = (handle: Handle, language: SupportedLanguage) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const bookmarks = yield* listBookmarkedArticles(profile.id)
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

    const listWikiContributions = (handle: Handle, language: SupportedLanguage) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const contributions = yield* listContributedArticles(profile.id)
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

    const listPhotos = (handle: Handle) =>
      Effect.gen(function* () {
        const profile = yield* findReadable(handle)
        const photos = yield* listVisiblePhotos(yield* SessionContext)(profile.id)
        return yield* withMediaCredits(photos)
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
      updateProfile,
    } as const
  }),
}) {}
