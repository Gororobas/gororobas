import { Match, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const SearchResult = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  excerpt: Schema.String,
  section: Schema.String,
  kind: Schema.String,
})

const Results = Schema.Array(SearchResult)

export const SearchState = defineTaggedUnion({
  Idle: {},
  Loading: { results: Results },
  Ok: { results: Results },
})

export const resultsFromState = (
  state: typeof SearchState.Type,
): ReadonlyArray<typeof SearchResult.Type> =>
  Match.value(state).pipe(
    Match.tag('Ok', ({ results }) => results),
    Match.tag('Loading', ({ results }) => results),
    Match.orElse(() => []),
  )
