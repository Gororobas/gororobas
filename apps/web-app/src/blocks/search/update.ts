import { Option, Schema } from "effect"
import { AsyncData } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { SearchQuery, type SearchType } from "../../app/route"
import { NavigateSearch } from "./command"
import { FiltersDrawerBinding, SearchComposition } from "./composition"
import { makeFieldsStep } from "./definition"
import { isResultTypeShown } from "./filters"
import { ProfileResults, PublicationResults, WikiResults } from "./model"

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
