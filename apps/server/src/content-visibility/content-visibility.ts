import {
  canViewContent,
  PublicationNotFoundError,
  SessionContext,
  UnauthorizedError,
  type ModeratedPublicationRow,
} from "@gororobas/domain"
import { Effect, Option } from "effect"

import { findContentOwner } from "./queries.js"

/**
 * Applies `canViewContent` to one publication. Censored publications are hidden as if they didn't
 * exist; other publications someone can't see fail with `UnauthorizedError`.
 *
 * Lists filter with `visibleTo` in SQL instead, which follows the same rule.
 */
export const assertCanViewPublication = (
  publication: Pick<
    ModeratedPublicationRow,
    "id" | "moderationStatus" | "ownerProfileId" | "visibility"
  >,
) =>
  Effect.gen(function* () {
    const session = yield* SessionContext
    const owner = yield* findContentOwner(publication.ownerProfileId)

    // Owners are profiles, which deleting a publication's owner cascades to.
    if (Option.isNone(owner)) return yield* new PublicationNotFoundError({ id: publication.id })

    if (canViewContent(session, { ...publication, owner: owner.value })) return

    return yield* publication.moderationStatus === "CENSORED"
      ? new PublicationNotFoundError({ id: publication.id })
      : new UnauthorizedError({ session })
  })
