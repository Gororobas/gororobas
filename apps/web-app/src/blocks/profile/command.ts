import { BookmarkState, PublicationKind, SupportedLanguage } from "@gororobas/domain/common/enums"
import { ProfileId } from "@gororobas/domain/common/ids"
import { Handle } from "@gororobas/domain/common/primitives"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Effect, Function, Layer, Option, Schema } from "effect"

import { GororobasApiClient } from "../../api-client"
import { ProfileBlock } from "./definition"
import { Message } from "./message"

/** Publications load this many at a time, as the reader scrolls. */
export const PUBLICATIONS_PAGE_SIZE = 12

const currentPage = Schema.Int

export const LoadPage = ProfileBlock.makeCommand("LoadPage", {
  args: { handle: Handle },
  messages: [Message.SucceededLoadPage, Message.FailedLoadPage],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle }) =>
      api.profiles.getProfileByHandle({ params: { handle } }).pipe(
        Effect.map((page) => Message.SucceededLoadPage({ page })),
        Effect.catchTag("ProfileNotFoundError", () =>
          Effect.succeed(Message.FailedLoadPage({ error: { cause: "NotFound" } })),
        ),
        Effect.match({
          onFailure: (error) => Message.FailedLoadPage({ error: { cause: error } }),
          onSuccess: Function.identity,
        }),
      )
  },
})

export const LoadPublications = ProfileBlock.makeCommand("LoadPublications", {
  args: {
    ownerProfileId: ProfileId,
    language: SupportedLanguage,
    maybeKind: Schema.Option(PublicationKind),
    currentPage,
  },
  messages: [Message.SucceededLoadPublications, Message.FailedLoadPublications],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ ownerProfileId, language, maybeKind, currentPage }) =>
      api.publications
        .searchPublications({
          query: {
            ownerProfileId,
            language,
            ...Option.match(maybeKind, { onNone: () => ({}), onSome: (kind) => ({ kind }) }),
            pageSize: PUBLICATIONS_PAGE_SIZE,
            currentPage,
          },
        })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadPublications({ error: { cause: error } }),
            onSuccess: (publications) =>
              Message.SucceededLoadPublications({ publications, currentPage }),
          }),
        )
  },
})

export const LoadPhotos = ProfileBlock.makeCommand("LoadPhotos", {
  args: { handle: Handle, currentPage },
  messages: [Message.SucceededLoadPhotos, Message.FailedLoadPhotos],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle, currentPage }) =>
      api.profiles.listProfilePhotos({ params: { handle }, query: { currentPage } }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadPhotos({ error: { cause: error } }),
          onSuccess: (photos) => Message.SucceededLoadPhotos({ photos, currentPage }),
        }),
      )
  },
})

export const LoadContributions = ProfileBlock.makeCommand("LoadContributions", {
  args: { handle: Handle, language: SupportedLanguage, currentPage },
  messages: [Message.SucceededLoadContributions, Message.FailedLoadContributions],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle, language, currentPage }) =>
      api.profiles
        .listProfileWikiContributions({ params: { handle }, query: { language, currentPage } })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadContributions({ error: { cause: error } }),
            onSuccess: (contributions) =>
              Message.SucceededLoadContributions({ contributions, currentPage }),
          }),
        )
  },
})

export const LoadBookmarks = ProfileBlock.makeCommand("LoadBookmarks", {
  args: {
    handle: Handle,
    language: SupportedLanguage,
    maybeKind: Schema.Option(WikiArticleKind),
    maybeState: Schema.Option(BookmarkState),
    currentPage,
  },
  messages: [Message.SucceededLoadBookmarks, Message.FailedLoadBookmarks],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle, language, maybeKind, maybeState, currentPage }) =>
      api.profiles
        .listProfileBookmarks({
          params: { handle },
          query: {
            language,
            currentPage,
            ...Option.match(maybeKind, { onNone: () => ({}), onSome: (kind) => ({ kind }) }),
            ...Option.match(maybeState, { onNone: () => ({}), onSome: (state) => ({ state }) }),
          },
        })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadBookmarks({ error: { cause: error } }),
            onSuccess: (bookmarks) => Message.SucceededLoadBookmarks({ bookmarks, currentPage }),
          }),
        )
  },
})

export const CommandsLayer = Layer.mergeAll(
  LoadPage.layer,
  LoadPublications.layer,
  LoadPhotos.layer,
  LoadContributions.layer,
  LoadBookmarks.layer,
)
