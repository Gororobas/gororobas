import { Database } from 'bun:sqlite'
import { Model } from '@effect/sql'
import { randCountry, randFood } from '@ngneat/falso'
import { Arbitrary, FastCheck, Schema } from 'effect'
import { LoroDoc } from 'loro-crdt'
import {
	AgroforestryStratum,
	EdibleVegetablePart,
	Gender,
	Handle,
	PlantingMethod,
	TiptapDocument,
	VegetableId,
	VegetableLifecycle,
	VegetableUsage,
} from '@/schema'

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

// The properties are materialized on every write from the stored loro_crdt
db.run(`
  CREATE TABLE VEGETABLE (
    id TEXT PRIMARY KEY,
    loro_crdt BLOB NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    scientific_names TEXT NOT NULL, -- JSON array
    common_names TEXT NOT NULL, -- JSON {pt: [], es: []}
    strata TEXT, -- JSON array
    lifecycles TEXT, -- JSON array
    uses TEXT, -- JSON array
    edible_parts TEXT, -- JSON array
    planting_methods TEXT, -- JSON array
    height_cm TEXT, -- JSON {min, max}
    temp_celsius TEXT, -- JSON {min, max}
    cycle_days TEXT, -- JSON {min, max}
    photos TEXT, -- JSON array
    content TEXT NOT NULL, -- JSON {pt: {json, text}, es: ...}
    origin TEXT NOT NULL, -- JSON {pt: string, es: string}
    gender TEXT NOT NULL -- JSON {pt: enum, es: enum}
  )
`)

// When applied, the loro_crdt inside the revision should be applied to the main vegetable's loro_crdt
db.run(`
  CREATE TABLE VEGETABLE_REVISION (
    id INTEGER PRIMARY KEY,
    loro_diff JSON NOT NULL,
    vegetable_id TEXT NOT NULL, -- Pointer to Veg/Variety
    author_id TEXT NOT NULL, -- Pointer to Profile
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED')),
    reject_reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES PROFILE(id),
    FOREIGN KEY (author_id) REFERENCES VEGETABLE(id)
  )
`)
console.timeEnd('Setting up database')

const insertVegetable =
	db.prepare(`INSERT INTO VEGETABLE (loro_crdt, handle, scientific_names, strata, lifecycles, uses, edible_parts, planting_methods, height_cm, temp_celsius, cycle_days, photos, common_names, content, origin, gender)
	VALUES ($loro_crdt, $handle, $scientific_names, $strata, $lifecycles, $uses, $edible_parts, $planting_methods, $height_cm, $temp_celsius, $cycle_days, $photos, $common_names, $content, $origin, $gender)`)

class Vegetable extends Model.Class<Vegetable>('Vegetable')({
	id: Model.Generated(VegetableId),
	loro_crdt: Schema.Uint8Array,
	handle: Handle,
	scientific_names: Model.FieldOption(
		Schema.Array(Schema.NonEmptyTrimmedString),
	),
	gender: Gender.pipe(Schema.annotations({ default: 'NEUTRAL' })),

	// ARRAYS
	// Do I use JsonFromString?
	strata: Model.JsonFromString(Schema.Set(AgroforestryStratum)),
	lifecycles: Model.FieldOption(Schema.Set(VegetableLifecycle)),
	uses: Model.FieldOption(Schema.Set(VegetableUsage)),
	edible_parts: Model.FieldOption(Schema.Set(EdibleVegetablePart)),
	planting_methods: Model.FieldOption(Schema.Set(PlantingMethod)),
	external_resources: Model.FieldOption(Schema.Array(Schema.URL)),

	development_cycle_min: Model.FieldOption(Schema.Int),
	development_cycle_max: Model.FieldOption(Schema.Int),
	height_min: Model.FieldOption(Schema.Int),
	height_max: Model.FieldOption(Schema.Int),
	temperature_min: Model.FieldOption(Schema.Number),
	temperature_max: Model.FieldOption(Schema.Number),

	// Localized:
	content: TiptapDocument,
	origin: Schema.String.annotations({
		arbitrary: () => (fc) => fc.constant(null).map(() => randCountry()),
	}),
	common_names: Schema.NonEmptyArray(
		Schema.NonEmptyTrimmedString.annotations({
			arbitrary: () => (fc) => fc.constant(null).map(() => randFood()),
		}),
	),
}) {}

const VegetableCreation = Vegetable.jsonCreate

function createVegetable(vegetable: typeof VegetableCreation.Type) {
	const initialDoc = new LoroDoc()
	const loroBlob = initialDoc.export({ mode: 'snapshot' })
	insertVegetable.run({
		$loro_crdt: loroBlob,
		$handle: vegetable.handle,
		$scientific_names: JSON.stringify(vegetable.scientific_names),
		$common_names: JSON.stringify(vegetable.common_names),
		$content: JSON.stringify(vegetable.content),
		$origin: vegetable.origin,
		$gender: vegetable.gender,
	})
}

const vegetables = FastCheck.sample(Arbitrary.make(Vegetable.jsonCreate), 1000)
vegetables.forEach(createVegetable)

console.log(db.prepare(`SELECT * from VEGETABLE`).all())
