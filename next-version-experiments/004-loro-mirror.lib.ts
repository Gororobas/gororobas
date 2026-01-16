import { schema as loroSchema } from 'loro-mirror'
import type {
	AgroforestryStratum,
	ChineseMedicineElement,
	EdibleVegetablePart,
	Handle,
	PlantingMethod,
	VegetableLifecycle,
	VegetableUsage,
} from '@/schema'

export const VegetableLocalizedDataLoro = loroSchema.LoroMap(
	{
		gender: loroSchema.String(),
		origin: loroSchema.LoroText(),
		content: loroSchema.LoroText(),
		common_names: loroSchema.LoroMovableList(
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

export const VegetableDataLoro = loroSchema({
	metadata: loroSchema.LoroMap({
		handle: loroSchema.String<Handle>({ required: true }),
		scientific_names: loroSchema.LoroMovableList(
			loroSchema.LoroMap({
				value: loroSchema.LoroText(),
			}),
			// $cid is the container ID of LoroMap assigned by Loro
			(t) => t.$cid,
			{ required: true },
		),
		strata: loroSchema.LoroList(
			loroSchema.String<AgroforestryStratum>(),
			undefined,
		),
		planting_methods: loroSchema.LoroList(
			loroSchema.String<PlantingMethod>(),
			undefined,
		),
		edible_parts: loroSchema.LoroList(
			loroSchema.String<EdibleVegetablePart>(),
			undefined,
		),
		lifecycles: loroSchema.LoroList(
			loroSchema.String<VegetableLifecycle>(),
			undefined,
		),
		uses: loroSchema.LoroList(loroSchema.String<VegetableUsage>(), undefined),
		development_cycle_max: loroSchema.Number(),
		development_cycle_min: loroSchema.Number(),
		height_max: loroSchema.Number(),
		height_min: loroSchema.Number(),
		temperature_max: loroSchema.Number(),
		temperature_min: loroSchema.Number(),
		chinese_medicine_element: loroSchema.String<ChineseMedicineElement>(),
		main_photo_id: loroSchema.String(),
	}),
	locales: loroSchema.LoroMap(
		{
			pt: VegetableLocalizedDataLoro,
			es: VegetableLocalizedDataLoro,
			en: VegetableLocalizedDataLoro,
		},
		{ required: true },
	),
})
