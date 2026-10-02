import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { sourceGelNotes } from "./notes/source-gel-notes.js"
import { sourceGelResources } from "./resources/source-gel-resources.js"
import { sourceGelIdMappings } from "./source-gel-id-mappings.js"
import { sourceGelTags } from "./tags/source-gel-tags.js"
import { sourceGelUsers } from "./users/source-gel-users.js"
import { sourceGelVegetableVarieties } from "./vegetables/source-gel-vegetable-varieties.js"
import { sourceGelVegetables } from "./vegetables/source-gel-vegetables.js"

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    yield* sourceGelIdMappings
    yield* sourceGelUsers
    yield* sourceGelTags
    yield* sourceGelVegetables
    yield* sourceGelVegetableVarieties
    yield* sourceGelResources
    yield* sourceGelNotes
  }),
).pipe(Command.withDescription("Migrate data from Gel"))
