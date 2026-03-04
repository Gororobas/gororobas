import { Effect, Schema } from "effect"

import {
  allow,
  assertTrustedPerson,
  authenticatedPolicy,
  deny,
  organizationPermission,
  or,
  policy,
} from "../authorization/policy.js"
import { OrganizationId } from "../common/ids.js"
import type { CorePostMetadata } from "./domain.js"

const isPostOwner = (post: Pick<CorePostMetadata, "ownerProfileId">) =>
  authenticatedPolicy((session) =>
    post.ownerProfileId === session.personId ? allow(session) : deny(),
  )

const isPersonalPostPublic = (post: Pick<CorePostMetadata, "visibility">) =>
  or(
    policy((session) => (post.visibility === "PUBLIC" ? allow(session) : deny())),
    policy(() =>
      post.visibility === "COMMUNITY" ? Effect.map(assertTrustedPerson, allow) : deny(),
    ),
  )

export const postsPolicies = {
  canCreate: (post: Pick<CorePostMetadata, "ownerProfileId">) =>
    or(
      isPostOwner(post),
      organizationPermission(
        "posts:create:organization",
        Schema.decodeSync(OrganizationId)(post.ownerProfileId),
      ),
    ),

  canEdit: (post: Pick<CorePostMetadata, "ownerProfileId">) =>
    or(
      isPostOwner(post),
      organizationPermission("posts:edit", Schema.decodeSync(OrganizationId)(post.ownerProfileId)),
    ),

  canDelete: (post: Pick<CorePostMetadata, "ownerProfileId">) =>
    or(
      isPostOwner(post),
      organizationPermission(
        "posts:delete",
        Schema.decodeSync(OrganizationId)(post.ownerProfileId),
      ),
    ),

  canView: (post: Pick<CorePostMetadata, "ownerProfileId" | "visibility">) =>
    or(
      isPersonalPostPublic(post),
      organizationPermission("posts:view", Schema.decodeSync(OrganizationId)(post.ownerProfileId)),
    ),

  canViewHistory: (post: Pick<CorePostMetadata, "ownerProfileId">) =>
    or(
      isPostOwner(post),
      organizationPermission(
        "members:view",
        Schema.decodeSync(OrganizationId)(post.ownerProfileId),
      ),
    ),

  canViewContributors: (post: Pick<CorePostMetadata, "ownerProfileId">) =>
    organizationPermission("members:view", Schema.decodeSync(OrganizationId)(post.ownerProfileId)),
}
