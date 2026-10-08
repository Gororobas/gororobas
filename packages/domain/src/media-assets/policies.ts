import { Effect } from "effect"

import {
  allow,
  authenticatedPolicy,
  deny,
  or,
  platformPermission,
  policy,
} from "../authorization/policy.js"
import type { MediaAssetRow } from "./domain.js"

export const mediaPolicies = {
  canAttachToWikiArticle: platformPermission("wiki-article:revise"),
  canModerate: platformPermission("media:moderate"),
  canCreate: platformPermission("media:create"),
  canAttach: (
    media: Pick<MediaAssetRow, "ownerProfileId">,
    { isAlreadyAttached }: { isAlreadyAttached: boolean },
  ) =>
    platformPermission("media:create").pipe(
      Effect.flatMap(() =>
        authenticatedPolicy((session) =>
          isAlreadyAttached || session.personId === media.ownerProfileId
            ? allow(session)
            : deny("Only the uploader can attach or describe media"),
        ),
      ),
    ),
  canView: (
    media: Pick<MediaAssetRow, "ownerProfileId" | "moderationStatus">,
    audience: { hasWikiAttachment: boolean; canViewPublication: boolean; isAttached: boolean },
  ) =>
    policy((session) =>
      media.moderationStatus === "CENSORED"
        ? deny("Media is censored")
        : audience.hasWikiAttachment || audience.canViewPublication
          ? allow(session)
          : audience.isAttached
            ? deny()
            : or(
                authenticatedPolicy((session) =>
                  session.personId === media.ownerProfileId ? allow(session) : deny(),
                ),
                platformPermission("media:moderate"),
              ).pipe(Effect.map(allow)),
    ),
}
