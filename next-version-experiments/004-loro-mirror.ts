import { LoroDoc } from 'loro-crdt'
import { schema as loroSchema, Mirror } from 'loro-mirror'

const VegetableTranslation = loroSchema.LoroMap(
	{
		gender: loroSchema.String(),
		origin: loroSchema.LoroText(),
		content: loroSchema.LoroText(),
		names: loroSchema.LoroMovableList(
			loroSchema.LoroMap({
				value: loroSchema.LoroText(),
			}),
			// $cid is the container ID of LoroMap assigned by Loro
			(t) => t.$cid,
			{ required: true },
		),
	},
	// At least one locale is required, but not all
	{ required: false },
)

// 1) Declare state shape
const appSchema = loroSchema({
	metadata: loroSchema.LoroMap({
		handle: loroSchema.String({ required: true }),
		scientific_names: loroSchema.LoroMovableList(
			loroSchema.LoroMap({
				value: loroSchema.LoroText(),
			}),
			// $cid is the container ID of LoroMap assigned by Loro
			(t) => t.$cid,
			{ required: true },
		),
		strata: loroSchema.LoroList(loroSchema.String(), undefined),
		planting_methods: loroSchema.LoroList(loroSchema.String(), undefined),
		edible_parts: loroSchema.LoroList(loroSchema.String(), undefined),
		lifecycles: loroSchema.LoroList(loroSchema.String(), undefined),
		uses: loroSchema.LoroList(loroSchema.String(), undefined),
		development_cycle_max: loroSchema.Number(),
		development_cycle_min: loroSchema.Number(),
		height_max: loroSchema.Number(),
		height_min: loroSchema.Number(),
		temperature_max: loroSchema.Number(),
		temperature_min: loroSchema.Number(),
		main_photo_id: loroSchema.String(),
	}),
	locales: loroSchema.LoroMap(
		{
			pt: VegetableTranslation,
			es: VegetableTranslation,
			en: VegetableTranslation,
		},
		{ required: true },
	),
})

// 2) Create a Loro document and a Mirror store and set the initial document
const initialDoc = new LoroDoc()
const initialDocStore = new Mirror({
	doc: initialDoc,
	schema: appSchema,
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
		main_photo_id: 'photo-123',
	},
	locales: {
		pt: {
			gender: 'MALE',
			origin: 'América Central',
			content: 'Algo sobre o milho',
			names: [{ value: 'Milho' }, { value: 'Maíz (Espanhol)' }],
		},
		es: {
			gender: 'MALE',
			origin: 'America Central',
			content: 'Algo sobre el maíz',
			names: [{ value: 'Maíz' }, { value: 'Milho (Português)' }],
		},
	},
}))

// 3) fork document and make changes
const editedDoc = initialDoc.fork()
const editedStore = new Mirror({
	doc: editedDoc,
	schema: appSchema,
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
				en: { names: [{ value: 'Corn' }, { value: 'Maize' }] },
			},
		}
	}
	s.locales.en.names.push({ value: 'Corn' })
	s.locales.en.names.push({ value: 'Maize' })
})
editedStore.setState((s) => {
	s.locales.pt?.names.push({ value: 'Maize' })
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
