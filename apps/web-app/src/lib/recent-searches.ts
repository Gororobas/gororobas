import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import {
  Array as EffectArray,
  Context,
  Effect,
  Equal,
  Layer,
  Option,
  Schema,
  String as EffectString,
} from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

import { SearchType } from "../app/route"

/** A search someone committed to: pressed Enter, or opened one of its results. */
export const RecentSearch = Schema.Struct({
  text: Schema.String,
  type: Schema.OptionFromNullOr(SearchType),
})
export type RecentSearch = typeof RecentSearch.Type

export const RecentSearches = Schema.Array(RecentSearch)
export type RecentSearches = typeof RecentSearches.Type

const MAX_RECENT_SEARCHES = 5

const normalized = (text: string) => EffectString.trim(text).toLocaleLowerCase("pt-BR")

/** Puts the search first, dropping an earlier copy of it and the oldest past the limit. */
export const addRecentSearch = (
  recentSearches: RecentSearches,
  search: RecentSearch,
): RecentSearches => {
  const text = EffectString.trim(search.text)
  if (EffectString.isEmpty(text)) return recentSearches

  return EffectArray.take(
    EffectArray.prepend(
      EffectArray.filter(
        recentSearches,
        (recent) =>
          normalized(recent.text) !== normalized(text) || !Equal.equals(recent.type, search.type),
      ),
      { text, type: search.type },
    ),
    MAX_RECENT_SEARCHES,
  )
}

export class RecentSearchesStore extends Context.Service<
  RecentSearchesStore,
  Readonly<{
    read: Effect.Effect<RecentSearches>
    write: (recentSearches: RecentSearches) => Effect.Effect<void>
  }>
>()("RecentSearchesStore") {}

const STORAGE_KEY = "gororobas-recent-searches"

/** Kept on this device only, in localStorage. Unreadable or unwritable storage means no history. */
export const RecentSearchesStoreLive = Layer.effect(
  RecentSearchesStore,
  Effect.gen(function* () {
    const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, RecentSearches)

    return RecentSearchesStore.of({
      read: store.get(STORAGE_KEY).pipe(
        Effect.map(Option.getOrElse((): RecentSearches => [])),
        Effect.orElseSucceed((): RecentSearches => []),
      ),
      write: (recentSearches) => store.set(STORAGE_KEY, recentSearches).pipe(Effect.ignore),
    })
  }),
).pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage))
