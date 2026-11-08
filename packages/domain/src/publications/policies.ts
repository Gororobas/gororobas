import { Effect, Schema } from "effect"

import {
  allow,
  assertNonBlockedPerson,
  authenticatedPolicy,
  deny,
  or,
  organizationPermission,
  policy,
} from "../authorization/policy.js"
import { OrganizationId } from "../common/ids.js"
import { canViewContent, type ViewableContent } from "../content-visibility/domain.js"
import type { OrganizationRow } from "../organizations/domain.js"
import { organizationsPolicies } from "../organizations/policies.js"
import type { CorePublicationMetadata } from "./domain.js"

const isPublicationOwner = (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
  authenticatedPolicy((session) =>
    publication.ownerProfileId === session.personId ? allow(session) : deny(),
  )

/** Blocked people can't rewrite what they published, though they can still delete it. */
const canEdit = (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
  assertNonBlockedPerson.pipe(
    Effect.flatMap(() =>
      or(
        isPublicationOwner(publication),
        organizationPermission(
          "publications:edit",
          Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
        ),
      ),
    ),
  )

const canViewAttribution = (organization: OrganizationRow | undefined) =>
  organization ? organizationsPolicies.canViewMembers(organization) : policy(allow)

export const publicationsPolicies = {
  canCreate: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    assertNonBlockedPerson.pipe(
      Effect.flatMap(() =>
        or(
          isPublicationOwner(publication),
          organizationPermission(
            "publications:create:organization",
            Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
          ),
        ),
      ),
    ),

  canEdit,

  canDelete: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    or(
      isPublicationOwner(publication),
      organizationPermission(
        "publications:delete",
        Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
      ),
    ),

  /** See `canViewContent`. */
  canView: (content: ViewableContent) =>
    policy((session) => (canViewContent(session, content) ? allow(session) : deny())),

  canViewHistory: canViewAttribution,
  canViewContributors: canViewAttribution,
}
