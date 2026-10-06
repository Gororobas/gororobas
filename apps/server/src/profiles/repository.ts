import { Context, Effect } from "effect"

import { deleteProfile, insertProfile, updateProfileRow } from "./mutations.js"
import {
  fetchProfileContentCounts,
  fetchProfileMetadata,
  findByHandle,
  findById,
  isHandleInUse,
} from "./queries.js"

export class ProfilesRepository extends Context.Service<ProfilesRepository>()(
  "ProfilesRepository",
  {
    make: Effect.succeed({
      delete: deleteProfile,
      fetchProfileContributions: (_handle: string) =>
        Effect.logDebug("fetchProfileContributions: stub").pipe(Effect.as([])),
      fetchProfileContentCounts,
      fetchProfileEvents: (_handle: string) =>
        Effect.logDebug("fetchProfileEvents: stub").pipe(Effect.as([])),
      fetchProfileMetadata,
      fetchProfilePosts: (_handle: string) =>
        Effect.logDebug("fetchProfilePosts: stub").pipe(Effect.as([])),
      fetchProfilePhotos: (_handle: string) =>
        Effect.logDebug("fetchProfilePhotos: stub").pipe(Effect.as([])),
      fetchProfileWishlist: (_handle: string) =>
        Effect.logDebug("fetchProfileWishlist: stub").pipe(Effect.as([])),
      findByHandle,
      findById,
      insertProfile,
      isHandleInUse,
      updateProfileRow,
    } as const),
  },
) {}
