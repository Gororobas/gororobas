// Stable Before: a Command owns its execution Effect directly.
import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import { Message } from './message'
import { PeopleDirectory } from './peopleDirectory'

export const FetchPeople = Command.define('FetchPeople', {
  args: { searchText: Schema.String },
  messages: [Message.CompletedFetchPeople, Message.FailedFetchPeople],
  execute: ({ searchText }) =>
    Effect.gen(function* () {
      const peopleDirectory = yield* PeopleDirectory
      const people = yield* peopleDirectory.search(searchText)

      return Message.CompletedFetchPeople({ searchText, people })
    }).pipe(Effect.catch(() => Effect.succeed(Message.FailedFetchPeople()))),
})
