import { Effect, Schema } from "effect"

import {
  allow,
  assertNonBlockedPerson,
  assertTrustedPerson,
  authenticatedPolicy,
  deny,
  or,
  organizationPermission,
  policy,
} from "../authorization/policy.js"
import type { PlatformAccessLevel } from "../common/enums.js"
import { OrganizationId } from "../common/ids.js"
import type { OrganizationRow } from "../organizations/domain.js"
import { organizationsPolicies } from "../organizations/policies.js"
import type { CorePublicationMetadata } from "./domain.js"

const isPublicationOwner = (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
  authenticatedPolicy((session) =>
    publication.ownerProfileId === session.personId ? allow(session) : deny(),
  )

const isPersonalPublicationPublic = (publication: Pick<CorePublicationMetadata, "visibility">) =>
  or(
    policy((session) => (publication.visibility === "PUBLIC" ? allow(session) : deny())),
    policy(() =>
      publication.visibility === "COMMUNITY" ? Effect.map(assertTrustedPerson, allow) : deny(),
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

  canEdit: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    or(
      isPublicationOwner(publication),
      organizationPermission(
        "publications:edit",
        Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
      ),
    ),

  canDelete: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    or(
      isPublicationOwner(publication),
      organizationPermission(
        "publications:delete",
        Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
      ),
    ),

  canView: (
    publication: Pick<CorePublicationMetadata, "ownerProfileId" | "visibility">,
    ownerAccessLevel?: PlatformAccessLevel,
  ) =>
    ownerAccessLevel === "NEWCOMER"
      ? or(
          isPublicationOwner(publication),
          authenticatedPolicy((session) =>
            session.accessLevel === "ADMIN" || session.accessLevel === "MODERATOR"
              ? allow(session)
              : deny(),
          ),
        )
      : or(
          isPublicationOwner(publication),
          isPersonalPublicationPublic(publication),
          organizationPermission(
            "publications:view",
            Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
          ),
        ),

  canViewHistory: canViewAttribution,
  canViewContributors: canViewAttribution,
}
