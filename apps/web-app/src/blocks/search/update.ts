import { Array as EffectArray, Option, Schema } from "effect"
import { AsyncData } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { SearchQuery, type SearchType } from "../../app/route"
import { addRecentSearch } from "../../lib/recent-searches"
import { NavigateSearch, SaveRecentSearches } from "./command"
import { FiltersDrawerBinding, SearchComposition } from "./composition"
import { makeFieldsStep } from "./definition"
import { isResultTypeShown } from "./filters"
import { type Model, ProfileResults, PublicationResults, WikiResults } from "./model"

const isSameQuery = Schema.toEquivalence(SearchQuery)

/** Keeps showing earlier results while the new ones load. */
const pending = <A>(asyncData: AsyncData.AsyncData<A, string>): AsyncData.AsyncData<A, string> =>
  Option.match(AsyncData.getData(asyncData), {
    onNone: () => AsyncData.Loading(),
    onSome: (data) => AsyncData.Refreshing({ data }),
  })

const pendingIfShown = <A>({
  query,
  type,
  asyncData,
}: Readonly<{
  query: SearchQuery
  type: SearchType
  asyncData: AsyncData.AsyncData<A, string>
}>): AsyncData.AsyncData<A, string> =>
  isResultTypeShown(query, type) ? pending(asyncData) : AsyncData.Idle()

const remember = (model: Model, query: SearchQuery): Model["recentSearches"] =>
  Option.match(query.text, {
    onNone: () => model.recentSearches,
    onSome: (text) => addRecentSearch(model.recentSearches, { text, type: query.type }),
  })

/** Records the query and saves the history, when the query adds to it. */
const rememberStep = (model: Model, query: SearchQuery) => {
  const recentSearches = remember(model, query)

  return recentSearches === model.recentSearches
    ? { model }
    : {
        model: modifyFields(model, { recentSearches: () => recentSearches }),
        commands: [SaveRecentSearches({ recentSearches })],
      }
}

export const update = SearchComposition.makeUpdate({
  InformedOfQueryChange: (model, { query }) =>
    Option.exists(model.maybeAnsweredQuery, (answered) => isSameQuery(answered, query))
      ? { model }
      : {
          model: modifyFields(model, {
            maybeAnsweredQuery: () => Option.some(query),
            wikiAsyncData: (asyncData) => pendingIfShown({ query, type: "wiki", asyncData }),
            publicationsAsyncData: (asyncData) =>
              pendingIfShown({ query, type: "publications", asyncData }),
            profilesAsyncData: (asyncData) => pendingIfShown({ query, type: "people", asyncData }),
          }),
        },
  InformedOfOpenedResult: (model, { query }) => rememberStep(model, query),
  SubmittedSearch: (model, { query }) => {
    const remembered = rememberStep(model, query)
    return {
      model: remembered.model,
      commands: [...(remembered.commands ?? []), NavigateSearch({ query, navigation: "Replace" })],
    }
  },
  ClickedRemoveRecentSearch: (model, { index }) => {
    const recentSearches = EffectArray.remove(model.recentSearches, index)
    return {
      model: modifyFields(model, { recentSearches: () => recentSearches }),
      commands: [SaveRecentSearches({ recentSearches })],
    }
  },
  SucceededLoadRecentSearches: makeFieldsStep.fromMessage(({ recentSearches }) => ({
    recentSearches: () => recentSearches,
  })),
  CompletedSaveRecentSearches: makeFieldsStep(() => ({})),
  ChangedSearchQuery: (model, { query, navigation }) => ({
    model,
    commands: [NavigateSearch({ query, navigation })],
  }),
  CompletedNavigateSearch: makeFieldsStep(() => ({})),
  ClickedOpenFilters: FiltersDrawerBinding.requestOpen(),
  ClickedCloseFilters: FiltersDrawerBinding.requestClose(),
  SucceededSearchWiki: makeFieldsStep.fromMessage(({ articles }) => ({
    wikiAsyncData: () => WikiResults.Success({ data: articles }),
  })),
  FailedSearchWiki: makeFieldsStep.fromMessage(({ error }) => ({
    wikiAsyncData: () => WikiResults.Failure({ error }),
  })),
  SucceededSearchPublications: makeFieldsStep.fromMessage(({ publications }) => ({
    publicationsAsyncData: () => PublicationResults.Success({ data: publications }),
  })),
  FailedSearchPublications: makeFieldsStep.fromMessage(({ error }) => ({
    publicationsAsyncData: () => PublicationResults.Failure({ error }),
  })),
  SucceededSearchProfiles: makeFieldsStep.fromMessage(({ profiles }) => ({
    profilesAsyncData: () => ProfileResults.Success({ data: profiles }),
  })),
  FailedSearchProfiles: makeFieldsStep.fromMessage(({ error }) => ({
    profilesAsyncData: () => ProfileResults.Failure({ error }),
  })),
  UpdatedViewerBookmarks: makeFieldsStep.fromMessage(({ bookmarks }) => ({
    viewerBookmarks: () => bookmarks,
  })),
})
