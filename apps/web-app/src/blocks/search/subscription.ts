import { Duration, Effect, Option, Schema, Stream } from "effect"

import { GororobasApiClient } from "../../api-client"
import { SearchQuery } from "../../app/route"
import { streamViewerBookmarks } from "../../lib/viewer-bookmarks"
import { previewCapacity } from "../../ui/styles/result-grid"
import { SearchDefinition } from "./definition"
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

export const subscriptions = SearchDefinition.makeSubscriptions((entry) => ({
  results: entry(
    "SearchContent",
    { maybeAnsweredQuery: Schema.Option(SearchQuery) },
    {
      messages: [
        Message.SucceededSearchWiki,
        Message.FailedSearchWiki,
        Message.SucceededSearchPublications,
        Message.FailedSearchPublications,
        Message.SucceededSearchProfiles,
        Message.FailedSearchProfiles,
      ],
      modelToDependencies: (model) => ({ maybeAnsweredQuery: model.maybeAnsweredQuery }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return ({ maybeAnsweredQuery }) =>
          Option.match(maybeAnsweredQuery, {
            onNone: () => Stream.empty,
            onSome: (query) => {
              const wiki = api.wiki.searchWikiArticles({ query: wikiSearchParams(query) }).pipe(
                Effect.match({
                  onFailure: (error) => Message.FailedSearchWiki({ error: { cause: error } }),
                  onSuccess: (articles) => Message.SucceededSearchWiki({ articles }),
                }),
              )

              const publications = api.publications
                .searchPublications({
                  query: publicationSearchParams(
                    query,
                    Option.isSome(query.type)
                      ? PUBLICATIONS_SEARCH_PAGE_SIZE
                      : previewCapacity(publicationsShownAt),
                  ),
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
