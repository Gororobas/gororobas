import { Database } from 'bun:sqlite'
import {
	randBoolean,
	randEmail,
	randFullName,
	randNumber,
	randParagraph,
	randPastDate,
	randUrl,
	randUuid,
	randWord,
	seed,
} from '@ngneat/falso'

seed('Data model seed')

console.time('Setting up database')
const db = new Database(':memory:')

// Create tables
db.run(`
  CREATE TABLE USER (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MODERATOR', 'USER'))
  )
`)

db.run(`
  CREATE TABLE PROFILE (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    location TEXT, -- JSON geolocation
    type TEXT NOT NULL CHECK (type IN ('Person', 'Organization')),
    role TEXT NOT NULL CHECK (role IN ('User', 'Guardian', 'Admin')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES USER(id)
  )
`)

db.run(`
  CREATE TABLE NOTE (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    content_json TEXT NOT NULL, -- JSON Tiptap
    content_text TEXT NOT NULL,
    translations TEXT, -- JSON
    original_language TEXT CHECK (original_language IN ('pt', 'es')),
    types TEXT NOT NULL CHECK (types IN ('EXPERIMENT', 'QUESTION')), -- simplified
    publish_status TEXT NOT NULL CHECK (publish_status IN ('PUBLIC', 'PRIVATE', 'COMMUNITY')),
    note_index INTEGER NOT NULL
  )
`)

db.run(`
  CREATE TABLE VEGETABLE (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    scientific_names TEXT NOT NULL, -- JSON array
    stratum TEXT CHECK (stratum IN ('Emergent', 'High', 'Medium', 'Low')),
    strata TEXT, -- JSON array
    lifecycles TEXT, -- JSON array
    uses TEXT, -- JSON array
    edible_parts TEXT, -- JSON array
    planting_methods TEXT, -- JSON array
    height_cm TEXT, -- JSON {min, max}
    temp_celsius TEXT, -- JSON {min, max}
    cycle_days TEXT, -- JSON {min, max}
    photos TEXT, -- JSON array
    common_names TEXT NOT NULL, -- JSON {pt: [], es: []}
    description TEXT NOT NULL, -- JSON {pt: {json, text}, es: ...}
    origin TEXT NOT NULL, -- JSON {pt: string, es: string}
    gender TEXT NOT NULL -- JSON {pt: enum, es: enum}
  )
`)

db.run(`
  CREATE TABLE VARIETY (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    vegetable_id TEXT,
    scientific_names TEXT, -- JSON array
    common_names TEXT, -- JSON {pt: [], es: []}
    description TEXT, -- JSON {pt: {json, text}, es: ...}
    stratum TEXT CHECK (stratum IN ('Emergent', 'High', 'Medium', 'Low')),
    strata TEXT, -- JSON array
    lifecycles TEXT, -- JSON array
    uses TEXT, -- JSON array
    edible_parts TEXT, -- JSON array
    planting_methods TEXT, -- JSON array
    height_cm TEXT, -- JSON {min, max}
    temp_celsius TEXT, -- JSON {min, max}
    cycle_days TEXT, -- JSON {min, max}
    photos TEXT, -- JSON array
    FOREIGN KEY (vegetable_id) REFERENCES VEGETABLE(id)
  )
`)

db.run(`
  CREATE TABLE EDIT_PROPOSAL (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL, -- Pointer to Veg/Variety
    author_id TEXT NOT NULL, -- Pointer to Profile
    operation TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED')),
    reject_reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES PROFILE(id)
  )
`)

db.run(`
  CREATE TABLE RESOURCE (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('VIDEO', 'BOOK')), -- simplified
    title TEXT NOT NULL, -- JSON {pt: string, es: string}
    description TEXT NOT NULL, -- JSON {pt: {json, text}, es: ...}
    original_language TEXT
  )
`)

// Relationship tables
db.run(`
  CREATE TABLE PROFILE_NOTE (
    profile_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    PRIMARY KEY (profile_id, note_id),
    FOREIGN KEY (profile_id) REFERENCES PROFILE(id),
    FOREIGN KEY (note_id) REFERENCES NOTE(id)
  )
`)

db.run(`
  CREATE TABLE PROFILE_EDIT_PROPOSAL (
    profile_id TEXT NOT NULL,
    edit_proposal_id TEXT NOT NULL,
    PRIMARY KEY (profile_id, edit_proposal_id),
    FOREIGN KEY (profile_id) REFERENCES PROFILE(id),
    FOREIGN KEY (edit_proposal_id) REFERENCES EDIT_PROPOSAL(id)
  )
`)

db.run(`
  CREATE TABLE VEGETABLE_VARIETY (
    vegetable_id TEXT NOT NULL,
    variety_id TEXT NOT NULL,
    PRIMARY KEY (vegetable_id, variety_id),
    FOREIGN KEY (vegetable_id) REFERENCES VEGETABLE(id),
    FOREIGN KEY (variety_id) REFERENCES VARIETY(id)
  )
`)

db.run(`
  CREATE TABLE VEGETABLE_CONSORTIUM (
    vegetable_id TEXT NOT NULL,
    consortium_vegetable_id TEXT NOT NULL,
    PRIMARY KEY (vegetable_id, consortium_vegetable_id),
    FOREIGN KEY (vegetable_id) REFERENCES VEGETABLE(id),
    FOREIGN KEY (consortium_vegetable_id) REFERENCES VEGETABLE(id),
    CHECK (vegetable_id != consortium_vegetable_id)
  )
`)

db.run(`
  CREATE TABLE NOTE_MENTIONS (
    note_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('VEGETABLE', 'VARIETY', 'PROFILE', 'RESOURCE', 'NOTE')),
    entity_id TEXT NOT NULL,
    PRIMARY KEY (note_id, entity_type, entity_id),
    FOREIGN KEY (note_id) REFERENCES NOTE(id)
  )
`)

db.run(`
  CREATE TABLE RESOURCE_VEGETABLE (
    resource_id TEXT NOT NULL,
    vegetable_id TEXT NOT NULL,
    PRIMARY KEY (resource_id, vegetable_id),
    FOREIGN KEY (resource_id) REFERENCES RESOURCE(id),
    FOREIGN KEY (vegetable_id) REFERENCES VEGETABLE(id)
  )
`)

console.timeEnd('Setting up database')

// Generate fake data
console.time('Generating fake data')

// Users
const users = Array.from({ length: 100 }).map(() => ({
	id: randUuid(),
	email: randEmail(),
	role:
		randNumber({ min: 0, max: 2 }) === 0
			? 'ADMIN'
			: randNumber({ min: 0, max: 1 }) === 0
				? 'MODERATOR'
				: 'USER',
}))

// Profiles
const profiles = users.map((user) => ({
	id: randUuid(),
	user_id: user.id,
	handle: randWord().toLowerCase() + randNumber({ min: 100, max: 999 }),
	name: randFullName(),
	bio: randParagraph({ length: randNumber({ min: 1, max: 3 }) }).join(' '),
	avatar_url: randUrl(),
	location: JSON.stringify({
		lat: randNumber({ min: -90, max: 90 }),
		lng: randNumber({ min: -180, max: 180 }),
	}),
	type: randBoolean() ? 'Person' : 'Organization',
	role:
		randNumber({ min: 0, max: 2 }) === 0
			? 'Admin'
			: randNumber({ min: 0, max: 1 }) === 0
				? 'Guardian'
				: 'User',
	created_at: randPastDate().toISOString(),
}))

// Vegetables
const vegetables = Array.from({ length: 50 }).map(() => ({
	id: randUuid(),
	handle: randWord().toLowerCase() + randNumber({ min: 1000, max: 9999 }),
	scientific_names: JSON.stringify([randWord() + ' ' + randWord()]),
	stratum: ['Emergent', 'High', 'Medium', 'Low'][
		randNumber({ min: 0, max: 3 })
	],
	strata: JSON.stringify(
		['Emergent', 'High', 'Medium', 'Low'].slice(
			0,
			randNumber({ min: 1, max: 4 }),
		),
	),
	lifecycles: JSON.stringify(
		['Annual', 'Biennial', 'Perennial'].slice(
			0,
			randNumber({ min: 1, max: 3 }),
		),
	),
	uses: JSON.stringify(
		['Food', 'Medicine', 'Ornamental'].slice(0, randNumber({ min: 1, max: 3 })),
	),
	edible_parts: JSON.stringify(
		['Leaves', 'Roots', 'Fruits'].slice(0, randNumber({ min: 1, max: 3 })),
	),
	planting_methods: JSON.stringify(
		['Seeds', 'Cuttings', 'Transplant'].slice(
			0,
			randNumber({ min: 1, max: 3 }),
		),
	),
	height_cm: JSON.stringify({
		min: randNumber({ min: 10, max: 50 }),
		max: randNumber({ min: 50, max: 200 }),
	}),
	temp_celsius: JSON.stringify({
		min: randNumber({ min: 10, max: 20 }),
		max: randNumber({ min: 20, max: 30 }),
	}),
	cycle_days: JSON.stringify({
		min: randNumber({ min: 30, max: 60 }),
		max: randNumber({ min: 60, max: 120 }),
	}),
	photos: JSON.stringify([randUrl(), randUrl()]),
	common_names: JSON.stringify({ pt: [randWord()], es: [randWord()] }),
	description: JSON.stringify({
		pt: { json: randParagraph(), text: randParagraph() },
		es: { json: randParagraph(), text: randParagraph() },
	}),
	origin: JSON.stringify({ pt: randWord(), es: randWord() }),
	gender: JSON.stringify({
		pt: ['MALE', 'FEMALE', 'NEUTRAL'][randNumber({ min: 0, max: 2 })],
		es: ['MALE', 'FEMALE', 'NEUTRAL'][randNumber({ min: 0, max: 2 })],
	}),
}))

// Varieties
const varieties = Array.from({ length: 100 }).map(() => ({
	id: randUuid(),
	handle: randWord().toLowerCase() + randNumber({ min: 10000, max: 99999 }),
	vegetable_id:
		vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id,
	scientific_names: JSON.stringify([randWord() + ' ' + randWord()]),
	common_names: JSON.stringify({ pt: [randWord()], es: [randWord()] }),
	description: JSON.stringify({
		pt: { json: randParagraph(), text: randParagraph() },
		es: { json: randParagraph(), text: randParagraph() },
	}),
	stratum: ['Emergent', 'High', 'Medium', 'Low'][
		randNumber({ min: 0, max: 3 })
	],
	strata: JSON.stringify(
		['Emergent', 'High', 'Medium', 'Low'].slice(
			0,
			randNumber({ min: 1, max: 4 }),
		),
	),
	lifecycles: JSON.stringify(
		['Annual', 'Biennial', 'Perennial'].slice(
			0,
			randNumber({ min: 1, max: 3 }),
		),
	),
	uses: JSON.stringify(
		['Food', 'Medicine', 'Ornamental'].slice(0, randNumber({ min: 1, max: 3 })),
	),
	edible_parts: JSON.stringify(
		['Leaves', 'Roots', 'Fruits'].slice(0, randNumber({ min: 1, max: 3 })),
	),
	planting_methods: JSON.stringify(
		['Seeds', 'Cuttings', 'Transplant'].slice(
			0,
			randNumber({ min: 1, max: 3 }),
		),
	),
	height_cm: JSON.stringify({
		min: randNumber({ min: 10, max: 50 }),
		max: randNumber({ min: 50, max: 200 }),
	}),
	temp_celsius: JSON.stringify({
		min: randNumber({ min: 10, max: 20 }),
		max: randNumber({ min: 20, max: 30 }),
	}),
	cycle_days: JSON.stringify({
		min: randNumber({ min: 30, max: 60 }),
		max: randNumber({ min: 60, max: 120 }),
	}),
	photos: JSON.stringify([randUrl(), randUrl()]),
}))

// Notes
const notes = Array.from({ length: 500 }).map((_, i) => ({
	id: randUuid(),
	handle: 'note-' + randNumber({ min: 100000, max: 999999 }),
	created_at: randPastDate().toISOString(),
	content_json: JSON.stringify({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text: randParagraph() }],
			},
		],
	}),
	content_text: randParagraph({ length: randNumber({ min: 5, max: 20 }) }).join(
		' ',
	),
	translations: JSON.stringify({
		pt: randParagraph(),
		es: randParagraph(),
	}),
	original_language: randBoolean() ? 'pt' : 'es',
	types: randBoolean() ? 'EXPERIMENT' : 'QUESTION',
	publish_status: ['PUBLIC', 'PRIVATE', 'COMMUNITY'][
		randNumber({ min: 0, max: 2 })
	],
	note_index: i,
}))

// Edit Proposals
const editProposals = Array.from({ length: 50 }).map(() => ({
	id: randUuid(),
	target_id: randBoolean()
		? vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id
		: varieties[randNumber({ min: 0, max: varieties.length - 1 })]!.id,
	author_id: profiles[randNumber({ min: 0, max: profiles.length - 1 })]!.id,
	operation: 'UPDATE_DESC',
	payload: JSON.stringify({ description: randParagraph() }),
	status: ['PENDING', 'APPLIED', 'REJECTED'][randNumber({ min: 0, max: 2 })],
	reject_reason: randBoolean() ? randParagraph() : null,
	created_at: randPastDate().toISOString(),
}))

// Resources
const resources = Array.from({ length: 30 }).map(() => ({
	id: randUuid(),
	handle: 'resource-' + randNumber({ min: 10000, max: 99999 }),
	url: randUrl(),
	format: randBoolean() ? 'VIDEO' : 'BOOK',
	title: JSON.stringify({
		pt: randWord() + ' ' + randWord(),
		es: randWord() + ' ' + randWord(),
	}),
	description: JSON.stringify({
		pt: { json: randParagraph(), text: randParagraph() },
		es: { json: randParagraph(), text: randParagraph() },
	}),
	original_language: randBoolean() ? 'pt' : 'es',
}))

console.timeEnd('Generating fake data')

// Insert data
console.time('Inserting data')

// Prepared statements
const insertUser = db.prepare(
	'INSERT INTO USER (id, email, role) VALUES (?, ?, ?)',
)
const insertProfile = db.prepare(
	'INSERT INTO PROFILE (id, user_id, handle, name, bio, avatar_url, location, type, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertNote = db.prepare(
	'INSERT INTO NOTE (id, handle, created_at, content_json, content_text, translations, original_language, types, publish_status, note_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertVegetable = db.prepare(
	'INSERT INTO VEGETABLE (id, handle, scientific_names, stratum, strata, lifecycles, uses, edible_parts, planting_methods, height_cm, temp_celsius, cycle_days, photos, common_names, description, origin, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertVariety = db.prepare(
	'INSERT INTO VARIETY (id, handle, vegetable_id, scientific_names, common_names, description, stratum, strata, lifecycles, uses, edible_parts, planting_methods, height_cm, temp_celsius, cycle_days, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertEditProposal = db.prepare(
	'INSERT INTO EDIT_PROPOSAL (id, target_id, author_id, operation, payload, status, reject_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertResource = db.prepare(
	'INSERT INTO RESOURCE (id, handle, url, format, title, description, original_language) VALUES (?, ?, ?, ?, ?, ?, ?)',
)

// Transactions
const insertUsers = db.transaction((users) => {
	for (const user of users) insertUser.run(user.id, user.email, user.role)
})

const insertProfiles = db.transaction((profiles) => {
	for (const profile of profiles)
		insertProfile.run(
			profile.id,
			profile.user_id,
			profile.handle,
			profile.name,
			profile.bio,
			profile.avatar_url,
			profile.location,
			profile.type,
			profile.role,
			profile.created_at,
		)
})

const insertNotes = db.transaction((notes) => {
	for (const note of notes)
		insertNote.run(
			note.id,
			note.handle,
			note.created_at,
			note.content_json,
			note.content_text,
			note.translations,
			note.original_language,
			note.types,
			note.publish_status,
			note.note_index,
		)
})

const insertVegetables = db.transaction((vegetables) => {
	for (const veg of vegetables)
		insertVegetable.run(
			veg.id,
			veg.handle,
			veg.scientific_names,
			veg.stratum,
			veg.strata,
			veg.lifecycles,
			veg.uses,
			veg.edible_parts,
			veg.planting_methods,
			veg.height_cm,
			veg.temp_celsius,
			veg.cycle_days,
			veg.photos,
			veg.common_names,
			veg.description,
			veg.origin,
			veg.gender,
		)
})

const insertVarieties = db.transaction((varieties) => {
	for (const var_ of varieties)
		insertVariety.run(
			var_.id,
			var_.handle,
			var_.vegetable_id,
			var_.scientific_names,
			var_.common_names,
			var_.description,
			var_.stratum,
			var_.strata,
			var_.lifecycles,
			var_.uses,
			var_.edible_parts,
			var_.planting_methods,
			var_.height_cm,
			var_.temp_celsius,
			var_.cycle_days,
			var_.photos,
		)
})

const insertEditProposals = db.transaction((editProposals) => {
	for (const ep of editProposals)
		insertEditProposal.run(
			ep.id,
			ep.target_id,
			ep.author_id,
			ep.operation,
			ep.payload,
			ep.status,
			ep.reject_reason,
			ep.created_at,
		)
})

const insertResources = db.transaction((resources) => {
	for (const res of resources)
		insertResource.run(
			res.id,
			res.handle,
			res.url,
			res.format,
			res.title,
			res.description,
			res.original_language,
		)
})

insertUsers(users)
insertProfiles(profiles)
insertVegetables(vegetables)
insertVarieties(varieties)
insertNotes(notes)
insertEditProposals(editProposals)
insertResources(resources)

// Relationships
// Profile-Note (published)
const profileNotes = notes.map((note) => ({
	profile_id: profiles[randNumber({ min: 0, max: profiles.length - 1 })]!.id,
	note_id: note.id,
}))
const insertProfileNote = db.prepare(
	'INSERT INTO PROFILE_NOTE (profile_id, note_id) VALUES (?, ?)',
)
const insertProfileNotes = db.transaction((profileNotes) => {
	for (const pn of profileNotes)
		insertProfileNote.run(pn.profile_id, pn.note_id)
})
insertProfileNotes(profileNotes)

// Profile-EditProposal
const profileEPs = editProposals.map((ep) => ({
	profile_id: ep.author_id,
	edit_proposal_id: ep.id,
}))
const insertProfileEP = db.prepare(
	'INSERT INTO PROFILE_EDIT_PROPOSAL (profile_id, edit_proposal_id) VALUES (?, ?)',
)
const insertProfileEPs = db.transaction((profileEPs) => {
	for (const pep of profileEPs)
		insertProfileEP.run(pep.profile_id, pep.edit_proposal_id)
})
insertProfileEPs(profileEPs)

// Vegetable-Variety (already set in variety.vegetable_id)

// Vegetable Consortium
const consortiumSet = new Set<string>()
while (consortiumSet.size < 100) {
	const v1 = vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id
	let v2 = vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id
	while (v2 === v1)
		v2 = vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id
	const key = v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`
	consortiumSet.add(key)
}
const consortiums = Array.from(consortiumSet).map((key) => {
	const [v1, v2] = key.split('|')
	return { vegetable_id: v1, consortium_vegetable_id: v2 }
})
const insertConsortium = db.prepare(
	'INSERT INTO VEGETABLE_CONSORTIUM (vegetable_id, consortium_vegetable_id) VALUES (?, ?)',
)
const insertConsortiums = db.transaction((consortiums) => {
	for (const c of consortiums)
		insertConsortium.run(c.vegetable_id, c.consortium_vegetable_id)
})
insertConsortiums(consortiums)

// Note Mentions
const mentions = []
for (const note of notes) {
	const mentionSet = new Set<string>()
	const numMentions = randNumber({ min: 0, max: 3 })
	for (let i = 0; i < numMentions; i++) {
		const types = ['VEGETABLE', 'VARIETY', 'PROFILE', 'RESOURCE', 'NOTE']
		const type = types[randNumber({ min: 0, max: types.length - 1 })]
		let entity_id
		if (type === 'VEGETABLE')
			entity_id =
				vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id
		else if (type === 'VARIETY')
			entity_id =
				varieties[randNumber({ min: 0, max: varieties.length - 1 })]!.id
		else if (type === 'PROFILE')
			entity_id = profiles[randNumber({ min: 0, max: profiles.length - 1 })]!.id
		else if (type === 'RESOURCE')
			entity_id =
				resources[randNumber({ min: 0, max: resources.length - 1 })]!.id
		else entity_id = notes[randNumber({ min: 0, max: notes.length - 1 })]!.id
		const key = `${type}|${entity_id}`
		if (!mentionSet.has(key)) {
			mentionSet.add(key)
			mentions.push({ note_id: note.id, entity_type: type, entity_id })
		}
	}
}
const insertMention = db.prepare(
	'INSERT INTO NOTE_MENTIONS (note_id, entity_type, entity_id) VALUES (?, ?, ?)',
)
const insertMentions = db.transaction((mentions) => {
	for (const m of mentions)
		insertMention.run(m.note_id, m.entity_type, m.entity_id)
})
insertMentions(mentions)

// Resource-Vegetable
const resVegs = []
for (const res of resources) {
	const num = randNumber({ min: 0, max: 3 })
	for (let i = 0; i < num; i++) {
		resVegs.push({
			resource_id: res.id,
			vegetable_id:
				vegetables[randNumber({ min: 0, max: vegetables.length - 1 })]!.id,
		})
	}
}
const insertResVeg = db.prepare(
	'INSERT INTO RESOURCE_VEGETABLE (resource_id, vegetable_id) VALUES (?, ?)',
)
const insertResVegs = db.transaction((resVegs) => {
	for (const rv of resVegs) insertResVeg.run(rv.resource_id, rv.vegetable_id)
})
insertResVegs(resVegs)

console.timeEnd('Inserting data')

// Verify
console.log('Counts:')
console.log('Users:', db.query('SELECT COUNT(*) FROM USER').get())
console.log('Profiles:', db.query('SELECT COUNT(*) FROM PROFILE').get())
console.log('Notes:', db.query('SELECT COUNT(*) FROM NOTE').get())
console.log('Vegetables:', db.query('SELECT COUNT(*) FROM VEGETABLE').get())
console.log('Varieties:', db.query('SELECT COUNT(*) FROM VARIETY').get())
console.log(
	'Edit Proposals:',
	db.query('SELECT COUNT(*) FROM EDIT_PROPOSAL').get(),
)
console.log('Resources:', db.query('SELECT COUNT(*) FROM RESOURCE').get())
console.log(
	'Profile-Notes:',
	db.query('SELECT COUNT(*) FROM PROFILE_NOTE').get(),
)
console.log(
	'Consortiums:',
	db.query('SELECT COUNT(*) FROM VEGETABLE_CONSORTIUM').get(),
)
console.log('Mentions:', db.query('SELECT COUNT(*) FROM NOTE_MENTIONS').get())
console.log(
	'Resource-Vegs:',
	db.query('SELECT COUNT(*) FROM RESOURCE_VEGETABLE').get(),
)
