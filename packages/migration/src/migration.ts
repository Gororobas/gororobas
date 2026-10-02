import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { sourceGelNotes } from "./notes/source-gel-notes.js"
import { sourceGelResources } from "./resources/source-gel-resources.js"
import { sourceGelTags } from "./tags/source-gel-tags.js"
import { sourceGelUsers } from "./users/source-gel-users.js"
import { sourceGelVegetables } from "./vegetables/source-gel-vegetables.js"

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    yield* sourceGelUsers
    yield* sourceGelTags
    yield* sourceGelVegetables
    yield* sourceGelResources
    yield* sourceGelNotes
  }),
).pipe(Command.withDescription("Migrate data from Gel"))
