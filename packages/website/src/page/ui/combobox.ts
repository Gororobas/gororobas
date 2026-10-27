import { Combobox } from '@foldkit/ui'

import { City } from './domain/domain'

export const CityComboboxBlock = Combobox.create(City)
export const CityMultiComboboxBlock = Combobox.Multi.create(City)
