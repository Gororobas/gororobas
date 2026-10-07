import { NodeServices } from "@effect/platform-node"
import { assert, expect, it } from "@effect/vitest"
import {
  CommentCrdt,
  CommentId,
  Handle,
  LoroDocUpdate,
  ModerationStatus,
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationId,
  PlatformAccessLevelOrVisitor,
  PersonId,
  ProfileId,
  ProfileVisibility,
  PublicationCrdt,
  PublicationId,
  SessionContext,
  snapshotToLoroDoc,
  tiptapToText,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import {
  And,
  describeFeature,
  getBackgroundContext,
  Given,
  runSteps,
  Then,
  When,
} from "@gororobas/effect-bdd"
import { VISITOR_SESSION } from "@gororobas/server/session-service"
import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"
import { TestClock } from "effect/testing"

import { findCommentCrdtSnapshotById } from "../src/comments/queries.js"
import { CommentsRepository } from "../src/comments/repository.js"
import { CommentsService } from "../src/comments/service.js"
import { OrganizationsService } from "../src/organizations/service.js"
import { PeopleService } from "../src/people/service.js"
import { findPublicationCrdtSnapshotById } from "../src/publications/queries.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import {
  PeopleBackground,
  PeopleFeatureTestLayer,
  PeopleTestDataTable,
  personNamed,
  provisionAdministrator,
  provisionPeople,
  textToRichTextDocument,
  withPerson,
} from "./feature-test-helpers.js"
import { withSession } from "./test-helpers.js"

const PublicationsFeatureTestLayer = Layer.effect(
  OrganizationsService,
  OrganizationsService.make,
).pipe(Layer.provideMerge(PeopleFeatureTestLayer))
const PublicationReference = Schema.Struct({ id: PublicationId, handle: Handle })

const PublicationsBackground = Schema.Struct({
  ...PeopleBackground.fields,
  organizationId: Schema.optional(OrganizationId),
  organizationCreatorId: Schema.optional(PersonId),
  publication: Schema.optional(PublicationReference),
})

type PublicationContext = typeof PublicationsBackground.Type & {
  actorId?: PersonId | undefined
  commentId?: CommentId
  error?: unknown
}

const background = () => getBackgroundContext(PublicationsBackground)
const publicationIn = (context: PublicationContext) =>
  Option.getOrThrow(Option.fromNullishOr(context.publication))
const organizationIn = (context: PublicationContext) =>
  Option.getOrThrow(Option.fromNullishOr(context.organizationId))
const commentIn = (context: PublicationContext) =>
  Option.getOrThrow(Option.fromNullishOr(context.commentId))
const asViewer = <A, E, R>(
  context: PublicationContext,
  action: Effect.Effect<A, E, R | SessionContext>,
) => (context.actorId ? withPerson(action, context.actorId) : withSession(action, VISITOR_SESSION))
const viewerNamed = (context: PublicationContext, viewer: string): PublicationContext => ({
  ...context,
  actorId: viewer === "visitors" ? undefined : personNamed(context.actors, viewer),
})
const NamedPerson = Schema.Struct({ name: Schema.String })
const Visibility = Schema.Struct({ visibility: ProfileVisibility })
const Content = Schema.Struct({ content: Schema.String })

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (
      context: { organizationId?: OrganizationId; organizationCreatorId?: PersonId },
      { table },
    ) => provisionPeople(table).pipe(Effect.map((people) => ({ ...context, ...people }))),
  })

const organizationSetup = () =>
  Given("the organization {string:organization} exists", {
    params: Schema.Struct({ organization: Schema.String }),
    handler: (_, { organization }) =>
      Effect.gen(function* () {
        const organizationCreatorId = yield* provisionAdministrator()
        const service = yield* OrganizationsService
        const handle = yield* Schema.decodeEffect(Handle)(
          `org-${organizationCreatorId.replaceAll("-", "").slice(0, 24)}`,
        )
        const created = yield* withPerson(
          service.createOrganization({ name: organization, handle, type: "TERRITORY" }),
          organizationCreatorId,
        )
        return { organizationCreatorId, organizationId: created.id }
      }),
  })

const membersSetup = () =>
  And("the following members exist for {string:organization}:", {
    params: Schema.Struct({
      organization: Schema.String,
      table: Schema.Array(
        Schema.Struct({ name: Schema.String, organizationAccessLevel: OrganizationAccessLevel }),
      ),
    }),
    handler: (context: PublicationContext, { table }) =>
      Effect.gen(function* () {
        const service = yield* OrganizationsService
        const organizationId = organizationIn(context)

        yield* Effect.forEach(
          table,
          ({ name, organizationAccessLevel }) =>
            Effect.gen(function* () {
              const personId = personNamed(context.actors, name)

              yield* withPerson(
                service.inviteMember({
                  organizationId,
                  personId,
                  accessLevel: organizationAccessLevel,
                }),
                Option.getOrThrow(Option.fromNullishOr(context.organizationCreatorId)),
              )

              yield* withPerson(service.acceptInvitation(organizationId), personId)
            }),
          { concurrency: 1 },
        )

        yield* withPerson(
          service.leaveOrganization(organizationId),
          Option.getOrThrow(Option.fromNullishOr(context.organizationCreatorId)),
        )
        return context
      }),
  })

const loggedIn = () =>
  Given("{string:name} is logged in", {
    params: NamedPerson,
    handler: (context, { name }) =>
      Effect.gen(function* () {
        const current = Schema.is(PublicationsBackground)(context) ? context : yield* background()
        return { ...current, actorId: personNamed(current.actors, name) }
      }),
  })

const visitor = () => Given("a visitor is browsing", { handler: () => background() })

const createPublication = ({
  context,
  visibility,
  ownerProfileId,
  content = "Publicação de teste",
}: {
  context: PublicationContext
  visibility: ProfileVisibility
  ownerProfileId: ProfileId
  content?: string
}) =>
  PublicationsService.use((service) =>
    asViewer(
      context,
      service.createPublication({
        kind: "POST",
        ownerProfileId,
        visibility,
        content: textToRichTextDocument(content),
        locale: "pt",
      }),
    ),
  ).pipe(Effect.map((publication) => ({ ...context, publication })))

const createPersonal = () =>
  When("they create a {string:visibility} post publication under their profile", {
    params: Visibility,
    handler: (context: PublicationContext, { visibility }) =>
      createPublication({
        context: context,
        visibility: visibility,
        ownerProfileId: Option.getOrThrow(Option.fromNullishOr(context.actorId)),
      }),
  })

const denied = <A, E, R>(context: PublicationContext, action: Effect.Effect<A, E, R>) =>
  action.pipe(
    Effect.flip,
    Effect.map((error) => ({ ...context, error })),
  )

const denyPersonal = () =>
  When("they try to create a {string:visibility} post publication under their profile", {
    params: Visibility,
    handler: (context: PublicationContext, { visibility }) =>
      Effect.gen(function* () {
        const owner = Option.getOrThrow(Option.fromNullishOr(context.actorId))
        const repo = yield* PublicationsRepository
        const before = yield* repo.listPublicationRowsByOwnerProfileId(owner)
        const result = yield* denied(
          context,
          createPublication({ context: context, visibility: visibility, ownerProfileId: owner }),
        )
        expect(yield* repo.listPublicationRowsByOwnerProfileId(owner)).toEqual(before)
        return result
      }),
  })

const denyVisitor = () =>
  When("they try to create a {string:visibility} post publication", {
    params: Visibility,
    handler: (context: PublicationContext, { visibility }) =>
      Effect.gen(function* () {
        const repo = yield* PublicationsRepository
        const owner = context.administratorId
        const before = yield* repo.listPublicationRowsByOwnerProfileId(owner)
        const result = yield* denied(
          context,
          createPublication({ context: context, visibility: visibility, ownerProfileId: owner }),
        )
        expect(yield* repo.listPublicationRowsByOwnerProfileId(owner)).toEqual(before)
        return result
      }),
  })

const createOrganizationPost = () =>
  When("they create a {string:visibility} post publication under {string:organization} profile", {
    params: Schema.Struct({ ...Visibility.fields, organization: Schema.String }),
    handler: (context: PublicationContext, { visibility }) =>
      createPublication({
        context: context,
        visibility: visibility,
        ownerProfileId: organizationIn(context),
      }),
  })

const denyOrganizationPost = () =>
  When(
    "they try to create a {string:visibility} post publication under {string:organization} profile",
    {
      params: Schema.Struct({ ...Visibility.fields, organization: Schema.String }),
      handler: (context: PublicationContext, { visibility }) =>
        Effect.gen(function* () {
          const repo = yield* PublicationsRepository
          const owner = organizationIn(context)
          const before = yield* repo.listPublicationRowsByOwnerProfileId(owner)
          const result = yield* denied(
            context,
            createPublication({ context: context, visibility: visibility, ownerProfileId: owner }),
          )
          expect(yield* repo.listPublicationRowsByOwnerProfileId(owner)).toEqual(before)
          return result
        }),
    },
  )

const accessDenied = () =>
  Then("access is denied", {
    handler: (context: PublicationContext) =>
      Effect.sync(() => {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const createdStep = {
  params: NamedPerson,
  handler: (context: PublicationContext, { name }: typeof NamedPerson.Type) =>
    Effect.gen(function* () {
      const repo = yield* PublicationsRepository
      const row = Option.getOrThrow(yield* repo.findPublicationRowById(publicationIn(context).id))
      expect(row.ownerProfileId).toBe(personNamed(context.actors, name))
      const page = yield* asViewer(
        context,
        (yield* PublicationsService).getPublicationPageData(publicationIn(context).handle),
      )
      expect(tiptapToText(Option.getOrThrow(Option.fromNullishOr(page.content)))).toBe(
        "Publicação de teste",
      )

      expect(
        (yield* repo.listPublicationCommitRowsByPublicationIdAsc(row.id)).map(
          (commit) => commit.createdById,
        ),
      ).toEqual([context.actorId])

      return context
    }),
}

const postCreated = () =>
  Then("the post publication is created in {string:name}'s profile", createdStep)
const eventCreated = () =>
  Then("the event publication is created in {string:name}'s profile", createdStep)

const VisibilityTable = Schema.Struct({
  table: Schema.Array(
    Schema.Struct({ viewer: Schema.String, visible: Schema.Literals(["yes", "no"]) }),
  ),
})

const visibilityStep = {
  params: VisibilityTable,
  handler: (context: PublicationContext, { table }: typeof VisibilityTable.Type) =>
    Effect.gen(function* () {
      const service = yield* PublicationsService
      const publication = publicationIn(context)

      yield* Effect.forEach(
        table,
        ({ viewer, visible }) =>
          Effect.gen(function* () {
            const action = asViewer(
              viewerNamed(context, viewer),
              service.getPublicationPageData(publication.handle),
            )
            const result = yield* action.pipe(Effect.result)
            expect(Result.isSuccess(result)).toBe(visible === "yes")
            Result.match(result, {
              onSuccess: (page) => expect(page.id).toBe(publication.id),
              onFailure: (error) => expect(error).toMatchObject({ _tag: "UnauthorizedError" }),
            })
          }),
        { concurrency: 1 },
      )

      return context
    }),
}

const postVisibility = () =>
  And("the post publication should have the following visibility:", visibilityStep)
const sameVisibility = () =>
  Then("the same post publication should have the following visibility:", visibilityStep)
const eventVisibility = () =>
  And("the event publication should have the following visibility:", visibilityStep)

const promote = () =>
  When("{string:actor} promotes {string:target} to COMMUNITY", {
    params: Schema.Struct({ actor: Schema.String, target: Schema.String }),
    handler: (context: PublicationContext, { actor, target }) =>
      Effect.gen(function* () {
        yield* withPerson(
          (yield* PeopleService).setAccessLevel(personNamed(context.actors, target), "COMMUNITY"),
          personNamed(context.actors, actor),
        )
        return context
      }),
  })

const createEvent = () =>
  When(
    "they create a {string:visibility} event publication under their profile starting {string:start} ending {string:end} at {string:location}",
    {
      params: Schema.Struct({
        ...Visibility.fields,
        start: Schema.String,
        end: Schema.String,
        location: Schema.String,
      }),
      handler: (context: PublicationContext, { visibility, start, end, location }) =>
        Effect.gen(function* () {
          const publication = yield* asViewer(
            context,
            (yield* PublicationsService).createPublication({
              kind: "EVENT",
              ownerProfileId: Option.getOrThrow(Option.fromNullishOr(context.actorId)),
              visibility,
              locale: "pt",
              content: textToRichTextDocument("Publicação de teste"),
              startDate: DateTime.makeUnsafe(start),
              endDate: DateTime.makeUnsafe(end),
              locationOrUrl: location,
            }),
          )

          return { ...context, publication }
        }),
    },
  )

const eventStart = () =>
  And("the event publication has start date {string:date}", {
    params: Schema.Struct({ date: Schema.String }),
    handler: (context: PublicationContext, { date }) =>
      Effect.gen(function* () {
        const row = Option.getOrThrow(
          yield* (yield* PublicationsRepository).findPublicationRowById(publicationIn(context).id),
        )
        expect(row.kind).toBe("EVENT")
        expect(row.startDate).toEqual(DateTime.makeUnsafe(date))
        return context
      }),
  })

const eventEnd = () =>
  And("the event publication has end date {string:date}", {
    params: Schema.Struct({ date: Schema.String }),
    handler: (context: PublicationContext, { date }) =>
      Effect.gen(function* () {
        const row = Option.getOrThrow(
          yield* (yield* PublicationsRepository).findPublicationRowById(publicationIn(context).id),
        )
        expect(row.endDate).toEqual(DateTime.makeUnsafe(date))
        return context
      }),
  })

const eventLocation = () =>
  And("the event publication has location {string:location}", {
    params: Schema.Struct({ location: Schema.String }),
    handler: (context: PublicationContext, { location }) =>
      Effect.gen(function* () {
        const page = yield* asViewer(
          context,
          (yield* PublicationsService).getPublicationPageData(publicationIn(context).handle),
        )
        assert(page.kind === "EVENT")
        expect(page.locationOrUrl).toBe(location)
        return context
      }),
  })

const PostSetup = Schema.Struct({
  organization: Schema.String,
  author: Schema.String,
  content: Schema.String,
})

const postSetupStep = {
  params: PostSetup,
  handler: (context: PublicationContext, { author, content }: typeof PostSetup.Type) =>
    createPublication({
      context: viewerNamed(context, author),
      visibility: "PUBLIC",
      ownerProfileId: organizationIn(context),
      content: content,
    }),
}

const existingPost = () =>
  And(
    "a post exists on {string:organization} created by {string:author} with content {string:content}",
    postSetupStep,
  )

const authoredPost = () =>
  And(
    "{string:author} has created a post under {string:organization} with content {string:content}",
    postSetupStep,
  )

const membersVisibilityStep = {
  params: Schema.Struct({ organization: Schema.String, visibility: InformationVisibility }),
  handler: (context: PublicationContext, { visibility }: { visibility: InformationVisibility }) =>
    Effect.gen(function* () {
      yield* withPerson(
        (yield* OrganizationsService).updateOrganization(organizationIn(context), {
          membersVisibility: visibility,
        }),
        personNamed(context.actors, "Maria"),
      )

      return context
    }),
}

const privateMembers = () =>
  And("{string:organization} displays members in {string:visibility}", membersVisibilityStep)
const givenInformationVisibility = () =>
  Given("{string:organization} displays members in {string:visibility}", membersVisibilityStep)

const editPost = (context: PublicationContext, content: string) =>
  Effect.gen(function* () {
    const publication = publicationIn(context)
    const snapshot = Option.getOrThrow(
      yield* findPublicationCrdtSnapshotById(publication.id),
    ).crdtSnapshot
    const current = snapshotToLoroDoc(snapshot)
    const edited = current.fork()

    yield* PublicationCrdt.applyEdit(edited, {
      _tag: "SetPublicationLocale",
      locale: "pt",
      value: {
        content: textToRichTextDocument(content),
        originalLocale: "pt",
        translationSource: "ORIGINAL",
        translatedAtCrdtFrontier: null,
      },
    })

    const row = Option.getOrThrow(
      yield* (yield* PublicationsRepository).findPublicationRowById(publication.id),
    )
    yield* TestClock.adjust(1)

    yield* asViewer(
      context,
      (yield* PublicationsService).updatePublication({
        publicationId: publication.id,
        expectedCurrentCrdtFrontier: row.currentCrdtFrontier,
        crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
      }),
    )

    return context
  })

const edit = () =>
  When("they edit the post publication content to {string:content}", {
    params: Content,
    handler: (context: PublicationContext, { content }) => editPost(context, content),
  })

const readPublicationState = (context: PublicationContext) =>
  Effect.gen(function* () {
    const repo = yield* PublicationsRepository
    const { id, handle } = publicationIn(context)

    return {
      row: yield* repo.findPublicationRowById(id),
      snapshot: yield* findPublicationCrdtSnapshotById(id),
      page: yield* repo.findPublicationPageData({ handle, locale: "pt" }),
      commits: yield* repo.listPublicationCommitRowsByPublicationIdAsc(id),
    }
  })

const deniedEdit = () =>
  When("they try to edit the post publication content to {string:content}", {
    params: Content,
    handler: (context: PublicationContext, { content }) =>
      Effect.gen(function* () {
        const before = yield* readPublicationState(context)
        const result = yield* denied(context, editPost(context, content))
        expect(yield* readPublicationState(context)).toEqual(before)
        return result
      }),
  })

const contentIsStep = {
  params: Content,
  handler: (context: PublicationContext, { content }: typeof Content.Type) =>
    Effect.gen(function* () {
      const page = yield* asViewer(
        context,
        (yield* PublicationsService).getPublicationPageData(publicationIn(context).handle),
      )
      expect(tiptapToText(Option.getOrThrow(Option.fromNullishOr(page.content)))).toBe(content)
      return context
    }),
}

const contentIs = () =>
  Then("the post publication content should be {string:content}", contentIsStep)
const contentRemains = () =>
  And("the post publication content should be {string:content}", contentIsStep)

const deletePost = () =>
  When("they delete the post publication", {
    handler: (context: PublicationContext) =>
      asViewer(
        context,
        PublicationsService.use((service) => service.delete(publicationIn(context).id)),
      ).pipe(Effect.as(context)),
  })

const deniedDelete = () =>
  When("they try to delete the post publication", {
    handler: (context: PublicationContext) =>
      Effect.gen(function* () {
        const before = yield* readPublicationState(context)
        const result = yield* denied(
          context,
          asViewer(context, (yield* PublicationsService).delete(publicationIn(context).id)),
        )
        expect(yield* readPublicationState(context)).toEqual(before)
        return result
      }),
  })

const deleted = () =>
  Then("the post publication should be deleted", {
    handler: (context: PublicationContext) =>
      Effect.gen(function* () {
        const state = yield* readPublicationState(context)
        expect(Option.isNone(state.row)).toBe(true)
        expect(Option.isNone(state.snapshot)).toBe(true)
        expect(Option.isNone(state.page)).toBe(true)
        expect(state.commits).toEqual([])

        expect(
          yield* asViewer(
            context,
            (yield* PublicationsService).getPublicationPageData(publicationIn(context).handle),
          ).pipe(Effect.flip),
        ).toMatchObject({ _tag: "PublicationNotFoundError" })

        return context
      }),
  })

const historyCount = () =>
  Then("the post publication history should contain {int:count} versions", {
    params: Schema.Struct({ count: Schema.Int }),
    handler: (context: PublicationContext, { count }) =>
      Effect.gen(function* () {
        expect(
          yield* asViewer(
            context,
            (yield* PublicationsService).getHistory(publicationIn(context).id),
          ),
        ).toHaveLength(count)

        return context
      }),
  })

const historyMatches = () =>
  And("the post publication history should match:", {
    params: Schema.Struct({
      table: Schema.Array(
        Schema.Struct({
          version: Schema.NumberFromString,
          author: Schema.String,
          content: Schema.String,
        }),
      ),
    }),
    handler: (context: PublicationContext, { table }) =>
      Effect.gen(function* () {
        const history = yield* asViewer(
          context,
          (yield* PublicationsService).getHistory(publicationIn(context).id),
        )
        expect(history).toHaveLength(table.length)
        const document = snapshotToLoroDoc(
          Option.getOrThrow(yield* findPublicationCrdtSnapshotById(publicationIn(context).id))
            .crdtSnapshot,
        )
        const replay = document.forkAt([])

        yield* Effect.forEach(
          history,
          (commit, index) =>
            Effect.gen(function* () {
              replay.import(commit.crdtUpdate)
              const expected = Option.getOrThrow(Option.fromNullishOr(table[index]))
              expect(expected.version).toBe(index + 1)
              expect(commit.createdById).toBe(personNamed(context.actors, expected.author))
              const data = yield* PublicationCrdt.read(replay)
              expect(
                tiptapToText(Option.getOrThrow(Option.fromNullishOr(data.locales.pt)).content),
              ).toBe(expected.content)
            }),
          { concurrency: 1 },
        )

        return context
      }),
  })

const personalPostSetup = () =>
  And("{string:author} has created a {string:visibility} post with content {string:content}", {
    params: Schema.Struct({ author: Schema.String, ...Visibility.fields, ...Content.fields }),
    handler: (context: PublicationContext, { author, visibility, content }) =>
      createPublication({
        context: viewerNamed(context, author),
        visibility: visibility,
        ownerProfileId: personNamed(context.actors, author),
        content: content,
      }),
  })

const comment = (context: PublicationContext, content: string) =>
  CommentsService.use((service) =>
    asViewer(
      context,
      service.createPublicationComment({
        publicationId: publicationIn(context).id,
        content: {
          locales: {
            pt: {
              content: textToRichTextDocument(content),
              originalLocale: "pt",
              translationSource: "ORIGINAL",
              translatedAtCrdtFrontier: null,
            },
          },
        },
      }),
    ),
  ).pipe(Effect.map((commentId) => ({ ...context, commentId })))

const commentOnPost = () =>
  When("they comment on the post publication with {string:content}", {
    params: Content,
    handler: (context: PublicationContext, { content }) => comment(context, content),
  })

const commented = () =>
  And("they have commented on the post publication with {string:content}", {
    params: Content,
    handler: (context: PublicationContext, { content }) => comment(context, content),
  })

const namedCommented = () =>
  Given("{string:name} has commented on the post publication with {string:content}", {
    params: Schema.Struct({ ...NamedPerson.fields, ...Content.fields }),
    handler: (_, { name, content }) =>
      background().pipe(Effect.flatMap((context) => comment(viewerNamed(context, name), content))),
  })

const deniedComment = () =>
  When("{string:name} tries to comment on the post publication", {
    params: NamedPerson,
    handler: (_, { name }) =>
      Effect.gen(function* () {
        const context = viewerNamed(yield* background(), name)
        const repo = yield* CommentsRepository
        const before = yield* repo.listCommentRowsByPublicationId(publicationIn(context).id)
        const result = yield* denied(context, comment(context, "Tentativa"))
        expect(yield* repo.listCommentRowsByPublicationId(publicationIn(context).id)).toEqual(
          before,
        )
        return result
      }),
  })

const censor = () =>
  When("{string:name} censors the comment", {
    params: NamedPerson,
    handler: (context: PublicationContext, { name }) =>
      withPerson(
        CommentsService.use((service) => service.censorComment(commentIn(context))),
        personNamed(context.actors, name),
      ).pipe(Effect.as(context)),
  })

const deniedCensor = () =>
  When("{string:name} tries to censor the comment", {
    params: NamedPerson,
    handler: (context: PublicationContext, { name }) =>
      Effect.gen(function* () {
        const repo = yield* CommentsRepository
        const before = yield* repo.findCommentRowById(commentIn(context))

        const result = yield* denied(
          context,
          withPerson(
            (yield* CommentsService).censorComment(commentIn(context)),
            personNamed(context.actors, name),
          ),
        )

        expect(yield* repo.findCommentRowById(commentIn(context))).toEqual(before)
        return result
      }),
  })

const visibleCommentStep = {
  handler: (context: PublicationContext) =>
    Effect.gen(function* () {
      const comments = yield* asViewer(
        context,
        (yield* CommentsService).listByPublicationId(publicationIn(context).id),
      )
      expect(comments.map((row) => row.id)).toContain(commentIn(context))
      return context
    }),
}

const commentVisible = () =>
  Then("the comment is visible on the post publication", visibleCommentStep)
const commentRemains = () =>
  And("the comment remains visible on the post publication", visibleCommentStep)

const commentHidden = () =>
  Then("the comment becomes hidden on the post publication", {
    handler: (context: PublicationContext) =>
      Effect.gen(function* () {
        const comments = yield* asViewer(
          context,
          (yield* CommentsService).listByPublicationId(publicationIn(context).id),
        )
        expect(comments.map((row) => row.id)).not.toContain(commentIn(context))
        return context
      }),
  })

const commentStatus = () =>
  And("the comment has moderation_status {string:status}", {
    params: Schema.Struct({ status: ModerationStatus }),
    handler: (context: PublicationContext, { status }) =>
      Effect.gen(function* () {
        const row = Option.getOrThrow(
          yield* (yield* CommentsRepository).findCommentRowById(commentIn(context)),
        )
        expect(row.moderationStatus).toBe(status)
        expect(row.ownerProfileId).toBe(context.actorId)
        return context
      }),
  })

const contributorsSetup = () =>
  And(
    "a {string:visibility} post exists on {string:organization} with contributors {string:first} and {string:second}",
    {
      params: Schema.Struct({
        ...Visibility.fields,
        organization: Schema.String,
        first: Schema.String,
        second: Schema.String,
      }),
      handler: (context: PublicationContext, { visibility, first, second }) =>
        Effect.gen(function* () {
          const created = yield* createPublication({
            context: viewerNamed(context, first),
            visibility: visibility,
            ownerProfileId: organizationIn(context),
            content: "Primeira versão",
          })

          return yield* editPost(viewerNamed(created, second), "Segunda versão")
        }),
    },
  )

const historyAuthorsSetup = () =>
  And("the post history contains versions authored by {string:first} and {string:second}", {
    params: Schema.Struct({ first: Schema.String, second: Schema.String }),
    handler: (context: PublicationContext, { first, second }) =>
      Effect.gen(function* () {
        const history = yield* asViewer(
          context,
          (yield* PublicationsService).getHistory(publicationIn(context).id),
        )
        expect(history.map((commit) => commit.createdById)).toEqual([
          personNamed(context.actors, first),
          personNamed(context.actors, second),
        ])
        return context
      }),
  })

const viewPost = () =>
  When("{string:viewer} views the post publication", {
    params: Schema.Struct({ viewer: Schema.String }),
    handler: (_, { viewer }) =>
      background().pipe(Effect.map((context) => viewerNamed(context, viewer))),
  })

const postVisible = () =>
  Then("the post publication is visible", {
    handler: (context: PublicationContext) =>
      Effect.gen(function* () {
        expect(
          (yield* asViewer(
            context,
            (yield* PublicationsService).getPublicationPageData(publicationIn(context).handle),
          )).id,
        ).toBe(publicationIn(context).id)

        return context
      }),
  })

const Accessibility = Schema.Struct({ accessible: Schema.Literals(["yes", "no"]) })

const contributorAccess = () =>
  And("contributor identities have accessibility {string:accessible}", {
    params: Accessibility,
    handler: (context: PublicationContext, { accessible }) =>
      Effect.gen(function* () {
        const action = asViewer(
          context,
          (yield* PublicationsService).getContributors(publicationIn(context).id),
        )

        yield* accessible === "no"
          ? action.pipe(
              Effect.flip,
              Effect.tap((error) =>
                Effect.sync(() => expect(error).toMatchObject({ _tag: "UnauthorizedError" })),
              ),
            )
          : action.pipe(
              Effect.tap((rows) =>
                Effect.sync(() => {
                  expect(rows).toHaveLength(2)

                  expect(rows).toEqual(
                    expect.arrayContaining([
                      { createdById: personNamed(context.actors, "Maria") },
                      { createdById: personNamed(context.actors, "Carlos") },
                    ]),
                  )
                }),
              ),
            )

        return context
      }),
  })

const historyAuthorAccess = () =>
  And("author identities in the post publication history have accessibility {string:accessible}", {
    params: Accessibility,
    handler: (context: PublicationContext, { accessible }) =>
      Effect.gen(function* () {
        const action = asViewer(
          context,
          (yield* PublicationsService).getHistory(publicationIn(context).id),
        )

        yield* accessible === "no"
          ? action.pipe(
              Effect.flip,
              Effect.tap((error) =>
                Effect.sync(() => expect(error).toMatchObject({ _tag: "UnauthorizedError" })),
              ),
            )
          : action.pipe(
              Effect.tap((rows) =>
                Effect.sync(() =>
                  expect(rows.map((row) => row.createdById)).toEqual([
                    personNamed(context.actors, "Maria"),
                    personNamed(context.actors, "Carlos"),
                  ]),
                ),
              ),
            )

        return context
      }),
  })

await Effect.runPromise(
  describeFeature("./publications.feature", ({ Rule }) => {
    Rule("Post publications visibility", ({ Background, Scenario }) => {
      Background({ layer: PublicationsFeatureTestLayer, steps: () => runSteps(givenPeople()) })
      Scenario("Person with community access creates truly public post publications", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), createPersonal(), postCreated(), postVisibility()),
      })
      Scenario("Person with community access creates community-only post publications", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), createPersonal(), postCreated(), postVisibility()),
      })

      Scenario("Person awaiting access creates a public post publication", {
        layer: PublicationsFeatureTestLayer,
        steps: () =>
          runSteps(
            loggedIn(),
            createPersonal(),
            postCreated(),
            postVisibility(),
            promote(),
            sameVisibility(),
          ),
      })

      Scenario("Blocked person cannot create post publications", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), denyPersonal(), accessDenied()),
      })
      Scenario("Visitors cannot create post publications", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(visitor(), denyVisitor(), accessDenied()),
      })
    })

    Rule(
      "Event publications exist and follow the same rules as post publications",
      ({ Background, Scenario }) => {
        Background({ layer: PublicationsFeatureTestLayer, steps: () => runSteps(givenPeople()) })

        Scenario(
          "Person with community access creates a public event publication with date and location",
          {
            layer: PublicationsFeatureTestLayer,
            steps: () =>
              runSteps(
                loggedIn(),
                createEvent(),
                eventCreated(),
                eventStart(),
                eventEnd(),
                eventLocation(),
                eventVisibility(),
              ),
          },
        )
      },
    )

    Rule("Organization post publications visibility", ({ Background, Scenario }) => {
      Background({
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(organizationSetup(), givenPeople(), membersSetup()),
      })
      Scenario("Editor publishes a community-only post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), createOrganizationPost(), postVisibility()),
      })
      Scenario("Non-member cannot create posts under organization", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), denyOrganizationPost(), accessDenied()),
      })
    })

    Rule("Organization post editing and deletion", ({ Background, Scenario }) => {
      Background({
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(organizationSetup(), givenPeople(), membersSetup(), existingPost()),
      })
      Scenario("Editor edits an existing post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), edit(), contentIs()),
      })
      Scenario("Viewer cannot edit posts", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), deniedEdit(), accessDenied(), contentRemains()),
      })
      Scenario("Non-member cannot edit posts", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), deniedEdit(), accessDenied(), contentRemains()),
      })
      Scenario("Manager deletes post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), deletePost(), deleted()),
      })
      Scenario("Editor deletes post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), deletePost(), deleted()),
      })
      Scenario("Viewer cannot delete posts", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), deniedDelete(), accessDenied()),
      })
    })

    Rule("Post history tracks changes with author attribution", ({ Background, Scenario }) => {
      Background({
        layer: PublicationsFeatureTestLayer,
        steps: () =>
          runSteps(
            organizationSetup(),
            givenPeople(),
            membersSetup(),
            authoredPost(),
            privateMembers(),
          ),
      })

      Scenario("Post history shows all edits with authors", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), edit(), historyCount(), historyMatches()),
      })
    })

    Rule("Posts have comments", ({ Background, Scenario }) => {
      Background({
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(givenPeople(), personalPostSetup(), loggedIn()),
      })
      Scenario("Person with community access can comment on a post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), commentOnPost(), commentVisible(), commentStatus()),
      })
      Scenario("Newcomer cannot comment on a post", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(deniedComment(), accessDenied()),
      })
      Scenario("Moderator can censor a comment", {
        layer: PublicationsFeatureTestLayer,
        steps: () => runSteps(loggedIn(), commented(), censor(), commentHidden(), commentStatus()),
      })

      Scenario("Community member cannot censor a comment", {
        layer: PublicationsFeatureTestLayer,
        steps: () =>
          runSteps(
            namedCommented(),
            deniedCensor(),
            accessDenied(),
            commentRemains(),
            commentStatus(),
          ),
      })
    })

    Rule("Member visibility affects public attribution", ({ Background, ScenarioOutline }) => {
      Background({
        layer: PublicationsFeatureTestLayer,
        steps: () =>
          runSteps(
            organizationSetup(),
            givenPeople(),
            membersSetup(),
            contributorsSetup(),
            historyAuthorsSetup(),
          ),
      })

      ScenarioOutline("Member visibility controls contributor and history author attribution", {
        layer: PublicationsFeatureTestLayer,
        steps: () =>
          runSteps(
            givenInformationVisibility(),
            viewPost(),
            postVisible(),
            contributorAccess(),
            historyAuthorAccess(),
          ),
      })
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect("posts and events apply current author access to pages, attribution, and comments", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(
      Schema.Struct({
        kind: Schema.Literals(["POST", "EVENT"]),
        visibility: ProfileVisibility,
        viewerAccess: PlatformAccessLevelOrVisitor,
      }),
    ),
    options: { runs: 40 },
    predicate: ({ kind, visibility, viewerAccess }) =>
      Effect.gen(function* () {
        const context = yield* provisionPeople([
          { name: "Owner", accessLevel: "NEWCOMER" },
          ...(viewerAccess === "VISITOR" ? [] : [{ name: "Reader", accessLevel: viewerAccess }]),
        ])
        const ownerId = personNamed(context.actors, "Owner")
        const reader = viewerAccess === "VISITOR" ? context : viewerNamed(context, "Reader")
        const service = yield* PublicationsService
        const comments = yield* CommentsService
        const repo = yield* CommentsRepository

        const publication = yield* withPerson(
          service.createPublication({
            kind,
            visibility,
            ownerProfileId: ownerId,
            locale: "pt",
            content: textToRichTextDocument("Encontro agroecológico"),
            startDate: DateTime.makeUnsafe("2026-02-01"),
          }),
          ownerId,
        )

        const readerContext = { ...reader, publication }
        const trusted =
          viewerAccess === "COMMUNITY" || viewerAccess === "MODERATOR" || viewerAccess === "ADMIN"

        const checkRead = <A, E, R>(action: Effect.Effect<A, E, R>, allowed: boolean) =>
          Effect.gen(function* () {
            const result = yield* action.pipe(Effect.result)
            expect(Result.isSuccess(result)).toBe(allowed)
            Result.match(result, {
              onSuccess: () => undefined,
              onFailure: (error) => expect(error).toMatchObject({ _tag: "UnauthorizedError" }),
            })
          })

        yield* Effect.forEach(
          [false, true],
          (approved) =>
            Effect.gen(function* () {
              if (approved) {
                yield* withPerson(
                  (yield* PeopleService).setAccessLevel(ownerId, "COMMUNITY"),
                  context.administratorId,
                )
              }

              const allowed = approved
                ? visibility === "PUBLIC" || trusted
                : viewerAccess === "ADMIN" || viewerAccess === "MODERATOR"
              yield* checkRead(
                asViewer(readerContext, service.getPublicationPageData(publication.handle)),
                allowed,
              )
              yield* checkRead(asViewer(readerContext, service.getHistory(publication.id)), allowed)
              yield* checkRead(
                asViewer(readerContext, service.getContributors(publication.id)),
                allowed,
              )
              yield* checkRead(
                asViewer(readerContext, comments.listByPublicationId(publication.id)),
                allowed,
              )
              expect(
                (yield* withPerson(service.getPublicationPageData(publication.handle), ownerId)).id,
              ).toBe(publication.id)
              const before = yield* repo.listCommentRowsByPublicationId(publication.id)
              const result = yield* comment(readerContext, "Comentário").pipe(Effect.result)
              expect(Result.isSuccess(result)).toBe(allowed && trusted)

              yield* Result.match(result, {
                onSuccess: () => Effect.void,
                onFailure: (error) =>
                  Effect.gen(function* () {
                    expect(error).toMatchObject({ _tag: "UnauthorizedError" })
                    expect(yield* repo.listCommentRowsByPublicationId(publication.id)).toEqual(
                      before,
                    )
                  }),
              })
            }),
          { concurrency: 1 },
        )

        return true
      }).pipe(Effect.provide(PublicationsFeatureTestLayer)),
  }),
)

it.effect(
  "censorship persists in the aggregate and projection and survives subsequent author edits",
  () =>
    Effect.gen(function* () {
      const context = yield* provisionPeople([
        { name: "Maria", accessLevel: "COMMUNITY" },
        { name: "Ana", accessLevel: "MODERATOR" },
        { name: "Ailton", accessLevel: "ADMIN" },
      ])

      const author = viewerNamed(context, "Maria")

      const created = yield* createPublication({
        context: author,
        visibility: "PUBLIC",
        ownerProfileId: personNamed(context.actors, "Maria"),
        content: "Canteiro novo",
      })

      const commented = yield* comment(created, "Comentário original")
      const commentId = commentIn(commented)
      const service = yield* CommentsService
      const repo = yield* CommentsRepository
      yield* withPerson(service.censorComment(commentId), personNamed(context.actors, "Ana"))

      const readAggregateStatus = SqlSchema.findOne({
        Request: CommentId,
        Result: Schema.Struct({ moderationStatus: Schema.NullOr(ModerationStatus) }),
        execute: (id) =>
          SqlClient.SqlClient.use(
            (sql) => sql`SELECT moderation_status FROM comment_crdts WHERE id = ${id}`,
          ),
      })

      expect((yield* readAggregateStatus(commentId)).moderationStatus).toBe("CENSORED")
      const current = snapshotToLoroDoc(
        Option.getOrThrow(yield* findCommentCrdtSnapshotById(commentId)).crdtSnapshot,
      )
      const edited = current.fork()

      yield* CommentCrdt.applyEdit(edited, {
        _tag: "SetCommentLocale",
        locale: "pt",
        value: {
          content: textToRichTextDocument("Comentário editado"),
          originalLocale: "pt",
          translationSource: "ORIGINAL",
          translatedAtCrdtFrontier: null,
        },
      })

      const before = Option.getOrThrow(yield* repo.findCommentRowById(commentId))
      yield* TestClock.adjust(1)

      yield* asViewer(
        commented,
        service.updateComment({
          commentId,
          expectedCurrentCrdtFrontier: before.currentCrdtFrontier,
          crdtUpdate: LoroDocUpdate.make(
            edited.export({ from: current.version(), mode: "update" }),
          ),
        }),
      )

      expect(
        Option.getOrThrow(yield* repo.findCommentContentByIdAndLocale({ commentId, locale: "pt" }))
          .content,
      ).toEqual(textToRichTextDocument("Comentário editado"))
      expect(Option.getOrThrow(yield* repo.findCommentRowById(commentId)).moderationStatus).toBe(
        "CENSORED",
      )
      expect((yield* readAggregateStatus(commentId)).moderationStatus).toBe("CENSORED")
      yield* withPerson(service.censorComment(commentId), personNamed(context.actors, "Ailton"))

      expect(
        yield* withSession(
          service.listByPublicationId(publicationIn(commented).id),
          VISITOR_SESSION,
        ),
      ).toEqual([])
    }).pipe(Effect.provide(PublicationsFeatureTestLayer)),
)
