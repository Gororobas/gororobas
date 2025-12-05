import { LoroDoc } from 'loro-crdt'
import { Mirror, SyncDirection, schema } from 'loro-mirror'

// 1) Declare state shape
const appSchema = schema({
	names: schema.LoroMovableList(
		schema.LoroMap({
			pt: schema.String(),
			es: schema.String(),
		}),
		// $cid is the container ID of LoroMap assigned by Loro
		(t) => t.$cid,
	),
	scientific_names: schema.LoroMovableList(
		schema.LoroMap({
			pt: schema.String(),
			es: schema.String(),
		}),
		// $cid is the container ID of LoroMap assigned by Loro
		(t) => t.$cid,
	),
	origin: schema.LoroMap({
		pt: schema.String(),
		es: schema.String(),
	}),
	// development_cycle_min: schema.Number(),

	// @TODO type enums
	gender: schema.LoroText(),
})

// 2) Create a Loro document and a Mirror store
const doc = new LoroDoc()
const docStart = doc.version()
const docStartFrontier = doc.frontiers()
const gender = doc.getText('gender')
gender.insert(0, 'Starting Gender')

const origin = doc.getMap('origin')
origin.set('pt', 'Origem inicial #0')
origin.set('es', 'Origen inicial #0')

const names = doc.getMovableList('names')
names.insert(0, { pt: 'Nome #1.0', es: 'Nombre #1.0' })
names.insert(1, { pt: 'Nome #2.0', es: 'Nombre #2.0' })
names.insert(2, { pt: 'Nome #3.0', es: 'Nombre #3.0' })

const scientific_names = doc.getMovableList('scientific_names')
scientific_names.insert(0, {
	pt: 'Nome cientifico #1.0',
	es: 'Nombre cientifico #1.0',
})
scientific_names.insert(1, {
	pt: 'Nome cientifico #2.0',
	es: 'Nombre cientifico #2.0',
})
scientific_names.insert(2, {
	pt: 'Nome cientifico #3.0',
	es: 'Nombre cientifico #3.0',
})

Bun.write('.data/004-start-doc.loro', doc.export({ mode: 'snapshot' }))

const store = new Mirror({
	doc,
	schema: appSchema,
})

// 3) Subscribe (optional) – know whether updates came from local or remote
const unsubscribe = store.subscribe((state, { direction, tags }) => {
	if (direction === SyncDirection.FROM_LORO) {
		console.log('Remote update', { state, tags })
	} else {
		console.log('Local update', { state, tags })
	}

	// You can use `state` to render directly, it's a new immutable object that shares
	// the unchanged fields with the old state
	// setAppState(state);
})

const initialJsonData = store.getState()
const finalJsonData = {
	origin: {
		$cid: 'cid:root-origin:Map',
		es: 'Origen inicial #0',
		pt: 'Origem inicial #0',
	},
	names: [
		{
			pt: 'Nome #1.0',
			es: 'Nombre #1.0',
		},
		{
			pt: 'Nome #2.1',
			es: 'Nombre #2.1',
		},
		{
			pt: 'Nome #3.0',
			es: 'Nombre #3.0',
		},
	],
	scientific_names: [
		{
			pt: 'Nome cientifico #1.0',
			es: 'Nombre cientifico #1.0',
		},
		{
			pt: 'Nome cientifico #2.0',
			es: 'Nombre cientifico #2.0',
		},
		{
			pt: 'Nome cientifico #3.1',
			es: 'Nombre cientifico #3.1',
		},
	],
	gender: 'Final Gender',
}
store.setState((s) => ({ ...s, ...finalJsonData }))
console.log({ initialJsonData, finalJsonData })

Bun.write(
	'.data/004-final-json-updates.json',
	JSON.stringify(doc.exportJsonUpdates(docStart, undefined, true), null, 2),
)
Bun.write(
	'.data/004-final-shallow-snapshot.loro',
	doc.export({ mode: 'shallow-snapshot', frontiers: docStartFrontier }),
)
Bun.write('.data/004-final-snapshot.loro', doc.export({ mode: 'snapshot' }))
Bun.write(
	'.data/004-final-update.loro',
	doc.export({ mode: 'update', from: docStart }),
)
