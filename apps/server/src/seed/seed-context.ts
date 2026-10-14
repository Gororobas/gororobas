import type {
  Handle,
  OrganizationAccessLevel,
  OrganizationId,
  PersonId,
  PlatformAccessLevel,
  ProfileId,
  PublicationId,
  PublicationVisibility,
  TagId,
  WikiArticleId,
  WikiArticleKind,
  WikiArticleStatus,
} from "@gororobas/domain"

import type { Mention } from "./rich-text.js"
import type { SeedMedia } from "./seed-media.js"
import type { SeedTimeline } from "./seed-timeline.js"
import type { CatalogPlant, Localized } from "./vocabulary.js"

export interface SeededPerson {
  readonly id: PersonId
  readonly handle: Handle
  readonly name: string
  readonly email: string
  readonly accessLevel: PlatformAccessLevel
  readonly joinedAt: number
}

export interface SeededOrganization {
  readonly id: OrganizationId
  readonly handle: Handle
  readonly name: string
  readonly createdAt: number
  readonly members: ReadonlyArray<{
    readonly personId: PersonId
    readonly accessLevel: OrganizationAccessLevel
  }>
}

export interface SeededTag {
  readonly id: TagId
  readonly names: Localized
}

export interface SeededArticle {
  readonly id: WikiArticleId
  readonly kind: WikiArticleKind
  readonly names: Localized
  readonly plant: CatalogPlant | undefined
  readonly status: WikiArticleStatus
  readonly createdAt: number
}

export interface SeededPublication {
  readonly id: PublicationId
  readonly handle: Handle
  readonly ownerProfileId: ProfileId
  readonly visibility: PublicationVisibility
  readonly createdAt: number
}

/** Rows created by earlier phases, used by later ones as authors and references. */
export interface SeedContext {
  readonly timeline: SeedTimeline
  readonly media: SeedMedia
  readonly people: ReadonlyArray<SeededPerson>
  readonly organizations: ReadonlyArray<SeededOrganization>
  readonly tags: ReadonlyArray<SeededTag>
  readonly articles: ReadonlyArray<SeededArticle>
  readonly publications: ReadonlyArray<SeededPublication>
}

/** People who can act in the community: create articles, review, comment. */
export const activePeople = (context: Pick<SeedContext, "people">) =>
  context.people.filter((person) => person.accessLevel !== "BLOCKED")

export const trustedPeople = (context: Pick<SeedContext, "people">) =>
  context.people.filter(
    (person) =>
      person.accessLevel === "COMMUNITY" ||
      person.accessLevel === "MODERATOR" ||
      person.accessLevel === "ADMIN",
  )

export const reviewers = (context: Pick<SeedContext, "people">) =>
  context.people.filter(
    (person) => person.accessLevel === "MODERATOR" || person.accessLevel === "ADMIN",
  )

/** Entities rich text can reference: people, organizations, articles, tags and publications. */
export const mentionsFor = (context: Partial<SeedContext>): ReadonlyArray<Mention> => [
  ...(context.people ?? []).slice(0, 50).map((person): Mention => ({
    referenceType: "PROFILE",
    referenceId: person.id,
    label: person.name,
  })),
  ...(context.organizations ?? []).slice(0, 20).map((organization): Mention => ({
    referenceType: "PROFILE",
    referenceId: organization.id,
    label: organization.name,
  })),
  ...(context.articles ?? [])
    .filter((article) => article.status === "PUBLISHED")
    .slice(0, 80)
    .map((article): Mention => ({
      referenceType: "WIKI_ARTICLE",
      referenceId: article.id,
      label: article.names.pt,
    })),
  ...(context.tags ?? []).map((tag): Mention => ({
    referenceType: "TAG",
    referenceId: tag.id,
    label: tag.names.pt,
  })),
  ...(context.publications ?? []).slice(0, 40).map((publication): Mention => ({
    referenceType: "PUBLICATION",
    referenceId: publication.id,
    label: publication.handle,
  })),
]
