import { Schema } from 'effect'

export const ProficiencyLevel = Schema.Literals([
  'Beginner',
  'Intermediate',
  'Advanced',
  'Expert',
])

export const all: ReadonlyArray<typeof ProficiencyLevel.Type> =
  ProficiencyLevel.literals
