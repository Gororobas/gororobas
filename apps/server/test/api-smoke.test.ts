/**
 * Calls every endpoint of `GororobasApi` as each seeded persona and as a visitor, through the
 * production HTTP stack. Responses must be a decoded success or one of the endpoint's declared
 * errors: an undeclared status (such as a 500 from an unimplemented handler), a body that doesn't
 * decode, or a defect fails the test.
 *
 * Authorization rules themselves are specified by the `.feature` files; this catches wiring,
 * placeholder handlers and contract drift. Every endpoint must have a request below.
 */
import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import {
  GororobasApi,
  Handle,
  LoroDocFrontier,
  LoroDocUpdate,
  MediaAssetId,
  OrganizationId,
  PersonId,
  ProfileId,
  PublicationCommentContentRevisionId,
  PublicationCommentId,
  PublicationId,
  WikiArticleCommonNameInCrdtList,
  WikiArticleId,
  WikiArticleKind,
  WikiArticleRevisionId,
  WikiConceptArticle,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Cause,
  ConfigProvider,
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Record,
  Schema,
} from "effect"
import { HttpApi } from "effect/http-api"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { IdGenLive } from "../src/id-gen-live.js"
import { DEFAULT_SEED, seedDatabase } from "../src/seed/seed-database.js"
import { AppSqlTest } from "../src/sql.js"
import { ApiTestClient } from "./api-test-client.js"
import { textToRichTextDocument } from "./feature-test-helpers.js"

const PERSONAS = ["visitor", "admin", "moderator", "community", "newcomer", "blocked"] as const
type Persona = (typeof PERSONAS)[number]

/** Client-side failures that mean the server broke its contract rather than refusing a request. */
const CONTRACT_FAILURES = ["HttpClientError", "SchemaError"]

const one = <A extends Schema.Top>(Result: A, query: string) =>
  SqlSchema.findOne({
    Request: Schema.Void,
    Result,
    execute: () => SqlClient.SqlClient.use((sql) => sql.unsafe(query)),
  })()

const SeededTargets = Effect.gen(function* () {
  const publication = yield* one(
    Schema.Struct({ id: PublicationId, handle: Handle, ownerProfileId: ProfileId }),
    `SELECT p.id, p.handle, p.owner_profile_id FROM publications p
     JOIN publication_crdts c ON c.id = p.id
     WHERE p.visibility = 'PUBLIC' AND c.moderation_status = 'APPROVED_BY_DEFAULT'
     ORDER BY p.id LIMIT 1`,
  )

  const comment = yield* one(
    Schema.Struct({
      id: PublicationCommentId,
      currentRevisionId: PublicationCommentContentRevisionId,
    }),
    `SELECT c.id, (SELECT r.id FROM publication_comment_content_revisions r
       WHERE r.publication_comment_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS current_revision_id
     FROM publication_comments c ORDER BY c.id LIMIT 1`,
  )

  const image = yield* one(
    Schema.Struct({ id: MediaAssetId }),
    `SELECT id FROM media_assets WHERE format = 'IMAGE' ORDER BY id LIMIT 1`,
  )

  const article = yield* one(
    Schema.Struct({ id: WikiArticleId, kind: WikiArticleKind, handle: Handle }),
    `SELECT a.id, a.kind, h.handle FROM wiki_articles a
     JOIN wiki_article_handles h ON h.wiki_article_id = a.id
     WHERE a.status = 'PUBLISHED' ORDER BY a.id LIMIT 1`,
  )

  // Holds relations to and from published articles, so links in both directions decode.
  const relatedArticle = yield* one(
    Schema.Struct({ kind: WikiArticleKind, handle: Handle }),
    `SELECT a.kind, h.handle FROM wiki_article_relations r
     JOIN wiki_articles a ON a.id = r.related_wiki_article_id
     JOIN wiki_articles holder ON holder.id = r.wiki_article_id
     JOIN wiki_article_handles h ON h.wiki_article_id = a.id
     WHERE a.status = 'PUBLISHED' AND holder.status = 'PUBLISHED'
       AND EXISTS (SELECT 1 FROM wiki_article_relations outgoing
         JOIN wiki_articles target ON target.id = outgoing.related_wiki_article_id
         WHERE outgoing.wiki_article_id = a.id AND target.status = 'PUBLISHED')
     ORDER BY a.id LIMIT 1`,
  )

  const articleMedia = yield* one(
    Schema.Struct({ wikiArticleId: WikiArticleId, mediaAssetId: MediaAssetId }),
    `SELECT wiki_article_id, media_asset_id FROM wiki_article_media_assets ORDER BY wiki_article_id LIMIT 1`,
  )
  const pendingRevision = yield* one(
    Schema.Struct({ id: WikiArticleRevisionId }),
    `SELECT id FROM wiki_article_revisions WHERE evaluation = 'PENDING' ORDER BY id LIMIT 1`,
  )
  const organization = yield* one(
    Schema.Struct({ id: OrganizationId, memberId: PersonId }),
    `SELECT organization_id AS id, person_id AS member_id FROM organization_memberships ORDER BY organization_id LIMIT 1`,
  )

  const generatedNewcomer = yield* one(
    Schema.Struct({ id: PersonId }),
    `SELECT p.id FROM people p JOIN profiles pr ON pr.id = p.id
     WHERE p.access_level = 'NEWCOMER' AND pr.handle <> 'newcomer' ORDER BY p.id LIMIT 1`,
  )

  const profile = yield* one(
    Schema.Struct({ handle: Handle }),
    `SELECT handle FROM profiles WHERE visibility = 'PUBLIC' ORDER BY id LIMIT 1`,
  )

  return {
    publication,
    comment,
    image,
    article,
    relatedArticle,
    articleMedia,
    pendingRevision,
    organization,
    generatedNewcomer,
    profile,
  }
})

type Targets = Effect.Success<typeof SeededTargets>
type Client = Effect.Success<ApiTestClient["Service"]["visitor"]>

const conceptArticle = (name: string) =>
  WikiConceptArticle.EditableArticle.make({
    kind: "CONCEPT",
    attributes: WikiConceptArticle.EditableAttributes.make({}),
    translations: {
      pt: {
        commonNames: [
          Schema.decodeSync(WikiArticleCommonNameInCrdtList)({ id: "smokeconcept", name }),
        ],
        content: Option.none(),
      },
    },
  })

/** A 1×1 transparent PNG. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
)

const emptyUpdate = LoroDocUpdate.make(new Uint8Array())
const emptyFrontier = LoroDocFrontier.make([])

/**
 * One request per endpoint. Requests that create something feed later ones (`created`), so
 * destructive endpoints act on what the persona just made rather than on shared seed data.
 */
/** What a persona's own requests created, for later requests to act on. */
interface CreatedDuringSmoke {
  publicationId?: PublicationId
  commentId?: PublicationCommentId
  organizationId?: OrganizationId
}

const requests = ({
  client,
  targets,
  persona,
}: {
  client: Client
  targets: Targets
  persona: Persona
}) => {
  const created: CreatedDuringSmoke = {}

  const handle = Schema.decodeSync(Handle)(`smoke-${persona}`)

  return {
    // Reads
    "publications.searchPublications": () =>
      client.publications.searchPublications({ query: { pageSize: 10, currentPage: 0 } }),

    "publications.getPublication": () =>
      client.publications.getPublication({ params: { id: targets.publication.id } }),
    "publications.getPublicationByHandle": () =>
      client.publications.getPublicationByHandle({
        params: { handle: targets.publication.handle },
      }),
    "publications.getPublicationHistory": () =>
      client.publications.getPublicationHistory({ params: { id: targets.publication.id } }),
    "publicationComments.getPublicationComments": () =>
      client.publicationComments.getPublicationComments({
        query: { publicationId: targets.publication.id },
      }),
    "publicationComments.getPublicationComment": () =>
      client.publicationComments.getPublicationComment({ params: { id: targets.comment.id } }),
    "mediaAssets.getMedia": () =>
      client.mediaAssets.getMedia({
        params: { id: targets.image.id, format: "images", variant: "300" },
      }),
    "organizations.listMembers": () =>
      client.organizations.listMembers({ params: { id: targets.organization.id } }),
    "people.getMyProfile": () => client.people.getMyProfile(),
    "profiles.searchProfiles": () => client.profiles.searchProfiles({ query: { text: "a" } }),
    "profiles.getProfileByHandle": () =>
      client.profiles.getProfileByHandle({ params: { handle: targets.profile.handle } }),
    "profiles.handleAvailability": () => client.profiles.handleAvailability({ query: { handle } }),
    "wiki.suggestBookIds": () => client.wiki.suggestBookIds({ query: { title: "Agrofloresta" } }),
    "wiki.getWikiArticleDebug": () =>
      client.wiki.getWikiArticleDebug({ params: { wikiArticleId: targets.article.id } }),
    "wiki.getWikiBookmarks": () => client.wiki.getWikiBookmarks(),
    "wiki.getWikiRevisionHistory": () =>
      client.wiki.getWikiRevisionHistory({
        params: { kind: targets.article.kind, handle: targets.article.handle },
      }),
    "wiki.searchWikiArticles": () => client.wiki.searchWikiArticles({ query: { language: "pt" } }),
    "wiki.getWikiArticleByHandleAndKind": () =>
      client.wiki.getWikiArticleByHandleAndKind({
        params: { kind: targets.article.kind, handle: targets.article.handle },
        query: { language: "pt" },
      }),
    "wiki.listRelatedWikiArticles": () =>
      client.wiki.listRelatedWikiArticles({
        params: { kind: targets.relatedArticle.kind, handle: targets.relatedArticle.handle },
        query: { language: "pt" },
      }),
    "wiki.listWikiArticleBookmarkers": () =>
      client.wiki.listWikiArticleBookmarkers({
        params: { kind: targets.article.kind, handle: targets.article.handle },
      }),
    "wiki.listWikiArticleContributors": () =>
      client.wiki.listWikiArticleContributors({
        params: { kind: targets.article.kind, handle: targets.article.handle },
      }),
    "wiki.listWikiArticleCultivars": () =>
      client.wiki.listWikiArticleCultivars({
        params: { kind: targets.article.kind, handle: targets.article.handle },
        query: { language: "pt" },
      }),
    "moderation.getModerationQueue": () => client.moderation.getModerationQueue(),

    // Creation
    "people.completeOnboarding": () =>
      client.people.completeOnboarding({ payload: { name: `Smoke ${persona}` } }),
    "people.updateProfile": () =>
      client.people.updateProfile({ payload: { location: "Brasília, DF" } }),
    "mediaAssets.uploadMedia": () => {
      const form = new FormData()
      form.append("file", new Blob([PNG], { type: "image/png" }), "pixel.png")
      return client.mediaAssets.uploadMedia({ payload: form })
    },
    "publications.createPublication": () =>
      Effect.gen(function* () {
        const me = yield* client.people.getMyProfile()

        const created_ = yield* client.publications.createPublication({
          params: { profileId: me?.id ?? targets.publication.ownerProfileId },
          payload: {
            kind: "POST",
            handle,
            visibility: "PUBLIC",
            content: textToRichTextDocument(`Publicação de ${persona}`),
          },
        })

        created.publicationId = created_.id
        return created_
      }),
    "publications.updatePublication": () =>
      client.publications.updatePublication({
        params: { id: created.publicationId ?? targets.publication.id },
        payload: { crdtUpdate: emptyUpdate, expectedCurrentCrdtFrontier: emptyFrontier },
      }),
    "publicationComments.createPublicationComment": () =>
      Effect.tap(
        client.publicationComments.createPublicationComment({
          params: { id: targets.publication.id },
          payload: { content: textToRichTextDocument(`Comentário de ${persona}`) },
        }),
        (comment) =>
          Effect.sync(() => {
            created.commentId = comment.id
          }),
      ),
    "publicationComments.createReplyPublicationComment": () =>
      client.publicationComments.createReplyPublicationComment({
        params: { id: targets.comment.id },
        payload: { content: textToRichTextDocument(`Resposta de ${persona}`) },
      }),
    "publicationComments.updatePublicationComment": () =>
      client.publicationComments.updatePublicationComment({
        params: { id: targets.comment.id },
        payload: {
          sourceContent: textToRichTextDocument("Editado"),
          expectedCurrentRevisionId: targets.comment.currentRevisionId,
        },
      }),
    "organizations.createOrganization": () =>
      Effect.tap(
        client.organizations.createOrganization({
          payload: { name: `Coletivo ${persona}`, handle, type: "COLLECTIVE" },
        }),
        (organization) =>
          Effect.sync(() => {
            created.organizationId = organization.id
          }),
      ),
    "organizations.updateOrganization": () =>
      client.organizations.updateOrganization({
        params: { id: created.organizationId ?? targets.organization.id },
        payload: { membersVisibility: "COMMUNITY" },
      }),
    "organizations.inviteMember": () =>
      client.organizations.inviteMember({
        params: { id: created.organizationId ?? targets.organization.id },
        payload: { personId: targets.organization.memberId, accessLevel: "VIEWER" },
      }),
    "organizations.acceptInvitation": () =>
      client.organizations.acceptInvitation({ params: { id: targets.organization.id } }),
    "organizations.updateMemberRole": () =>
      client.organizations.updateMemberRole({
        params: { id: targets.organization.id, personId: targets.organization.memberId },
        payload: { accessLevel: "EDITOR" },
      }),
    "wiki.createWikiArticle": () =>
      client.wiki.createWikiArticle({
        payload: { wikiArticle: conceptArticle(`Conceito de ${persona}`) },
      }),
    "wiki.createWikiArticleRevision": () =>
      client.wiki.createWikiArticleRevision({
        params: { kind: targets.article.kind, handle: targets.article.handle },
        payload: { crdtUpdate: emptyUpdate },
      }),
    "wiki.setWikiArticleBookmark": () =>
      client.wiki.setWikiArticleBookmark({
        params: { kind: targets.article.kind, handle: targets.article.handle },
        payload: { state: "ACTIVE" },
      }),
    "wiki.removeWikiArticleBookmark": () =>
      client.wiki.removeWikiArticleBookmark({
        params: { kind: targets.article.kind, handle: targets.article.handle },
      }),

    // Moderation and access
    "wiki.evaluateWikiArticleRevision": () =>
      client.wiki.evaluateWikiArticleRevision({
        params: { revisionId: targets.pendingRevision.id },
        payload: { status: "REJECTED", reason: "Teste de fumaça" },
      }),
    "wiki.setMainMedia": () =>
      client.wiki.setMainMedia({
        params: { wikiArticleId: targets.articleMedia.wikiArticleId },
        payload: { mediaAssetId: targets.articleMedia.mediaAssetId },
      }),
    "publications.moderatePublication": () =>
      client.publications.moderatePublication({
        params: { id: targets.publication.id },
        payload: { moderationStatus: "REAPPROVED_AFTER_CENSORING" },
      }),
    "publicationComments.moderatePublicationComment": () =>
      client.publicationComments.moderatePublicationComment({
        params: { id: targets.comment.id },
        payload: { moderationStatus: "REAPPROVED_AFTER_CENSORING" },
      }),
    "mediaAssets.moderateMedia": () =>
      client.mediaAssets.moderateMedia({
        params: { id: targets.image.id },
        payload: { moderationStatus: "REAPPROVED_AFTER_CENSORING" },
      }),
    "people.setAccessLevel": () =>
      client.people.setAccessLevel({
        params: { id: targets.generatedNewcomer.id },
        payload: { accessLevel: "COMMUNITY" },
      }),

    // Destructive endpoints last, acting on what the persona created when possible.
    "publicationComments.deletePublicationComment": () =>
      client.publicationComments.deletePublicationComment({
        params: { id: created.commentId ?? targets.comment.id },
      }),
    "publications.deletePublication": () =>
      client.publications.deletePublication({
        params: { id: created.publicationId ?? targets.publication.id },
      }),
    "organizations.removeMember": () =>
      client.organizations.removeMember({
        params: { id: targets.organization.id, personId: targets.organization.memberId },
      }),
    "organizations.leaveOrganization": () =>
      client.organizations.leaveOrganization({
        params: { id: created.organizationId ?? targets.organization.id },
      }),
    "organizations.deleteOrganization": () =>
      client.organizations.deleteOrganization({
        params: { id: created.organizationId ?? targets.organization.id },
      }),
    // Without confirmation, account deletion only reports what would be deleted.
    "people.deletePerson": () => client.people.deletePerson({ payload: {} }),
  }
}

const endpointNames: Array<string> = []

HttpApi.reflect(GororobasApi, {
  onGroup: () => {},
  onEndpoint: ({ group, endpoint }) => {
    endpointNames.push(`${group.identifier}.${endpoint.identifier}`)
  },
})

/** A failure is acceptable when it's a declared domain error rather than a broken contract. */
const contractViolation = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) return undefined
  if (Cause.hasDies(exit.cause) || Cause.hasInterrupts(exit.cause)) return Cause.pretty(exit.cause)

  const error = Cause.squash(exit.cause)
  const tag =
    Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) ? error._tag : undefined
  return tag === undefined || CONTRACT_FAILURES.includes(tag) ? String(error) : undefined
}

const byName = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

const seededEnvironment = Effect.gen(function* () {
  const mediaDirectory = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
    prefix: "api-smoke-media-",
  })

  return Layer.mergeAll(
    AppSqlTest,
    IdGenLive,
    WorkflowEngine.layerMemory,
    NodeServices.layer,
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: mediaDirectory }),
    ),
  )
}).pipe(Effect.provide(NodeServices.layer))

describe("API smoke", () => {
  PERSONAS.forEach((persona) =>
    it.live(
      `every endpoint answers ${persona === "visitor" ? "visitors" : `the ${persona} persona`} within its contract`,
      () =>
        Effect.gen(function* () {
          yield* seedDatabase({ scale: "tiny", seed: DEFAULT_SEED, anchor: yield* DateTime.now })
          const targets = yield* SeededTargets
          const api = yield* ApiTestClient
          const client =
            persona === "visitor"
              ? yield* api.visitor
              : yield* api.signIn(`${persona}@gororobas.test`)

          const smokeRequests: Record<string, () => Effect.Effect<unknown, unknown>> = requests({
            client,
            targets,
            persona,
          })

          // New endpoints must get a smoke request.
          expect(EffectArray.sort(Record.keys(smokeRequests), byName)).toEqual(
            EffectArray.sort(endpointNames, byName),
          )

          const violations = yield* Effect.forEach(
            Record.toEntries(smokeRequests),
            ([endpoint, request]) =>
              Effect.map(Effect.exit(request()), (exit) => {
                const violation = contractViolation(exit)
                return violation === undefined ? [] : [`${endpoint}: ${violation}`]
              }),
            { concurrency: 1 },
          )

          expect(violations.flat()).toEqual([])
        }).pipe(
          Effect.provide(ApiTestClient.layer),
          Effect.provide(Layer.unwrap(seededEnvironment)),
        ),
      { timeout: 120_000 },
    ),
  )
})
