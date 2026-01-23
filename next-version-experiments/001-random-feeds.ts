import { Database } from 'bun:sqlite'
import { randCat, randNumber, randParagraph, seed } from '@ngneat/falso'

seed('Same thing')

console.time('Setting up database')
const db = new Database(':memory:')
db.run(
	'CREATE TABLE cats (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, description TEXT)',
)
console.timeEnd('Setting up database')

const insertCat = db.prepare(
	'INSERT INTO cats (name, age, description) VALUES ($name, $age, $description)',
)
const insertCats = db.transaction((cats) => {
	for (const cat of cats) insertCat.run(cat)
})
const CATS_TO_ADD = Array.from({ length: 100_000 }).map(() => ({
	$name: randCat(),
	$age: randNumber({ min: 0, max: 24 }),
	$description: randParagraph({ length: randNumber({ min: 3, max: 10 }) }).join(
		'\n',
	),
}))
console.time('Adding cats')
insertCats(CATS_TO_ADD)
console.timeEnd('Adding cats')

// Reset the seed for the random order
seed()

console.time('Getting random cats')
const randomCats = db
	.query(
		'SELECT id, name, age FROM cats ORDER BY ((cats.id + $seed) * 1103515245 + 12345) % 2147483648 LIMIT 4',
	)
	.all({ $seed: randNumber() })
console.timeEnd('Getting random cats')

console.time('Getting first cats')
const firstCats = db.query('SELECT * FROM cats LIMIT 4').all()
console.timeEnd('Getting first cats')

console.time('Getting count')
const count = db.query('SELECT COUNT(*) FROM cats').get()
console.timeEnd('Getting count')

// console.log({firstCats, randomCats, count});

// import { heapStats } from "bun:jsc";
// console.log(heapStats());
