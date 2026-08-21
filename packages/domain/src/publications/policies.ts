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
import { OrganizationId } from "../common/ids.js"
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

  canView: (publication: Pick<CorePublicationMetadata, "ownerProfileId" | "visibility">) =>
    or(
      isPublicationOwner(publication),
      isPersonalPublicationPublic(publication),
      organizationPermission(
        "publications:view",
        Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
      ),
    ),

  canViewHistory: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    or(
      isPublicationOwner(publication),
      organizationPermission(
        "members:view",
        Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
      ),
    ),

  canViewContributors: (publication: Pick<CorePublicationMetadata, "ownerProfileId">) =>
    organizationPermission(
      "members:view",
      Schema.decodeSync(OrganizationId)(publication.ownerProfileId),
    ),
}
