import { BookmarkState } from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { WikiArticleLookup } from "@gororobas/domain/wiki/domain"
import { Effect, Function, Layer, Option, Schema } from "effect"

import { GororobasApiClient } from "../../api-client"
import { readerLanguage } from "../../lib/reader-language"
import { WikiArticleBlock } from "./definition"
import { Message } from "./message"

/** Places inside a place load this many at a time: a state can hold hundreds of municipalities. */
export const CHILD_PLACES_PAGE_SIZE = 24

/** The article page shows this many posts about it. */
const PUBLICATIONS_IN_ARTICLE_PAGE_SIZE = 30

export const LoadPage = WikiArticleBlock.makeCommand("LoadPage", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadPage, Message.FailedLoadPage],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki
        .getWikiArticleByHandleAndKind({ params: lookup, query: { language: readerLanguage } })
        .pipe(
          Effect.map((page) => Message.SucceededLoadPage({ page })),
          Effect.catchTag("WikiArticleNotFoundError", () =>
            Effect.succeed(Message.FailedLoadPage({ error: { cause: "NotFound" } })),
          ),
          Effect.match({
            onFailure: (error) => Message.FailedLoadPage({ error: { cause: error } }),
            onSuccess: Function.identity,
          }),
        )
  },
})

export const LoadRelated = WikiArticleBlock.makeCommand("LoadRelated", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadRelated, Message.FailedLoadRelated],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki
        .listRelatedWikiArticles({ params: lookup, query: { language: readerLanguage } })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadRelated({ error: { cause: error } }),
            onSuccess: (articles) => Message.SucceededLoadRelated({ articles }),
          }),
        )
  },
})

export const LoadBookmarkers = WikiArticleBlock.makeCommand("LoadBookmarkers", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadBookmarkers, Message.FailedLoadBookmarkers],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki.listWikiArticleBookmarkers({ params: lookup }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadBookmarkers({ error: { cause: error } }),
          onSuccess: (bookmarkers) => Message.SucceededLoadBookmarkers({ bookmarkers }),
        }),
      )
  },
})

export const LoadContributors = WikiArticleBlock.makeCommand("LoadContributors", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadContributors, Message.FailedLoadContributors],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki.listWikiArticleContributors({ params: lookup }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadContributors({ error: { cause: error } }),
          onSuccess: (contributors) => Message.SucceededLoadContributors({ contributors }),
        }),
      )
  },
})

export const LoadCultivars = WikiArticleBlock.makeCommand("LoadCultivars", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadCultivars, Message.FailedLoadCultivars],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki
        .listWikiArticleCultivars({ params: lookup, query: { language: readerLanguage } })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadCultivars({ error: { cause: error } }),
            onSuccess: (cultivars) => Message.SucceededLoadCultivars({ cultivars }),
          }),
        )
  },
})

export const LoadChildPlaces = WikiArticleBlock.makeCommand("LoadChildPlaces", {
  args: { lookup: WikiArticleLookup, currentPage: Schema.Int },
  messages: [Message.SucceededLoadChildPlaces, Message.FailedLoadChildPlaces],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup, currentPage }) =>
      api.wiki
        .listWikiArticleChildPlaces({
          params: lookup,
          query: { language: readerLanguage, pageSize: CHILD_PLACES_PAGE_SIZE, currentPage },
        })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadChildPlaces({ error: { cause: error } }),
            onSuccess: (page) => Message.SucceededLoadChildPlaces({ page }),
          }),
        )
  },
})

export const LoadPublications = WikiArticleBlock.makeCommand("LoadPublications", {
  args: { wikiArticleId: WikiArticleId },
  messages: [Message.SucceededLoadPublications, Message.FailedLoadPublications],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ wikiArticleId }) =>
      api.publications
        .searchPublications({
          query: {
            wikiArticleId,
            language: readerLanguage,
            pageSize: PUBLICATIONS_IN_ARTICLE_PAGE_SIZE,
            currentPage: 0,
          },
        })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadPublications({ error: { cause: error } }),
            onSuccess: (publications) => Message.SucceededLoadPublications({ publications }),
          }),
        )
  },
})

export const SaveBookmark = WikiArticleBlock.makeCommand("SaveBookmark", {
  args: { lookup: WikiArticleLookup, maybeState: Schema.Option(BookmarkState) },
  messages: [Message.SucceededSaveBookmark, Message.FailedSaveBookmark],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup, maybeState }) =>
      Option.match(maybeState, {
        onNone: () => api.wiki.removeWikiArticleBookmark({ params: lookup }),
        onSome: (state) => api.wiki.setWikiArticleBookmark({ params: lookup, payload: { state } }),
      }).pipe(
        Effect.match({
          onFailure: () =>
            Message.FailedSaveBookmark({ error: "Não foi possível salvar. Tente novamente." }),
          onSuccess: () => Message.SucceededSaveBookmark({ maybeState }),
        }),
      )
  },
})

export const CommandsLayer = Layer.mergeAll(
  LoadPage.layer,
  LoadRelated.layer,
  LoadBookmarkers.layer,
  LoadContributors.layer,
  LoadCultivars.layer,
  LoadChildPlaces.layer,
  LoadPublications.layer,
  SaveBookmark.layer,
)
