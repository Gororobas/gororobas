import { Duration, Effect, Option, Schema, Stream } from "effect"

import { GororobasApiClient } from "../../api-client"
import { AnsweredSearch, SearchScope } from "../../app/search-query"
import { streamViewerBookmarks } from "../../lib/viewer-bookmarks"
import { previewCapacity } from "../../ui/styles/result-grid"
import { SearchBlock } from "./definition"
import {
  isResultTypeShown,
  profileSearchParams,
  publicationSearchParams,
  wikiSearchParams,
} from "./filters"
import { Message } from "./message"
import { publicationsShownAt } from "./preview"

/** Lets fast typing settle before searching. Each new query interrupts the previous search. */
const TYPING_SETTLE_TIME = Duration.millis(200)

/** How many posts a posts search loads; the overview loads as many as its widest preview. */
export const PUBLICATIONS_SEARCH_PAGE_SIZE = 30

export const subscriptions = SearchBlock.makeSubscriptions((entry) => ({
  results: entry(
    "SearchContent",
    { maybeAnsweredSearch: Schema.Option(AnsweredSearch) },
    {
      messages: [
        Message.SucceededSearchWiki,
        Message.FailedSearchWiki,
        Message.SucceededSearchPublications,
        Message.FailedSearchPublications,
        Message.SucceededSearchProfiles,
        Message.FailedSearchProfiles,
      ],
      modelToDependencies: (model) => ({ maybeAnsweredSearch: model.maybeAnsweredSearch }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return ({ maybeAnsweredSearch }) =>
          Option.match(maybeAnsweredSearch, {
            onNone: () => Stream.empty,
            onSome: ({ query, language }) => {
              const wiki = api.wiki
                .searchWikiArticles({ query: wikiSearchParams({ query, language }) })
                .pipe(
                  Effect.match({
                    onFailure: (error) => Message.FailedSearchWiki({ error: { cause: error } }),
                    onSuccess: (articles) => Message.SucceededSearchWiki({ articles }),
                  }),
                )

              const publications = api.publications
                .searchPublications({
                  query: publicationSearchParams({
                    query,
                    language,
                    // One past the preview, so the overview knows whether there's more to see.
                    pageSize: SearchScope.guards.Everything(query.scope)
                      ? previewCapacity(publicationsShownAt) + 1
                      : PUBLICATIONS_SEARCH_PAGE_SIZE,
                  }),
                })
                .pipe(
                  Effect.match({
                    onFailure: (error) =>
                      Message.FailedSearchPublications({ error: { cause: error } }),
                    onSuccess: (publications) =>
                      Message.SucceededSearchPublications({ publications }),
                  }),
                )

              const profiles = api.profiles
                .searchProfiles({ query: profileSearchParams(query) })
                .pipe(
                  Effect.match({
                    onFailure: (error) => Message.FailedSearchProfiles({ error: { cause: error } }),
                    onSuccess: (profiles) => Message.SucceededSearchProfiles({ profiles }),
                  }),
                )

              const searches: ReadonlyArray<
                Stream.Stream<Effect.Success<typeof wiki | typeof publications | typeof profiles>>
              > = [
                ...(isResultTypeShown(query, "wiki") ? [Stream.fromEffect(wiki)] : []),
                ...(isResultTypeShown(query, "publications")
                  ? [Stream.fromEffect(publications)]
                  : []),
                ...(isResultTypeShown(query, "people") ? [Stream.fromEffect(profiles)] : []),
              ]

              return Stream.fromEffect(Effect.sleep(TYPING_SETTLE_TIME)).pipe(
                Stream.flatMap(() => Stream.mergeAll(searches, { concurrency: "unbounded" })),
              )
            },
          })
      },
    },
  ),
  viewerBookmarks: entry(
    "WatchViewerBookmarks",
    {},
    {
      messages: [Message.UpdatedViewerBookmarks],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () =>
          streamViewerBookmarks.pipe(
            Stream.map((bookmarks) => Message.UpdatedViewerBookmarks({ bookmarks })),
            Stream.catchCause(() => Stream.empty),
          )
      },
    },
  ),
}))
