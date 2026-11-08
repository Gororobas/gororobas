import { BookmarkState } from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Effect, HashMap, Schema, Stream } from "effect"

import { GororobasApiClient } from "../api-client"
import { SessionAccess } from "../session-access"

export const ViewerBookmarks = Schema.HashMap(WikiArticleId, BookmarkState)
export type ViewerBookmarks = typeof ViewerBookmarks.Type

const readBookmarks = Effect.gen(function* () {
  const access = yield* SessionAccess
  if (access.read().identity === null) return HashMap.empty<WikiArticleId, BookmarkState>()

  const api = yield* GororobasApiClient
  const bookmarks = yield* api.wiki.getWikiBookmarks()
  return HashMap.fromIterable(bookmarks.map(({ wikiArticleId, state }) => [wikiArticleId, state]))
})

/** The signed-in person's bookmarks, read again whenever the account changes. Visitors have none. */
export const streamViewerBookmarks = Stream.unwrap(
  Effect.map(SessionAccess, (access) =>
    access.changes.pipe(
      Stream.map(({ identity }) => identity?.subjectId ?? null),
      Stream.changes,
    ),
  ),
).pipe(Stream.mapEffect(() => readBookmarks))
