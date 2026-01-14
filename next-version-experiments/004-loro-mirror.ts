import { VegetableDataLoro } from '004-loro-mirror.lib'
import { LoroDoc } from 'loro-crdt'
import { Mirror } from 'loro-mirror'

// 2) Create a Loro document and a Mirror store and set the initial document
const initialDoc = new LoroDoc()
const initialDocStore = new Mirror({
	doc: initialDoc,
	schema: VegetableDataLoro,
})
initialDocStore.setState(() => ({
	metadata: {
		handle: 'zea-mays',
		scientific_names: [{ value: 'Zea Mays' }],
		strata: ['EMERGENT'],
		planting_methods: ['SEED'],
		edible_parts: ['SEED'],
		lifecycles: ['SEMIANNUAL'],
		uses: ['SACRED', 'HUMAN_FEED'],
		development_cycle_min: 120,
		development_cycle_max: 210,
		height_min: 60,
		height_max: 400,
		temperature_min: 15,
		temperature_max: 35,
		main_photo_id: '123',
	},
	locales: {
		pt: {
			gender: 'MALE',
			origin: 'América Central',
			content: 'Algo sobre o milho',
			common_names: [{ value: 'Milho' }, { value: 'Maíz (Espanhol)' }],
		},
		es: {
			gender: 'MALE',
			origin: 'America Central',
			content: 'Algo sobre el maíz',
			common_names: [{ value: 'Maíz' }, { value: 'Milho (Português)' }],
		},
	},
}))

// 3) fork document and make changes
const editedDoc = initialDoc.fork()
const editedStore = new Mirror({
	doc: editedDoc,
	schema: VegetableDataLoro,
})

editedStore.setState((s) => ({
	...s,
	metadata: { ...s.metadata, development_cycle_max: 520 },
}))
editedStore.setState((s) => {
	if (!s.locales.en) {
		// @TODO: is there a better way to set a missing object?
		return {
			...s,
			locales: {
				...s.locales,
				en: { common_names: [{ value: 'Corn' }, { value: 'Maize' }] },
			},
		}
	}
	s.locales.en.common_names.push({ value: 'Corn' })
	s.locales.en.common_names.push({ value: 'Maize' })
})
editedStore.setState((s) => {
	s.locales.pt?.common_names.push({ value: 'Maize' })
})

const finalDoc = initialDoc.fork()
finalDoc.applyDiff(
	editedDoc.diff(initialDoc.frontiers(), editedDoc.frontiers()),
)
finalDoc.commit({ message: 'commit-message-with-user-id' })

Bun.write('.data/004-initial-doc.loro', initialDoc.export({ mode: 'snapshot' }))
Bun.write(
	'.data/004-diff.json',
	JSON.stringify(
		editedDoc.diff(initialDoc.frontiers(), editedDoc.frontiers(), true),
		null,
		2,
	),
)
Bun.write(
	'.data/004-final-data.json',
	JSON.stringify(finalDoc.toJSON(), null, 2),
)
Bun.write('.data/004-final-doc.loro', finalDoc.export({ mode: 'snapshot' }))
