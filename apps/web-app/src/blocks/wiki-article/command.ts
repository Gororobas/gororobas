import { BookmarkState } from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { WikiArticleLookup } from "@gororobas/domain/wiki/domain"
import { Effect, Function, Layer, Option, Schema } from "effect"

import { GororobasApiClient } from "../../api-client"
import { WikiArticleDefinition } from "./definition"
import { Message } from "./message"

/** The article page shows this many posts about it. */
const PUBLICATIONS_IN_ARTICLE_PAGE_SIZE = 30

export const LoadPage = WikiArticleDefinition.makeCommand("LoadPage", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadPage, Message.FailedLoadPage],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki.getWikiArticleByHandleAndKind({ params: lookup, query: { language: "pt" } }).pipe(
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

export const LoadRelated = WikiArticleDefinition.makeCommand("LoadRelated", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadRelated, Message.FailedLoadRelated],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki.listRelatedWikiArticles({ params: lookup, query: { language: "pt" } }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadRelated({ error: { cause: error } }),
          onSuccess: (articles) => Message.SucceededLoadRelated({ articles }),
        }),
      )
  },
})

export const LoadBookmarkers = WikiArticleDefinition.makeCommand("LoadBookmarkers", {
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

export const LoadContributors = WikiArticleDefinition.makeCommand("LoadContributors", {
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

export const LoadCultivars = WikiArticleDefinition.makeCommand("LoadCultivars", {
  args: { lookup: WikiArticleLookup },
  messages: [Message.SucceededLoadCultivars, Message.FailedLoadCultivars],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ lookup }) =>
      api.wiki.listWikiArticleCultivars({ params: lookup, query: { language: "pt" } }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadCultivars({ error: { cause: error } }),
          onSuccess: (cultivars) => Message.SucceededLoadCultivars({ cultivars }),
        }),
      )
  },
})

export const LoadPublications = WikiArticleDefinition.makeCommand("LoadPublications", {
  args: { wikiArticleId: WikiArticleId },
  messages: [Message.SucceededLoadPublications, Message.FailedLoadPublications],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ wikiArticleId }) =>
      api.publications
        .searchPublications({
          query: {
            wikiArticleId,
            language: "pt",
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

export const SaveBookmark = WikiArticleDefinition.makeCommand("SaveBookmark", {
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
  LoadPublications.layer,
  SaveBookmark.layer,
)
