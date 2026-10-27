import { BookmarkState } from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Effect, HashMap, Schema, Stream } from "effect"

import { GororobasApiClient } from "../api-client"
import { SessionAccess, sessionChangedEvent } from "../session-access"

export const ViewerBookmarks = Schema.HashMap(WikiArticleId, BookmarkState)
export type ViewerBookmarks = typeof ViewerBookmarks.Type

const readBookmarks = Effect.gen(function* () {
  const access = yield* SessionAccess
  if (access.read().identity === null) return HashMap.empty<WikiArticleId, BookmarkState>()

  const api = yield* GororobasApiClient
  const bookmarks = yield* api.wiki.getWikiBookmarks()
  return HashMap.fromIterable(bookmarks.map(({ wikiArticleId, state }) => [wikiArticleId, state]))
})

/** The signed-in person's bookmarks, read again whenever the session changes. Visitors have none. */
export const streamViewerBookmarks = Stream.concat(
  Stream.succeed(undefined),
  Stream.fromEventListener(window, sessionChangedEvent),
).pipe(Stream.mapEffect(() => readBookmarks))
