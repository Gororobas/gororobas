import { Schema } from 'effect'

export const Plan = Schema.Literals(['Startup', 'Business', 'Enterprise'])

export const DemoTab = Schema.Literals(['Foldkit', 'React', 'Elm'])

export const City = Schema.Literals([
  'Johannesburg',
  'Kyiv',
  'Oxford',
  'Plymouth',
  'Quito',
  'Wellington',
  'Zurich',
])

export const ListboxItem = Schema.Literals([
  'Michael Bluth',
  'Lindsay Funke',
  'Gob Bluth',
  'George Michael',
  'Maeby Funke',
  'Buster Bluth',
  'Tobias Funke',
  'Lucille Bluth',
])

export const DemoCard = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
})

export const DemoColumn = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  cards: Schema.Array(DemoCard),
})
