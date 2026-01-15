import { expect } from '@effect/vitest'
import { Context, Data, Effect, Layer, Option, Ref, Schema } from 'effect'
import {
	And,
	describeFeature,
	Given,
	getBackgroundContext,
	runSteps,
	Then,
	When,
} from './index.ts'

// ============================================================================
// Domain Types
// ============================================================================

type AccessLevel = 'approved' | 'pending_approval' | 'disapproved'
type Role = 'admin' | 'moderator' | 'participant'
type Visibility = 'public' | 'community' | 'private'
type OrgPermission = 'full' | 'edit' | 'view'

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
	profileType: 'person' | 'organization'
	profileId: string
	versions: NoteVersion[]
	deleted: boolean
}

// ============================================================================
// Errors
// ============================================================================

class PersonNotFoundError extends Data.TaggedError('PersonNotFoundError')<{
	name: string
}> {}

class OrganizationNotFoundError extends Data.TaggedError(
	'OrganizationNotFoundError',
)<{
	name: string
}> {}

class NoteNotFoundError extends Data.TaggedError('NoteNotFoundError')<{
	title: string
}> {}

class NoteCreationDeniedError extends Data.TaggedError(
	'NoteCreationDeniedError',
)<{
	reason: string
}> {}

class NoteEditDeniedError extends Data.TaggedError('NoteEditDeniedError')<{
	reason: string
}> {}

class NoteDeleteDeniedError extends Data.TaggedError('NoteDeleteDeniedError')<{
	reason: string
}> {}

// ============================================================================
// Services
// ============================================================================

// --- Person Repository ---
interface PersonRepository {
	create: (data: {
		name: string
		role?: string
		access: string
		permissions?: string
	}) => Effect.Effect<Person>
	findByName: (name: string) => Effect.Effect<Person, PersonNotFoundError>
	getAll: () => Effect.Effect<Person[]>
}

const PersonRepository =
	Context.GenericTag<PersonRepository>('PersonRepository')

// --- Organization Repository ---
interface OrganizationRepository {
	create: (data: { name: string }) => Effect.Effect<Organization>
	findByName: (
		name: string,
	) => Effect.Effect<Organization, OrganizationNotFoundError>
}

const OrganizationRepository = Context.GenericTag<OrganizationRepository>(
	'OrganizationRepository',
)

// --- Membership Repository ---
interface MembershipRepository {
	create: (data: {
		personName: string
		organizationName: string
		permissions: string
	}) => Effect.Effect<
		Membership,
		OrganizationNotFoundError | PersonNotFoundError
	>
	findByPersonAndOrg: (
		personId: string,
		orgId: string,
	) => Effect.Effect<Option.Option<Membership>>
	findByOrg: (orgId: string) => Effect.Effect<Membership[]>
}

const MembershipRepository = Context.GenericTag<MembershipRepository>(
	'MembershipRepository',
)

// --- Auth Service ---
interface AuthService {
	login: (name: string) => Effect.Effect<Person, PersonNotFoundError>
	getCurrentUser: () => Effect.Effect<Option.Option<Person>>
}

const AuthService = Context.GenericTag<AuthService>('AuthService')

// --- Notes Service ---
interface NotesService {
	create: (data: {
		content: string
		visibility: Visibility
		profileType: 'person' | 'organization'
		profileId: string
		authorId: string
	}) => Effect.Effect<Note, NoteCreationDeniedError>

	createWithTitle: (data: {
		title: string
		content: string
		visibility: Visibility
		profileType: 'person' | 'organization'
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

	tryDelete: (
		noteId: string,
		deleterId: string,
	) => Effect.Effect<{ success: boolean }>

	isVisibleTo: (
		note: Note,
		viewer: Person | 'visitor',
	) => Effect.Effect<boolean>

	getById: (id: string) => Effect.Effect<Note, NoteNotFoundError>

	exists: (id: string) => Effect.Effect<boolean>
}

const NotesService = Context.GenericTag<NotesService>('NotesService')

// ============================================================================
// In-Memory Test Implementations
// ============================================================================

interface TestState {
	people: Map<string, Person>
	organizations: Map<string, Organization>
	memberships: Membership[]
	notes: Map<string, Note>
	currentUser: Person | null
}

const makeTestState = (): TestState => ({
	people: new Map(),
	organizations: new Map(),
	memberships: [],
	notes: new Map(),
	currentUser: null,
})

const TestStateRef = Context.GenericTag<Ref.Ref<TestState>>('TestStateRef')

// --- Person Repository Implementation ---
const PersonRepositoryLive = Layer.effect(
	PersonRepository,
	Effect.gen(function* () {
		const stateRef = yield* TestStateRef

		return PersonRepository.of({
			create: (data) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const person: Person = {
						id: crypto.randomUUID(),
						name: data.name,
						role: (data.role as Role) ?? 'participant',
						access: data.access as AccessLevel,
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

// --- Organization Repository Implementation ---
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

// --- Membership Repository Implementation ---
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
						personId: person.id,
						organizationId: org.id,
						permissions: data.permissions as OrgPermission,
					}
					state.memberships.push(membership)
					yield* Ref.set(stateRef, state)
					return membership
				}),

			findByPersonAndOrg: (personId, orgId) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const membership = state.memberships.find(
						(m) => m.personId === personId && m.organizationId === orgId,
					)
					return Option.fromNullable(membership)
				}),

			findByOrg: (orgId) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					return state.memberships.filter((m) => m.organizationId === orgId)
				}),
		})
	}),
)

// --- Auth Service Implementation ---
const AuthServiceLive = Layer.effect(
	AuthService,
	Effect.gen(function* () {
		const stateRef = yield* TestStateRef
		const personRepo = yield* PersonRepository

		return AuthService.of({
			login: (name) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const person = yield* personRepo.findByName(name)
					state.currentUser = person
					yield* Ref.set(stateRef, state)
					return person
				}),

			getCurrentUser: () =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					return Option.fromNullable(state.currentUser)
				}),
		})
	}),
)

// --- Notes Service Implementation ---
const NotesServiceLive = Layer.effect(
	NotesService,
	Effect.gen(function* () {
		const stateRef = yield* TestStateRef
		const personRepo = yield* PersonRepository
		const membershipRepo = yield* MembershipRepository

		const canCreateNote = (author: Person, profileType: string): boolean => {
			if (author.access === 'disapproved') return false
			return true
		}

		const canEditOrgNote = (
			editorId: string,
			membership: Option.Option<Membership>,
		): boolean => {
			if (Option.isNone(membership)) return false
			const perm = membership.value.permissions
			return perm === 'full' || perm === 'edit'
		}

		const canDeleteOrgNote = (
			membership: Option.Option<Membership>,
		): boolean => {
			if (Option.isNone(membership)) return false
			const perm = membership.value.permissions
			return perm === 'full' || perm === 'edit'
		}

		return NotesService.of({
			create: (data) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const author = Array.from(state.people.values()).find(
						(p) => p.id === data.authorId,
					)

					if (!author || !canCreateNote(author, data.profileType)) {
						return yield* Effect.fail(
							new NoteCreationDeniedError({
								reason: 'User not authorized to create notes',
							}),
						)
					}

					const note: Note = {
						id: crypto.randomUUID(),
						title: '',
						content: data.content,
						visibility: data.visibility,
						authorId: data.authorId,
						profileType: data.profileType,
						profileId: data.profileId,
						versions: [
							{
								content: data.content,
								authorId: data.authorId,
								timestamp: new Date(),
							},
						],
						deleted: false,
					}

					state.notes.set(note.id, note)
					yield* Ref.set(stateRef, state)
					return note
				}),

			createWithTitle: (data) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const author = Array.from(state.people.values()).find(
						(p) => p.id === data.authorId,
					)

					if (!author || !canCreateNote(author, data.profileType)) {
						return yield* Effect.fail(
							new NoteCreationDeniedError({
								reason: 'User not authorized to create notes',
							}),
						)
					}

					const note: Note = {
						id: crypto.randomUUID(),
						title: data.title,
						content: data.content,
						visibility: data.visibility,
						authorId: data.authorId,
						profileType: data.profileType,
						profileId: data.profileId,
						versions: [
							{
								content: data.content,
								authorId: data.authorId,
								timestamp: new Date(),
							},
						],
						deleted: false,
					}

					state.notes.set(note.id, note)
					yield* Ref.set(stateRef, state)
					return note
				}),

			findByTitle: (title) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = Array.from(state.notes.values()).find(
						(n) => n.title === title && !n.deleted,
					)
					if (!note) {
						return yield* Effect.fail(new NoteNotFoundError({ title }))
					}
					return note
				}),

			edit: (noteId, editorId, newContent) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = state.notes.get(noteId)

					if (!note || note.deleted) {
						return yield* Effect.fail(
							new NoteNotFoundError({ title: 'unknown' }),
						)
					}

					// Check permissions for org notes
					if (note.profileType === 'organization') {
						const membership = yield* membershipRepo.findByPersonAndOrg(
							editorId,
							note.profileId,
						)
						if (!canEditOrgNote(editorId, membership)) {
							return yield* Effect.fail(
								new NoteEditDeniedError({
									reason: 'User not authorized to edit this note',
								}),
							)
						}
					} else if (note.authorId !== editorId) {
						return yield* Effect.fail(
							new NoteEditDeniedError({
								reason: 'User not authorized to edit this note',
							}),
						)
					}

					note.content = newContent
					note.versions.push({
						content: newContent,
						authorId: editorId,
						timestamp: new Date(),
					})

					state.notes.set(noteId, note)
					yield* Ref.set(stateRef, state)
					return note
				}),

			tryEdit: (noteId, editorId, newContent) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = state.notes.get(noteId)

					if (!note || note.deleted) {
						return { success: false, note: note! }
					}

					// Check permissions for org notes
					if (note.profileType === 'organization') {
						const membership = yield* membershipRepo.findByPersonAndOrg(
							editorId,
							note.profileId,
						)
						if (!canEditOrgNote(editorId, membership)) {
							return { success: false, note }
						}
					} else if (note.authorId !== editorId) {
						return { success: false, note }
					}

					note.content = newContent
					note.versions.push({
						content: newContent,
						authorId: editorId,
						timestamp: new Date(),
					})

					state.notes.set(noteId, note)
					yield* Ref.set(stateRef, state)
					return { success: true, note }
				}),

			delete: (noteId, deleterId) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = state.notes.get(noteId)

					if (!note || note.deleted) {
						return yield* Effect.fail(
							new NoteNotFoundError({ title: 'unknown' }),
						)
					}

					if (note.profileType === 'organization') {
						const membership = yield* membershipRepo.findByPersonAndOrg(
							deleterId,
							note.profileId,
						)
						if (!canDeleteOrgNote(membership)) {
							return yield* Effect.fail(
								new NoteDeleteDeniedError({
									reason: 'User not authorized to delete this note',
								}),
							)
						}
					} else if (note.authorId !== deleterId) {
						return yield* Effect.fail(
							new NoteDeleteDeniedError({
								reason: 'User not authorized to delete this note',
							}),
						)
					}

					note.deleted = true
					state.notes.set(noteId, note)
					yield* Ref.set(stateRef, state)
				}),

			tryDelete: (noteId, deleterId) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = state.notes.get(noteId)

					if (!note || note.deleted) {
						return { success: false }
					}

					if (note.profileType === 'organization') {
						const membership = yield* membershipRepo.findByPersonAndOrg(
							deleterId,
							note.profileId,
						)
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

			isVisibleTo: (note, viewer) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)

					// Get the author to check their access level
					const author = Array.from(state.people.values()).find(
						(p) => p.id === note.authorId,
					)

					if (viewer === 'visitor') {
						// Visitors can only see public notes from approved users
						if (note.visibility !== 'public') return false
						if (author && author.access !== 'approved') return false
						if (note.profileType === 'organization') return false
						return true
					}

					const viewerPerson = viewer as Person

					// Author can always see their own notes
					if (note.authorId === viewerPerson.id) return true

					// Handle personal profile notes
					if (note.profileType === 'person') {
						// Private notes - only owner
						if (note.visibility === 'private') {
							return note.authorId === viewerPerson.id
						}

						// Author has pending access - only admins/mods can see
						if (author && author.access === 'pending_approval') {
							return (
								viewerPerson.role === 'admin' ||
								viewerPerson.role === 'moderator'
							)
						}

						// Community notes - only approved users
						if (note.visibility === 'community') {
							return viewerPerson.access === 'approved'
						}

						// Public notes - anyone with approved access can see
						if (note.visibility === 'public') {
							return true
						}
					}

					// Handle organization profile notes
					if (note.profileType === 'organization') {
						const membership = yield* membershipRepo.findByPersonAndOrg(
							viewerPerson.id,
							note.profileId,
						)

						// Private org notes - only members
						if (note.visibility === 'private') {
							return Option.isSome(membership)
						}

						// Community org notes - any approved user
						if (note.visibility === 'community') {
							return viewerPerson.access === 'approved'
						}

						// Public org notes
						if (note.visibility === 'public') {
							return true
						}
					}

					return false
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

			exists: (id) =>
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef)
					const note = state.notes.get(id)
					return !!note && !note.deleted
				}),
		})
	}),
)

// ============================================================================
// Test Layer Assembly
// ============================================================================

const TestStateLayer = Layer.effect(
	TestStateRef,
	Ref.make<TestState>(makeTestState()),
)

const TestStateLayerDebug = Layer.effect(
	TestStateRef,
	Effect.gen(function* () {
		yield* Effect.log('🔧 Building TestStateRef...')
		const ref = yield* Ref.make<TestState>(makeTestState())
		yield* Effect.log('✅ TestStateRef created')
		return ref
	}),
)

// TestStateLayer MUST come first - everything else depends on TestStateRef
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
	lastError: unknown | null
	lastEditResult: { success: boolean; note: Note } | null
	lastDeleteResult: { success: boolean } | null
}

const initialContext: NotesTestContext = {
	people: new Map(),
	organizations: new Map(),
	currentUser: null,
	lastNote: null,
	lastError: null,
	lastEditResult: null,
	lastDeleteResult: null,
}

// ============================================================================
// Test Implementation
// ============================================================================

describeFeature('./012-bdd-tests/notes.feature', ({ Rule }) => {
	// -------------------------------------------------------------------------
	// Rule: The three levels of personal notes visibility
	// -------------------------------------------------------------------------
	Rule(
		'The three levels of personal notes visibility',
		({ Background, Scenario }) => {
			Background({
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('the following people exist:', {
							params: Schema.Struct({
								table: Schema.Array(
									Schema.Struct({
										name: Schema.String,
										role: Schema.String,
										access: Schema.String,
									}),
								),
							}),
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
						}),
					),
			})

			Scenario('Approved person creates truly public notes', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('{string:name} is logged in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...bgCtx, currentUser: user }
								}),
						}),
						When('they create a {string:visibility} note under their profile', {
							params: Schema.Struct({ visibility: Schema.String }),
							handler: (ctx, { visibility }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.create({
										content: 'Test note content',
										visibility: visibility as Visibility,
										profileType: 'person',
										profileId: typedCtx.currentUser!.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						}),
						Then("the note is created in {string:owner}'s profile", {
							params: Schema.Struct({ owner: Schema.String }),
							handler: (ctx, { owner }) =>
								Effect.sync(() => {
									const typedCtx = ctx as NotesTestContext
									expect(typedCtx.lastNote).toBeDefined()
									expect(typedCtx.currentUser?.name).toBe(owner)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is visible to visitors', {
							handler: (ctx) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										'visitor',
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
					),
			})

			Scenario('Approved person creates community-only notes', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('{string:name} is logged in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...bgCtx, currentUser: user }
								}),
						}),
						When('they create a {string:visibility} note under their profile', {
							params: Schema.Struct({ visibility: Schema.String }),
							handler: (ctx, { visibility }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.create({
										content: 'Community note content',
										visibility: visibility as Visibility,
										profileType: 'person',
										profileId: typedCtx.currentUser!.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						}),
						Then("the note is created in {string:owner}'s profile", {
							params: Schema.Struct({ owner: Schema.String }),
							handler: (ctx, { owner }) =>
								Effect.sync(() => {
									const typedCtx = ctx as NotesTestContext
									expect(typedCtx.lastNote).toBeDefined()
									expect(typedCtx.currentUser?.name).toBe(owner)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is not visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(false)
									return typedCtx
								}),
						}),
					),
			})

			Scenario('Approved person creates private note', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('{string:name} is logged in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...bgCtx, currentUser: user }
								}),
						}),
						When('they create a {string:visibility} note under their profile', {
							params: Schema.Struct({ visibility: Schema.String }),
							handler: (ctx, { visibility }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.create({
										content: 'Private note content',
										visibility: visibility as Visibility,
										profileType: 'person',
										profileId: typedCtx.currentUser!.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						}),
						Then("the note is created in {string:owner}'s profile", {
							params: Schema.Struct({ owner: Schema.String }),
							handler: (ctx, { owner }) =>
								Effect.sync(() => {
									const typedCtx = ctx as NotesTestContext
									expect(typedCtx.lastNote).toBeDefined()
									expect(typedCtx.currentUser?.name).toBe(owner)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is not visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(false)
									return typedCtx
								}),
						}),
					),
			})

			Scenario('Person with pending access creates note', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('{string:name} is logged in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...bgCtx, currentUser: user }
								}),
						}),
						When('they create a {string:visibility} note under their profile', {
							params: Schema.Struct({ visibility: Schema.String }),
							handler: (ctx, { visibility }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.create({
										content: 'Pending user note',
										visibility: visibility as Visibility,
										profileType: 'person',
										profileId: typedCtx.currentUser!.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						}),
						Then("the note is created in {string:owner}'s profile", {
							params: Schema.Struct({ owner: Schema.String }),
							handler: (ctx, { owner }) =>
								Effect.sync(() => {
									const typedCtx = ctx as NotesTestContext
									expect(typedCtx.lastNote).toBeDefined()
									expect(typedCtx.currentUser?.name).toBe(owner)
									return typedCtx
								}),
						}),
						And('the note is visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(true)
									return typedCtx
								}),
						}),
						And('the note is not visible to {string:viewer}', {
							params: Schema.Struct({ viewer: Schema.String }),
							handler: (ctx, { viewer }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const viewerPerson = typedCtx.people.get(viewer)
									const isVisible = yield* notes.isVisibleTo(
										typedCtx.lastNote!,
										viewerPerson!,
									)
									expect(isVisible).toBe(false)
									return typedCtx
								}),
						}),
					),
			})

			Scenario('Disapproved person tries to create note', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('{string:name} is logged in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...bgCtx, currentUser: user }
								}),
						}),
						When('they create a {string:visibility} note under their profile', {
							params: Schema.Struct({ visibility: Schema.String }),
							handler: (ctx, { visibility }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService

									const result = yield* notes
										.create({
											content: 'Should fail',
											visibility: visibility as Visibility,
											profileType: 'person',
											profileId: typedCtx.currentUser!.id,
											authorId: typedCtx.currentUser!.id,
										})
										.pipe(
											Effect.map((note) => ({ note, error: null })),
											Effect.catchAll((error) =>
												Effect.succeed({ note: null, error }),
											),
										)

									return {
										...typedCtx,
										lastNote: result.note,
										lastError: result.error,
									}
								}),
						}),
						Then('the creation is denied', {
							handler: (ctx) =>
								Effect.sync(() => {
									const typedCtx = ctx as NotesTestContext
									expect(typedCtx.lastError).toBeDefined()
									expect(typedCtx.lastError).toBeInstanceOf(
										NoteCreationDeniedError,
									)
									return typedCtx
								}),
						}),
					),
			})
		},
	)

	// -------------------------------------------------------------------------
	// Rule: Organizational notes management
	// -------------------------------------------------------------------------
	Rule('Organizational notes management', ({ Background, Scenario }) => {
		Background({
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('the organization {string:name} exists', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (_, { name }) =>
							Effect.gen(function* () {
								const orgRepo = yield* OrganizationRepository
								const org = yield* orgRepo.create({ name })
								return {
									...initialContext,
									organizations: new Map([[name, org]]),
								}
							}),
					}),
					And('the following people exist:', {
						params: Schema.Struct({
							table: Schema.Array(
								Schema.Struct({
									name: Schema.String,
									access: Schema.String,
								}),
							),
						}),
						handler: (ctx, { table }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const personRepo = yield* PersonRepository
								const peopleMap = new Map(bgCtx.people)

								for (const row of table) {
									const person = yield* personRepo.create({
										...row,
										role: 'participant',
									})
									peopleMap.set(person.name, person)
								}

								return {
									...typedCtx,
									...bgCtx,
									people: peopleMap,
								}
							}),
					}),
					And('the following memberships exist for {string:orgName}:', {
						params: Schema.Struct({
							orgName: Schema.String,
							table: Schema.Array(
								Schema.Struct({
									name: Schema.String,
									permissions: Schema.String,
								}),
							),
						}),
						handler: (ctx, { orgName, table }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const membershipRepo = yield* MembershipRepository

								for (const row of table) {
									yield* membershipRepo.create({
										personName: row.name,
										organizationName: orgName,
										permissions: row.permissions,
									})
								}

								return typedCtx
							}),
					}),
				),
		})

		Scenario('Editor publishes a community-only note', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (_, { name }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...bgCtx, currentUser: user }
							}),
					}),
					When(
						'they create a {string:visibility} note under {string:orgName} profile',
						{
							params: Schema.Struct({
								visibility: Schema.String,
								orgName: Schema.String,
							}),
							handler: (ctx, { visibility, orgName }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const org = typedCtx.organizations.get(orgName)!
									const note = yield* notes.create({
										content: 'Org community note',
										visibility: visibility as Visibility,
										profileType: 'organization',
										profileId: org.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						},
					),
					Then('the note is visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const notes = yield* NotesService
								const viewerPerson = ctx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									ctx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(true)
								return ctx
							}),
					}),
					Then('the note is visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const notes = yield* NotesService
								const viewerPerson = ctx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									ctx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(true)
								return ctx
							}),
					}),
					And('the note is not visible to visitors', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const isVisible = yield* notes.isVisibleTo(
									typedCtx.lastNote!,
									'visitor',
								)
								expect(isVisible).toBe(false)
								return typedCtx
							}),
					}),
				),
		})

		Scenario('Editor publishes an internal note (Private)', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (_, { name }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...bgCtx, currentUser: user }
							}),
					}),
					When(
						'they create a {string:visibility} note under {string:orgName} profile',
						{
							params: Schema.Struct({
								visibility: Schema.String,
								orgName: Schema.String,
							}),
							handler: (ctx, { visibility, orgName }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const org = typedCtx.organizations.get(orgName)!
									const note = yield* notes.create({
										content: 'Internal org memo',
										visibility: visibility as Visibility,
										profileType: 'organization',
										profileId: org.id,
										authorId: typedCtx.currentUser!.id,
									})
									return { ...typedCtx, lastNote: note }
								}),
						},
					),
					Then('the note is visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const viewerPerson = typedCtx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									typedCtx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(true)
								return typedCtx
							}),
					}),
					And('the note is visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const viewerPerson = typedCtx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									typedCtx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(true)
								return typedCtx
							}),
					}),
					And('the note is visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const viewerPerson = typedCtx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									typedCtx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(true)
								return typedCtx
							}),
					}),
					And('the note is not visible to {string:viewer}', {
						params: Schema.Struct({ viewer: Schema.String }),
						handler: (ctx, { viewer }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const viewerPerson = typedCtx.people.get(viewer)
								const isVisible = yield* notes.isVisibleTo(
									typedCtx.lastNote!,
									viewerPerson!,
								)
								expect(isVisible).toBe(false)
								return typedCtx
							}),
					}),
				),
		})

		Scenario('Editor edits an existing organization note', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given(
						'a note {string:title} exists on {string:orgName} profile created by {string:author}',
						{
							params: Schema.Struct({
								title: Schema.String,
								orgName: Schema.String,
								author: Schema.String,
							}),
							handler: (_, { title, orgName, author }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const notes = yield* NotesService
									const org = bgCtx.organizations.get(orgName)!
									const authorPerson = bgCtx.people.get(author)!

									const note = yield* notes.createWithTitle({
										title,
										content: title,
										visibility: 'community',
										profileType: 'organization',
										profileId: org.id,
										authorId: authorPerson.id,
									})

									return { ...bgCtx, lastNote: note }
								}),
						},
					),
					And('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (ctx, { name }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...typedCtx, currentUser: user }
							}),
					}),
					When('they edit the note content to {string:newContent}', {
						params: Schema.Struct({ newContent: Schema.String }),
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
					}),
					Then('the note content should be updated', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const note = yield* notes.getById(typedCtx.lastNote!.id)
								expect(note.content).toBe('Mutirão Domingo')
								return typedCtx
							}),
					}),
				),
		})

		Scenario('Viewer cannot edit organization notes', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('a note {string:title} exists on {string:orgName} profile', {
						params: Schema.Struct({
							title: Schema.String,
							orgName: Schema.String,
						}),
						handler: (_, { title, orgName }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const notes = yield* NotesService
								const personRepo = yield* PersonRepository
								const org = bgCtx.organizations.get(orgName)!

								// Create note by someone with full permissions (Maria)
								const maria = yield* personRepo.findByName('Maria')

								const note = yield* notes.createWithTitle({
									title,
									content: 'Original content',
									visibility: 'community',
									profileType: 'organization',
									profileId: org.id,
									authorId: maria.id,
								})

								return { ...bgCtx, lastNote: note }
							}),
					}),
					And('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (ctx, { name }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...typedCtx, currentUser: user }
							}),
					}),
					When('they try to edit the note', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								const result = yield* notes.tryEdit(
									typedCtx.lastNote!.id,
									typedCtx.currentUser!.id,
									'Attempted edit',
								)
								return { ...typedCtx, lastEditResult: result }
							}),
					}),
					Then('the note content should remain unchanged', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								expect(typedCtx.lastEditResult?.success).toBe(false)
								const notes = yield* NotesService
								const note = yield* notes.getById(typedCtx.lastNote!.id)
								expect(note.content).toBe('Original content')
								return typedCtx
							}),
					}),
				),
		})

		Scenario('Person with Full permissions deletes any note', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given(
						'a note {string:title} exists on {string:orgName} profile created by {string:author}',
						{
							params: Schema.Struct({
								title: Schema.String,
								orgName: Schema.String,
								author: Schema.String,
							}),
							handler: (_, { title, orgName, author }) =>
								Effect.gen(function* () {
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const notes = yield* NotesService
									const org = bgCtx.organizations.get(orgName)!
									const authorPerson = bgCtx.people.get(author)!

									const note = yield* notes.createWithTitle({
										title,
										content: title,
										visibility: 'community',
										profileType: 'organization',
										profileId: org.id,
										authorId: authorPerson.id,
									})

									return { ...bgCtx, lastNote: note }
								}),
						},
					),
					And('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (ctx, { name }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...typedCtx, currentUser: user }
							}),
					}),
					When('they delete the note', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								yield* notes.delete(
									typedCtx.lastNote!.id,
									typedCtx.currentUser!.id,
								)
								return typedCtx
							}),
					}),
					Then('the note should be deleted', {
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

		Scenario('Editor deletes a note', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('a note {string:title} exists on {string:orgName} profile', {
						params: Schema.Struct({
							title: Schema.String,
							orgName: Schema.String,
						}),
						handler: (_, { title, orgName }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const notes = yield* NotesService
								const personRepo = yield* PersonRepository
								const org = bgCtx.organizations.get(orgName)!
								const maria = yield* personRepo.findByName('Maria')

								const note = yield* notes.createWithTitle({
									title,
									content: title,
									visibility: 'community',
									profileType: 'organization',
									profileId: org.id,
									authorId: maria.id,
								})

								return { ...bgCtx, lastNote: note }
							}),
					}),
					And('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (ctx, { name }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...typedCtx, currentUser: user }
							}),
					}),
					When('they delete the note', {
						handler: (ctx) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const notes = yield* NotesService
								yield* notes.delete(
									typedCtx.lastNote!.id,
									typedCtx.currentUser!.id,
								)
								return typedCtx
							}),
					}),
					Then('the note should be deleted', {
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

		Scenario('Viewer cannot delete notes', {
			layer: TestLayer,
			steps: () =>
				runSteps(
					Given('a note {string:title} exists on {string:orgName} profile', {
						params: Schema.Struct({
							title: Schema.String,
							orgName: Schema.String,
						}),
						handler: (_, { title, orgName }) =>
							Effect.gen(function* () {
								const bgCtx = yield* getBackgroundContext<NotesTestContext>()
								const notes = yield* NotesService
								const personRepo = yield* PersonRepository
								const org = bgCtx.organizations.get(orgName)!
								const maria = yield* personRepo.findByName('Maria')

								const note = yield* notes.createWithTitle({
									title,
									content: 'Important doc',
									visibility: 'community',
									profileType: 'organization',
									profileId: org.id,
									authorId: maria.id,
								})

								return { ...bgCtx, lastNote: note }
							}),
					}),
					And('{string:name} is logged in', {
						params: Schema.Struct({ name: Schema.String }),
						handler: (ctx, { name }) =>
							Effect.gen(function* () {
								const typedCtx = ctx as NotesTestContext
								const auth = yield* AuthService
								const user = yield* auth.login(name)
								return { ...typedCtx, currentUser: user }
							}),
					}),
					When('they try to delete the note', {
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
					Then('the note should still exist', {
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

	// // -------------------------------------------------------------------------
	// // Rule: Content Auditability (Who changed what?)
	// // -------------------------------------------------------------------------
	Rule(
		'Content Auditability (Who changed what?)',
		({ Background, Scenario }) => {
			Background({
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given('the organization {string:name} exists', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (_, { name }) =>
								Effect.gen(function* () {
									const orgRepo = yield* OrganizationRepository
									const org = yield* orgRepo.create({ name })
									return {
										...initialContext,
										organizations: new Map([[name, org]]),
									}
								}),
						}),
						And('the following people exist:', {
							params: Schema.Struct({
								table: Schema.Array(
									Schema.Struct({
										name: Schema.String,
										permissions: Schema.String,
									}),
								),
							}),
							handler: (ctx, { table }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const bgCtx = yield* getBackgroundContext<NotesTestContext>()
									const personRepo = yield* PersonRepository
									const membershipRepo = yield* MembershipRepository
									const peopleMap = new Map(bgCtx.people)
									const org = Array.from(typedCtx.organizations.values())[0]

									for (const row of table) {
										const person = yield* personRepo.create({
											name: row.name,
											role: 'participant',
											access: 'approved',
										})
										peopleMap.set(person.name, person)

										// Create membership
										yield* membershipRepo.create({
											personName: row.name,
											organizationName: org.name,
											permissions: row.permissions,
										})
									}

									return {
										...typedCtx,
										...bgCtx,
										people: peopleMap,
									}
								}),
						}),
					),
			})

			Scenario('Organization keeps history of edits with author attribution', {
				layer: TestLayer,
				steps: () =>
					runSteps(
						Given(
							"{string:author} creates a note with content {string:content} under {string:orgName}'s profile",
							{
								params: Schema.Struct({
									author: Schema.String,
									content: Schema.String,
									orgName: Schema.String,
								}),
								handler: (_, { author, content, orgName }) =>
									Effect.gen(function* () {
										const bgCtx =
											yield* getBackgroundContext<NotesTestContext>()
										const notes = yield* NotesService
										const auth = yield* AuthService

										const authorPerson = yield* auth.login(author)
										const org = bgCtx.organizations.get(orgName)!

										const note = yield* notes.createWithTitle({
											title: 'Audit Test Note',
											content,
											visibility: 'community',
											profileType: 'organization',
											profileId: org.id,
											authorId: authorPerson.id,
										})

										return {
											...bgCtx,
											lastNote: note,
											currentUser: authorPerson,
										}
									}),
							},
						),
						When('{string:name} logs in', {
							params: Schema.Struct({ name: Schema.String }),
							handler: (ctx, { name }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const auth = yield* AuthService
									const user = yield* auth.login(name)
									return { ...typedCtx, currentUser: user }
								}),
						}),
						And('they edit the note content to {string:newContent}', {
							params: Schema.Struct({ newContent: Schema.String }),
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
						}),
						Then('the note content should be {string:expectedContent}', {
							params: Schema.Struct({ expectedContent: Schema.String }),
							handler: (ctx, { expectedContent }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.getById(typedCtx.lastNote!.id)
									expect(note.content).toBe(expectedContent)
									return typedCtx
								}),
						}),
						And('the note history should contain {int:count} versions', {
							params: Schema.Struct({ count: Schema.Int }),
							handler: (ctx, { count }) =>
								Effect.gen(function* () {
									const typedCtx = ctx as NotesTestContext
									const notes = yield* NotesService
									const note = yield* notes.getById(typedCtx.lastNote!.id)
									expect(note.versions.length).toBe(count)
									return typedCtx
								}),
						}),
						And(
							'version {int:version} should be authored by {string:author} with content {string:content}',
							{
								params: Schema.Struct({
									version: Schema.Int,
									author: Schema.String,
									content: Schema.String,
								}),
								handler: (ctx, { version, author, content }) =>
									Effect.gen(function* () {
										const typedCtx = ctx as NotesTestContext
										const notes = yield* NotesService
										const personRepo = yield* PersonRepository

										const note = yield* notes.getById(typedCtx.lastNote!.id)
										const authorPerson = yield* personRepo.findByName(author)

										const noteVersion = note.versions[version - 1]
										expect(noteVersion.content).toBe(content)
										expect(noteVersion.authorId).toBe(authorPerson.id)

										return typedCtx
									}),
							},
						),
						And(
							'version {int:version} should be authored by {string:author} with content {string:content}',
							{
								params: Schema.Struct({
									version: Schema.Int,
									author: Schema.String,
									content: Schema.String,
								}),
								handler: (ctx, { version, author, content }) =>
									Effect.gen(function* () {
										const typedCtx = ctx as NotesTestContext
										const notes = yield* NotesService
										const personRepo = yield* PersonRepository

										const note = yield* notes.getById(typedCtx.lastNote!.id)
										const authorPerson = yield* personRepo.findByName(author)

										const noteVersion = note.versions[version - 1]
										expect(noteVersion.content).toBe(content)
										expect(noteVersion.authorId).toBe(authorPerson.id)

										return typedCtx
									}),
							},
						),
					),
			})
		},
	)
})
