import { expect } from "@effect/vitest"
import { Data, Effect, Layer, Option, Ref, Schema, ServiceMap } from "effect"

import {
  And,
  describeFeature,
  Given,
  getBackgroundContext,
  runSteps,
  Then,
  When,
} from "../src/index.ts"

// ============================================================================
// Domain Types
// ============================================================================

type AccessLevel = "approved" | "pending_approval" | "disapproved"
type Role = "admin" | "moderator" | "trusted"
type Visibility = "public" | "community" | "private"
type OrgPermission = "full" | "edit" | "view"

interface Person {
  id: string
  name: string
  role: Role
  access: AccessLevel
}

interface Organization {
  id: string
  name: string
}

interface Membership {
  personId: string
  organizationId: string
  permissions: OrgPermission
}

interface NoteVersion {
  content: string
  authorId: string
  timestamp: Date
}

interface Note {
  id: string
  title: string
  content: string
  visibility: Visibility
  authorId: string
  profileType: "person" | "organization"
  profileId: string
  versions: Array<NoteVersion>
  deleted: boolean
}

// ============================================================================
// Errors
// ============================================================================

class PersonNotFoundError extends Data.TaggedError("PersonNotFoundError")<{
  name: string
}> {}

class OrganizationNotFoundError extends Data.TaggedError("OrganizationNotFoundError")<{
  name: string
}> {}

class NoteNotFoundError extends Data.TaggedError("NoteNotFoundError")<{
  title: string
}> {}

class NoteCreationDeniedError extends Data.TaggedError("NoteCreationDeniedError")<{
  reason: string
}> {}

class NoteEditDeniedError extends Data.TaggedError("NoteEditDeniedError")<{
  reason: string
}> {}

class NoteDeleteDeniedError extends Data.TaggedError("NoteDeleteDeniedError")<{
  reason: string
}> {}

// ============================================================================
// Services
// ============================================================================

interface PersonRepository {
  create: (data: {
    name: string
    role?: string
    access: string
    permissions?: string
  }) => Effect.Effect<Person>
  findByName: (name: string) => Effect.Effect<Person, PersonNotFoundError>
  getAll: () => Effect.Effect<Array<Person>>
}

const PersonRepository = ServiceMap.Service<PersonRepository>("PersonRepository")

interface OrganizationRepository {
  create: (data: { name: string }) => Effect.Effect<Organization>
  findByName: (name: string) => Effect.Effect<Organization, OrganizationNotFoundError>
}

const OrganizationRepository = ServiceMap.Service<OrganizationRepository>("OrganizationRepository")

interface MembershipRepository {
  create: (data: {
    personName: string
    organizationName: string
    permissions: string
  }) => Effect.Effect<Membership, OrganizationNotFoundError | PersonNotFoundError>
  findByPersonAndOrg: (personId: string, orgId: string) => Effect.Effect<Option.Option<Membership>>
  findByOrg: (orgId: string) => Effect.Effect<Array<Membership>>
}

const MembershipRepository = ServiceMap.Service<MembershipRepository>("MembershipRepository")

interface AuthService {
  login: (name: string) => Effect.Effect<Person, PersonNotFoundError>
  getCurrentUser: () => Effect.Effect<Option.Option<Person>>
}

const AuthService = ServiceMap.Service<AuthService>("AuthService")

interface NotesService {
  create: (data: {
    content: string
    visibility: Visibility
    profileType: "person" | "organization"
    profileId: string
    authorId: string
  }) => Effect.Effect<Note, NoteCreationDeniedError>

  createWithTitle: (data: {
    title: string
    content: string
    visibility: Visibility
    profileType: "person" | "organization"
    profileId: string
    authorId: string
  }) => Effect.Effect<Note, NoteCreationDeniedError>

  findByTitle: (title: string) => Effect.Effect<Note, NoteNotFoundError>

  edit: (
    noteId: string,
    editorId: string,
    newContent: string,
  ) => Effect.Effect<Note, NoteEditDeniedError | NoteNotFoundError>

  tryEdit: (
    noteId: string,
    editorId: string,
    newContent: string,
  ) => Effect.Effect<{ success: boolean; note: Note }>

  delete: (
    noteId: string,
    deleterId: string,
  ) => Effect.Effect<void, NoteDeleteDeniedError | NoteNotFoundError>

  tryDelete: (noteId: string, deleterId: string) => Effect.Effect<{ success: boolean }>

  isVisibleTo: (note: Note, viewer: Person | "visitor") => Effect.Effect<boolean>

  getById: (id: string) => Effect.Effect<Note, NoteNotFoundError>

  exists: (id: string) => Effect.Effect<boolean>
}

const NotesService = ServiceMap.Service<NotesService>("NotesService")

// ============================================================================
// In-Memory Test Implementations
// ============================================================================

interface TestState {
  people: Map<string, Person>
  organizations: Map<string, Organization>
  memberships: Array<Membership>
  notes: Map<string, Note>
  currentUser: Person | null
}

const makeTestState = (): TestState => ({
  currentUser: null,
  memberships: [],
  notes: new Map(),
  organizations: new Map(),
  people: new Map(),
})

const TestStateRef = ServiceMap.Service<Ref.Ref<TestState>>("TestStateRef")

const PersonRepositoryLive = Layer.effect(
  PersonRepository,
  Effect.gen(function* () {
    const stateRef = yield* TestStateRef

    return PersonRepository.of({
      create: (data) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const person: Person = {
            access: data.access as AccessLevel,
            id: crypto.randomUUID(),
            name: data.name,
            role: (data.role as Role) ?? "trusted",
          }
          state.people.set(person.name, person)
          yield* Ref.set(stateRef, state)
          return person
        }),

      findByName: (name) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const person = state.people.get(name)
          if (!person) {
            return yield* Effect.fail(new PersonNotFoundError({ name }))
          }
          return person
        }),

      getAll: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return Array.from(state.people.values())
        }),
    })
  }),
)

const OrganizationRepositoryLive = Layer.effect(
  OrganizationRepository,
  Effect.gen(function* () {
    const stateRef = yield* TestStateRef

    return OrganizationRepository.of({
      create: (data) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const org: Organization = {
            id: crypto.randomUUID(),
            name: data.name,
          }
          state.organizations.set(org.name, org)
          yield* Ref.set(stateRef, state)
          return org
        }),

      findByName: (name) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const org = state.organizations.get(name)
          if (!org) {
            return yield* Effect.fail(new OrganizationNotFoundError({ name }))
          }
          return org
        }),
    })
  }),
)

const MembershipRepositoryLive = Layer.effect(
  MembershipRepository,
  Effect.gen(function* () {
    const stateRef = yield* TestStateRef
    const personRepo = yield* PersonRepository
    const orgRepo = yield* OrganizationRepository

    return MembershipRepository.of({
      create: (data) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const person = yield* personRepo.findByName(data.personName)
          const org = yield* orgRepo.findByName(data.organizationName)

          const membership: Membership = {
            organizationId: org.id,
            permissions: data.permissions as OrgPermission,
            personId: person.id,
          }
          state.memberships.push(membership)
          yield* Ref.set(stateRef, state)
          return membership
        }),

      findByOrg: (orgId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return state.memberships.filter((m) => m.organizationId === orgId)
        }),

      findByPersonAndOrg: (personId, orgId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const membership = state.memberships.find(
            (m) => m.personId === personId && m.organizationId === orgId,
          )
          return Option.fromNullable(membership)
        }),
    })
  }),
)

const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const stateRef = yield* TestStateRef
    const personRepo = yield* PersonRepository

    return AuthService.of({
      getCurrentUser: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return Option.fromNullable(state.currentUser)
        }),

      login: (name) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const person = yield* personRepo.findByName(name)
          state.currentUser = person
          yield* Ref.set(stateRef, state)
          return person
        }),
    })
  }),
)

const NotesServiceLive = Layer.effect(
  NotesService,
  Effect.gen(function* () {
    const stateRef = yield* TestStateRef
    const membershipRepo = yield* MembershipRepository

    const canCreateNote = (author: Person): boolean => {
      if (author.access === "disapproved") return false
      return true
    }

    const canEditOrgNote = (membership: Option.Option<Membership>): boolean => {
      if (Option.isNone(membership)) return false
      const perm = membership.value.permissions
      return perm === "full" || perm === "edit"
    }

    const canDeleteOrgNote = (membership: Option.Option<Membership>): boolean => {
      if (Option.isNone(membership)) return false
      const perm = membership.value.permissions
      return perm === "full" || perm === "edit"
    }

    return NotesService.of({
      create: (data) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const author = Array.from(state.people.values()).find((p) => p.id === data.authorId)

          if (!author || !canCreateNote(author)) {
            return yield* Effect.fail(
              new NoteCreationDeniedError({
                reason: "User not authorized to create notes",
              }),
            )
          }

          const note: Note = {
            authorId: data.authorId,
            content: data.content,
            deleted: false,
            id: crypto.randomUUID(),
            profileId: data.profileId,
            profileType: data.profileType,
            title: "",
            versions: [
              {
                authorId: data.authorId,
                content: data.content,
                timestamp: new Date(),
              },
            ],
            visibility: data.visibility,
          }

          state.notes.set(note.id, note)
          yield* Ref.set(stateRef, state)
          return note
        }),

      createWithTitle: (data) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const author = Array.from(state.people.values()).find((p) => p.id === data.authorId)

          if (!author || !canCreateNote(author)) {
            return yield* Effect.fail(
              new NoteCreationDeniedError({
                reason: "User not authorized to create notes",
              }),
            )
          }

          const note: Note = {
            authorId: data.authorId,
            content: data.content,
            deleted: false,
            id: crypto.randomUUID(),
            profileId: data.profileId,
            profileType: data.profileType,
            title: data.title,
            versions: [
              {
                authorId: data.authorId,
                content: data.content,
                timestamp: new Date(),
              },
            ],
            visibility: data.visibility,
          }

          state.notes.set(note.id, note)
          yield* Ref.set(stateRef, state)
          return note
        }),

      delete: (noteId, deleterId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(noteId)

          if (!note || note.deleted) {
            return yield* Effect.fail(new NoteNotFoundError({ title: "unknown" }))
          }

          if (note.profileType === "organization") {
            const membership = yield* membershipRepo.findByPersonAndOrg(deleterId, note.profileId)
            if (!canDeleteOrgNote(membership)) {
              return yield* Effect.fail(
                new NoteDeleteDeniedError({
                  reason: "User not authorized to delete this note",
                }),
              )
            }
          } else if (note.authorId !== deleterId) {
            return yield* Effect.fail(
              new NoteDeleteDeniedError({
                reason: "User not authorized to delete this note",
              }),
            )
          }

          note.deleted = true
          state.notes.set(noteId, note)
          yield* Ref.set(stateRef, state)
        }),

      edit: (noteId, editorId, newContent) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(noteId)

          if (!note || note.deleted) {
            return yield* Effect.fail(new NoteNotFoundError({ title: "unknown" }))
          }

          if (note.profileType === "organization") {
            const membership = yield* membershipRepo.findByPersonAndOrg(editorId, note.profileId)
            if (!canEditOrgNote(membership)) {
              return yield* Effect.fail(
                new NoteEditDeniedError({
                  reason: "User not authorized to edit this note",
                }),
              )
            }
          } else if (note.authorId !== editorId) {
            return yield* Effect.fail(
              new NoteEditDeniedError({
                reason: "User not authorized to edit this note",
              }),
            )
          }

          note.content = newContent
          note.versions.push({
            authorId: editorId,
            content: newContent,
            timestamp: new Date(),
          })

          state.notes.set(noteId, note)
          yield* Ref.set(stateRef, state)
          return note
        }),

      exists: (id) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(id)
          return !!note && !note.deleted
        }),

      findByTitle: (title) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = Array.from(state.notes.values()).find((n) => n.title === title && !n.deleted)
          if (!note) {
            return yield* Effect.fail(new NoteNotFoundError({ title }))
          }
          return note
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(id)
          if (!note || note.deleted) {
            return yield* Effect.fail(new NoteNotFoundError({ title: id }))
          }
          return note
        }),

      isVisibleTo: (note, viewer) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)

          const author = Array.from(state.people.values()).find((p) => p.id === note.authorId)

          if (viewer === "visitor") {
            if (note.visibility !== "public") return false
            if (author && author.access !== "approved") return false
            if (note.profileType === "organization") return false
            return true
          }

          const viewerPerson = viewer as Person

          if (note.authorId === viewerPerson.id) return true

          if (note.profileType === "person") {
            if (note.visibility === "private") {
              return note.authorId === viewerPerson.id
            }

            if (author && author.access === "pending_approval") {
              return viewerPerson.role === "admin" || viewerPerson.role === "moderator"
            }

            if (note.visibility === "community") {
              return viewerPerson.access === "approved"
            }

            if (note.visibility === "public") {
              return true
            }
          }

          if (note.profileType === "organization") {
            const membership = yield* membershipRepo.findByPersonAndOrg(
              viewerPerson.id,
              note.profileId,
            )

            if (note.visibility === "private") {
              return Option.isSome(membership)
            }

            if (note.visibility === "community") {
              return viewerPerson.access === "approved"
            }

            if (note.visibility === "public") {
              return true
            }
          }

          return false
        }),

      tryDelete: (noteId, deleterId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(noteId)

          if (!note || note.deleted) {
            return { success: false }
          }

          if (note.profileType === "organization") {
            const membership = yield* membershipRepo.findByPersonAndOrg(deleterId, note.profileId)
            if (!canDeleteOrgNote(membership)) {
              return { success: false }
            }
          } else if (note.authorId !== deleterId) {
            return { success: false }
          }

          note.deleted = true
          state.notes.set(noteId, note)
          yield* Ref.set(stateRef, state)
          return { success: true }
        }),

      tryEdit: (noteId, editorId, newContent) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const note = state.notes.get(noteId)

          if (!note || note.deleted) {
            return { note: note!, success: false }
          }

          if (note.profileType === "organization") {
            const membership = yield* membershipRepo.findByPersonAndOrg(editorId, note.profileId)
            if (!canEditOrgNote(membership)) {
              return { note, success: false }
            }
          } else if (note.authorId !== editorId) {
            return { note, success: false }
          }

          note.content = newContent
          note.versions.push({
            authorId: editorId,
            content: newContent,
            timestamp: new Date(),
          })

          state.notes.set(noteId, note)
          yield* Ref.set(stateRef, state)
          return { note, success: true }
        }),
    })
  }),
)

// ============================================================================
// Test Layer Assembly
// ============================================================================

const TestStateLayer = Layer.effect(TestStateRef, Ref.make<TestState>(makeTestState()))

const TestLayer = AuthServiceLive.pipe(
  Layer.provideMerge(NotesServiceLive),
  Layer.provideMerge(MembershipRepositoryLive),
  Layer.provideMerge(PersonRepositoryLive),
  Layer.provideMerge(OrganizationRepositoryLive),
  Layer.provideMerge(TestStateLayer),
)

// ============================================================================
// Context Types for Step Threading
// ============================================================================

interface NotesTestContext {
  people: Map<string, Person>
  organizations: Map<string, Organization>
  currentUser: Person | null
  lastNote: Note | null
  lastError: unknown
  lastEditResult: { success: boolean; note: Note } | null
  lastDeleteResult: { success: boolean } | null
}

const initialContext: NotesTestContext = {
  currentUser: null,
  lastDeleteResult: null,
  lastEditResult: null,
  lastError: null,
  lastNote: null,
  organizations: new Map(),
  people: new Map(),
}

// ============================================================================
// Reusable Step Handlers
// ============================================================================

const checkVisibilityTable = () =>
  And("the note should have the following visibility:", {
    handler: (ctx, { table }) =>
      Effect.gen(function* () {
        const typedCtx = ctx as NotesTestContext
        const notes = yield* NotesService

        for (const row of table) {
          const viewer = row.viewer === "visitors" ? "visitor" : typedCtx.people.get(row.viewer)!

          const isVisible = yield* notes.isVisibleTo(typedCtx.lastNote!, viewer)
          const expected = row.visible === "yes"

          expect(isVisible, `Visibility for "${row.viewer}"`).toBe(expected)
        }

        return typedCtx
      }),
    params: Schema.Struct({
      table: Schema.Array(
        Schema.Struct({
          viewer: Schema.String,
          visible: Schema.String,
        }),
      ),
    }),
  })

const userIsLoggedIn = () =>
  Given("{string:name} is logged in", {
    handler: (_, { name }) =>
      Effect.gen(function* () {
        const bgCtx = yield* getBackgroundContext<NotesTestContext>()
        const auth = yield* AuthService
        const user = yield* auth.login(name)
        return { ...bgCtx, currentUser: user }
      }),
    params: Schema.Struct({ name: Schema.String }),
  })

const createNoteUnderProfile = () =>
  When("they create a {string:visibility} note under their profile", {
    handler: (ctx, { visibility }) =>
      Effect.gen(function* () {
        const typedCtx = ctx as NotesTestContext
        const notes = yield* NotesService
        const note = yield* notes.create({
          authorId: typedCtx.currentUser!.id,
          content: "Test note content",
          profileId: typedCtx.currentUser!.id,
          profileType: "person",
          visibility: visibility as Visibility,
        })
        return { ...typedCtx, lastNote: note }
      }),
    params: Schema.Struct({ visibility: Schema.String }),
  })

const noteIsCreatedInProfile = () =>
  Then("the note is created in {string:owner}'s profile", {
    handler: (ctx, { owner }) =>
      Effect.sync(() => {
        const typedCtx = ctx as NotesTestContext
        expect(typedCtx.lastNote).toBeDefined()
        expect(typedCtx.currentUser?.name).toBe(owner)
        return typedCtx
      }),
    params: Schema.Struct({ owner: Schema.String }),
  })

// ============================================================================
// Test Implementation
// ============================================================================

describeFeature("./packages/effect-bdd/examples/example-notes-test.feature", ({ Rule }) => {
  // -------------------------------------------------------------------------
  // Rule: The three levels of personal notes visibility
  // -------------------------------------------------------------------------
  Rule("The three levels of personal notes visibility", ({ Background, Scenario }) => {
    Background({
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("the following people exist:", {
            handler: (_, { table }) =>
              Effect.gen(function* () {
                const personRepo = yield* PersonRepository
                const peopleMap = new Map<string, Person>()

                for (const row of table) {
                  const person = yield* personRepo.create(row)
                  peopleMap.set(person.name, person)
                }

                return {
                  ...initialContext,
                  people: peopleMap,
                }
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  access: Schema.String,
                  name: Schema.String,
                  role: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    Scenario("Approved person creates truly public notes", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          createNoteUnderProfile(),
          noteIsCreatedInProfile(),
          checkVisibilityTable(),
        ),
    })

    Scenario("Approved person creates community-only notes", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          createNoteUnderProfile(),
          noteIsCreatedInProfile(),
          checkVisibilityTable(),
        ),
    })

    Scenario("Approved person creates private note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          createNoteUnderProfile(),
          noteIsCreatedInProfile(),
          checkVisibilityTable(),
        ),
    })

    Scenario("Person with pending access creates note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          createNoteUnderProfile(),
          noteIsCreatedInProfile(),
          checkVisibilityTable(),
        ),
    })

    Scenario("Disapproved person tries to create note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          When("they create a {string:visibility} note under their profile", {
            handler: (ctx, { visibility }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService

                const result = yield* notes
                  .create({
                    authorId: typedCtx.currentUser!.id,
                    content: "Should fail",
                    profileId: typedCtx.currentUser!.id,
                    profileType: "person",
                    visibility: visibility as Visibility,
                  })
                  .pipe(
                    Effect.map((note) => ({ error: null, note })),
                    Effect.catchAll((error) => Effect.succeed({ error, note: null })),
                  )

                return {
                  ...typedCtx,
                  lastNote: result.note,
                  lastError: result.error,
                }
              }),
            params: Schema.Struct({ visibility: Schema.String }),
          }),
          Then("the creation is denied", {
            handler: (ctx) =>
              Effect.sync(() => {
                const typedCtx = ctx as NotesTestContext
                expect(typedCtx.lastError).toBeDefined()
                expect(typedCtx.lastError).toBeInstanceOf(NoteCreationDeniedError)
                return typedCtx
              }),
          }),
        ),
    })
  })

  // -------------------------------------------------------------------------
  // Rule: Organizational notes management
  // -------------------------------------------------------------------------
  Rule("Organizational notes management", ({ Background, Scenario }) => {
    Background({
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("the organization {string:name} exists", {
            handler: (_, { name }) =>
              Effect.gen(function* () {
                const orgRepo = yield* OrganizationRepository
                const org = yield* orgRepo.create({ name })
                return {
                  ...initialContext,
                  organizations: new Map([[name, org]]),
                }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the following people exist:", {
            handler: (ctx, { table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const personRepo = yield* PersonRepository
                const peopleMap = new Map(typedCtx.people)

                for (const row of table) {
                  const person = yield* personRepo.create({
                    ...row,
                    role: "trusted",
                  })
                  peopleMap.set(person.name, person)
                }

                return {
                  ...typedCtx,
                  people: peopleMap,
                }
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  access: Schema.String,
                  name: Schema.String,
                }),
              ),
            }),
          }),
          And("the following memberships exist for {string:orgName}:", {
            handler: (ctx, { orgName, table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const membershipRepo = yield* MembershipRepository

                for (const row of table) {
                  yield* membershipRepo.create({
                    organizationName: orgName,
                    permissions: row.permissions,
                    personName: row.name,
                  })
                }

                return typedCtx
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              table: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  permissions: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    Scenario("Editor publishes a community-only note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          When("they create a {string:visibility} note under {string:orgName} profile", {
            handler: (ctx, { orgName, visibility }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const org = typedCtx.organizations.get(orgName)!
                const note = yield* notes.create({
                  authorId: typedCtx.currentUser!.id,
                  content: "Org community note",
                  profileId: org.id,
                  profileType: "organization",
                  visibility: visibility as Visibility,
                })
                return { ...typedCtx, lastNote: note }
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              visibility: Schema.String,
            }),
          }),
          Then("the note should have the following visibility:", {
            handler: (ctx, { table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService

                for (const row of table) {
                  const viewer =
                    row.viewer === "visitors" ? "visitor" : typedCtx.people.get(row.viewer)!

                  const isVisible = yield* notes.isVisibleTo(typedCtx.lastNote!, viewer)
                  const expected = row.visible === "yes"
                  expect(isVisible, `Visibility for "${row.viewer}"`).toBe(expected)
                }

                return typedCtx
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  viewer: Schema.String,
                  visible: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    Scenario("Editor publishes an internal note (Private)", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          userIsLoggedIn(),
          When("they create a {string:visibility} note under {string:orgName} profile", {
            handler: (ctx, { orgName, visibility }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const org = typedCtx.organizations.get(orgName)!
                const note = yield* notes.create({
                  authorId: typedCtx.currentUser!.id,
                  content: "Internal org memo",
                  profileId: org.id,
                  profileType: "organization",
                  visibility: visibility as Visibility,
                })
                return { ...typedCtx, lastNote: note }
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              visibility: Schema.String,
            }),
          }),
          Then("the note should have the following visibility:", {
            handler: (ctx, { table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService

                for (const row of table) {
                  const viewer =
                    row.viewer === "visitors" ? "visitor" : typedCtx.people.get(row.viewer)!

                  const isVisible = yield* notes.isVisibleTo(typedCtx.lastNote!, viewer)
                  const expected = row.visible === "yes"
                  expect(isVisible, `Visibility for "${row.viewer}"`).toBe(expected)
                }

                return typedCtx
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  viewer: Schema.String,
                  visible: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    Scenario("Editor edits an existing organization note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given(
            "a note {string:title} exists on {string:orgName} profile created by {string:author}",
            {
              handler: (_, { author, orgName, title }) =>
                Effect.gen(function* () {
                  const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                  const notes = yield* NotesService
                  const org = bgCtx.organizations.get(orgName)!
                  const authorPerson = bgCtx.people.get(author)!

                  const note = yield* notes.createWithTitle({
                    authorId: authorPerson.id,
                    content: title,
                    profileId: org.id,
                    profileType: "organization",
                    title,
                    visibility: "community",
                  })

                  return { ...bgCtx, lastNote: note }
                }),
              params: Schema.Struct({
                author: Schema.String,
                orgName: Schema.String,
                title: Schema.String,
              }),
            },
          ),
          And("{string:name} is logged in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("they edit the note content to {string:newContent}", {
            handler: (ctx, { newContent }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const updatedNote = yield* notes.edit(
                  typedCtx.lastNote!.id,
                  typedCtx.currentUser!.id,
                  newContent,
                )
                return { ...typedCtx, lastNote: updatedNote }
              }),
            params: Schema.Struct({ newContent: Schema.String }),
          }),
          Then("the note content should be updated", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const note = yield* notes.getById(typedCtx.lastNote!.id)
                expect(note.content).toBe("Mutirão Domingo")
                return typedCtx
              }),
          }),
        ),
    })

    Scenario("Viewer cannot edit organization notes", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("a note {string:title} exists on {string:orgName} profile", {
            handler: (_, { orgName, title }) =>
              Effect.gen(function* () {
                const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                const notes = yield* NotesService
                const personRepo = yield* PersonRepository
                const org = bgCtx.organizations.get(orgName)!
                const maria = yield* personRepo.findByName("Maria")

                const note = yield* notes.createWithTitle({
                  authorId: maria.id,
                  content: "Original content",
                  profileId: org.id,
                  profileType: "organization",
                  title,
                  visibility: "community",
                })

                return { ...bgCtx, lastNote: note }
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              title: Schema.String,
            }),
          }),
          And("{string:name} is logged in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("they try to edit the note", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const result = yield* notes.tryEdit(
                  typedCtx.lastNote!.id,
                  typedCtx.currentUser!.id,
                  "Attempted edit",
                )
                return { ...typedCtx, lastEditResult: result }
              }),
          }),
          Then("the note content should remain unchanged", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                expect(typedCtx.lastEditResult?.success).toBe(false)
                const notes = yield* NotesService
                const note = yield* notes.getById(typedCtx.lastNote!.id)
                expect(note.content).toBe("Original content")
                return typedCtx
              }),
          }),
        ),
    })

    Scenario("Person with Full permissions deletes any note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given(
            "a note {string:title} exists on {string:orgName} profile created by {string:author}",
            {
              handler: (_, { author, orgName, title }) =>
                Effect.gen(function* () {
                  const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                  const notes = yield* NotesService
                  const org = bgCtx.organizations.get(orgName)!
                  const authorPerson = bgCtx.people.get(author)!

                  const note = yield* notes.createWithTitle({
                    authorId: authorPerson.id,
                    content: title,
                    profileId: org.id,
                    profileType: "organization",
                    title,
                    visibility: "community",
                  })

                  return { ...bgCtx, lastNote: note }
                }),
              params: Schema.Struct({
                author: Schema.String,
                orgName: Schema.String,
                title: Schema.String,
              }),
            },
          ),
          And("{string:name} is logged in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("they delete the note", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                yield* notes.delete(typedCtx.lastNote!.id, typedCtx.currentUser!.id)
                return typedCtx
              }),
          }),
          Then("the note should be deleted", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const exists = yield* notes.exists(typedCtx.lastNote!.id)
                expect(exists).toBe(false)
                return typedCtx
              }),
          }),
        ),
    })

    Scenario("Editor deletes a note", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("a note {string:title} exists on {string:orgName} profile", {
            handler: (_, { orgName, title }) =>
              Effect.gen(function* () {
                const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                const notes = yield* NotesService
                const personRepo = yield* PersonRepository
                const org = bgCtx.organizations.get(orgName)!
                const maria = yield* personRepo.findByName("Maria")

                const note = yield* notes.createWithTitle({
                  authorId: maria.id,
                  content: title,
                  profileId: org.id,
                  profileType: "organization",
                  title,
                  visibility: "community",
                })

                return { ...bgCtx, lastNote: note }
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              title: Schema.String,
            }),
          }),
          And("{string:name} is logged in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("they delete the note", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                yield* notes.delete(typedCtx.lastNote!.id, typedCtx.currentUser!.id)
                return typedCtx
              }),
          }),
          Then("the note should be deleted", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const exists = yield* notes.exists(typedCtx.lastNote!.id)
                expect(exists).toBe(false)
                return typedCtx
              }),
          }),
        ),
    })

    Scenario("Viewer cannot delete notes", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("a note {string:title} exists on {string:orgName} profile", {
            handler: (_, { orgName, title }) =>
              Effect.gen(function* () {
                const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                const notes = yield* NotesService
                const personRepo = yield* PersonRepository
                const org = bgCtx.organizations.get(orgName)!
                const maria = yield* personRepo.findByName("Maria")

                const note = yield* notes.createWithTitle({
                  authorId: maria.id,
                  content: "Important doc",
                  profileId: org.id,
                  profileType: "organization",
                  title,
                  visibility: "community",
                })

                return { ...bgCtx, lastNote: note }
              }),
            params: Schema.Struct({
              orgName: Schema.String,
              title: Schema.String,
            }),
          }),
          And("{string:name} is logged in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          When("they try to delete the note", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const result = yield* notes.tryDelete(
                  typedCtx.lastNote!.id,
                  typedCtx.currentUser!.id,
                )
                return { ...typedCtx, lastDeleteResult: result }
              }),
          }),
          Then("the note should still exist", {
            handler: (ctx) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                expect(typedCtx.lastDeleteResult?.success).toBe(false)
                const notes = yield* NotesService
                const exists = yield* notes.exists(typedCtx.lastNote!.id)
                expect(exists).toBe(true)
                return typedCtx
              }),
          }),
        ),
    })
  })

  // -------------------------------------------------------------------------
  // Rule: Content Auditability (Who changed what?)
  // -------------------------------------------------------------------------
  Rule("Content Auditability (Who changed what?)", ({ Background, Scenario }) => {
    Background({
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given("the organization {string:name} exists", {
            handler: (_, { name }) =>
              Effect.gen(function* () {
                const orgRepo = yield* OrganizationRepository
                const org = yield* orgRepo.create({ name })
                return {
                  ...initialContext,
                  organizations: new Map([[name, org]]),
                }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("the following people exist:", {
            handler: (ctx, { table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const personRepo = yield* PersonRepository
                const membershipRepo = yield* MembershipRepository
                const peopleMap = new Map(typedCtx.people)
                const org = Array.from(typedCtx.organizations.values())[0]

                for (const row of table) {
                  const person = yield* personRepo.create({
                    access: "approved",
                    name: row.name,
                    role: "trusted",
                  })
                  peopleMap.set(person.name, person)

                  yield* membershipRepo.create({
                    organizationName: org.name,
                    permissions: row.permissions,
                    personName: row.name,
                  })
                }

                return {
                  ...typedCtx,
                  people: peopleMap,
                }
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  permissions: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })

    Scenario("Organization keeps history of edits with author attribution", {
      layer: TestLayer,
      steps: () =>
        runSteps(
          Given(
            "{string:author} creates a note with content {string:content} under {string:orgName}'s profile",
            {
              handler: (_, { author, content, orgName }) =>
                Effect.gen(function* () {
                  const bgCtx = yield* getBackgroundContext<NotesTestContext>()
                  const notes = yield* NotesService
                  const auth = yield* AuthService

                  const authorPerson = yield* auth.login(author)
                  const org = bgCtx.organizations.get(orgName)!

                  const note = yield* notes.createWithTitle({
                    authorId: authorPerson.id,
                    content,
                    profileId: org.id,
                    profileType: "organization",
                    title: "Audit Test Note",
                    visibility: "community",
                  })

                  return {
                    ...bgCtx,
                    lastNote: note,
                    currentUser: authorPerson,
                  }
                }),
              params: Schema.Struct({
                author: Schema.String,
                content: Schema.String,
                orgName: Schema.String,
              }),
            },
          ),
          When("{string:name} logs in", {
            handler: (ctx, { name }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const auth = yield* AuthService
                const user = yield* auth.login(name)
                return { ...typedCtx, currentUser: user }
              }),
            params: Schema.Struct({ name: Schema.String }),
          }),
          And("they edit the note content to {string:newContent}", {
            handler: (ctx, { newContent }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const updatedNote = yield* notes.edit(
                  typedCtx.lastNote!.id,
                  typedCtx.currentUser!.id,
                  newContent,
                )
                return { ...typedCtx, lastNote: updatedNote }
              }),
            params: Schema.Struct({ newContent: Schema.String }),
          }),
          Then("the note content should be {string:expectedContent}", {
            handler: (ctx, { expectedContent }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const note = yield* notes.getById(typedCtx.lastNote!.id)
                expect(note.content).toBe(expectedContent)
                return typedCtx
              }),
            params: Schema.Struct({ expectedContent: Schema.String }),
          }),
          And("the note history should contain {int:count} versions", {
            handler: (ctx, { count }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const note = yield* notes.getById(typedCtx.lastNote!.id)
                expect(note.versions.length).toBe(count)
                return typedCtx
              }),
            params: Schema.Struct({ count: Schema.Int }),
          }),
          And("the note history should match:", {
            handler: (ctx, { table }) =>
              Effect.gen(function* () {
                const typedCtx = ctx as NotesTestContext
                const notes = yield* NotesService
                const personRepo = yield* PersonRepository

                const note = yield* notes.getById(typedCtx.lastNote!.id)

                for (const row of table) {
                  const versionIndex = parseInt(row.version, 10) - 1
                  const authorPerson = yield* personRepo.findByName(row.author)
                  const noteVersion = note.versions[versionIndex]

                  expect(noteVersion.content, `Version ${row.version} content`).toBe(row.content)
                  expect(noteVersion.authorId, `Version ${row.version} author`).toBe(
                    authorPerson.id,
                  )
                }

                return typedCtx
              }),
            params: Schema.Struct({
              table: Schema.Array(
                Schema.Struct({
                  author: Schema.String,
                  content: Schema.String,
                  version: Schema.String,
                }),
              ),
            }),
          }),
        ),
    })
  })
})
