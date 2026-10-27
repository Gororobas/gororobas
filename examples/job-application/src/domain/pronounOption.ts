import { Schema } from 'effect'

export const PronounOption = Schema.Literals([
  'He/Him',
  'She/Her',
  'They/Them',
  'He/They',
  'She/They',
  'Other',
])

export const all: ReadonlyArray<typeof PronounOption.Type> =
  PronounOption.literals
