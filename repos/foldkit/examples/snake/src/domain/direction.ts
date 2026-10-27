import { Match, Schema } from 'effect'

export const Direction = Schema.Literals(['Up', 'Down', 'Left', 'Right'])

export const opposite = (
  direction: typeof Direction.Type,
): typeof Direction.Type =>
  Match.value(direction).pipe(
    Match.withReturnType<typeof Direction.Type>(),
    Match.when('Up', () => 'Down'),
    Match.when('Down', () => 'Up'),
    Match.when('Left', () => 'Right'),
    Match.when('Right', () => 'Left'),
    Match.exhaustive,
  )

export const isOpposite = (
  a: typeof Direction.Type,
  b: typeof Direction.Type,
): boolean => opposite(a) === b
