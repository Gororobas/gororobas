import { ProfileId } from "@gororobas/domain/common/ids"
import { Handle } from "@gororobas/domain/common/primitives"
import { Effect, Function, Layer } from "effect"

import { GororobasApiClient } from "../../api-client"
import { readerLanguage } from "../../lib/reader-language"
import { ProfileBlock } from "./definition"
import { Message } from "./message"

/** The publications tab shows this many of the profile's posts and events. */
const PUBLICATIONS_PAGE_SIZE = 30

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
  args: { ownerProfileId: ProfileId },
  messages: [Message.SucceededLoadPublications, Message.FailedLoadPublications],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ ownerProfileId }) =>
      api.publications
        .searchPublications({
          query: {
            ownerProfileId,
            language: readerLanguage,
            pageSize: PUBLICATIONS_PAGE_SIZE,
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

export const LoadPhotos = ProfileBlock.makeCommand("LoadPhotos", {
  args: { handle: Handle },
  messages: [Message.SucceededLoadPhotos, Message.FailedLoadPhotos],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle }) =>
      api.profiles.listProfilePhotos({ params: { handle } }).pipe(
        Effect.match({
          onFailure: (error) => Message.FailedLoadPhotos({ error: { cause: error } }),
          onSuccess: (photos) => Message.SucceededLoadPhotos({ photos }),
        }),
      )
  },
})

export const LoadContributions = ProfileBlock.makeCommand("LoadContributions", {
  args: { handle: Handle },
  messages: [Message.SucceededLoadContributions, Message.FailedLoadContributions],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle }) =>
      api.profiles
        .listProfileWikiContributions({ params: { handle }, query: { language: readerLanguage } })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadContributions({ error: { cause: error } }),
            onSuccess: (contributions) => Message.SucceededLoadContributions({ contributions }),
          }),
        )
  },
})

export const LoadBookmarks = ProfileBlock.makeCommand("LoadBookmarks", {
  args: { handle: Handle },
  messages: [Message.SucceededLoadBookmarks, Message.FailedLoadBookmarks],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ handle }) =>
      api.profiles
        .listProfileBookmarks({ params: { handle }, query: { language: readerLanguage } })
        .pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadBookmarks({ error: { cause: error } }),
            onSuccess: (bookmarks) => Message.SucceededLoadBookmarks({ bookmarks }),
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
