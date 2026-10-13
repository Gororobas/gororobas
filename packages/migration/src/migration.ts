import { Effect, FileSystem, Path, Record } from "effect"
import { Command, Flag } from "effect/cli"

import { ingestApplication } from "./ingest-application.js"
import { sourceGelNotes } from "./notes/source-gel-notes.js"
import { previewCollections } from "./preview-exports.js"
import { sourceGelResources } from "./resources/source-gel-resources.js"
import { sourceGelBookmarks } from "./source-gel-bookmarks.js"
import { sourceGelIdMappings } from "./source-gel-id-mappings.js"
import { sourceGelTags } from "./tags/source-gel-tags.js"
import { sourceGelUsers } from "./users/source-gel-users.js"
import { sourceGelVegetableVarieties } from "./vegetables/source-gel-vegetable-varieties.js"
import { sourceGelVegetables } from "./vegetables/source-gel-vegetables.js"

export const migrate = Command.make(
  "migrate",
  { exportOnly: Flag.Boolean("export-only").pipe(Flag.withDefault(false)) },
  ({ exportOnly }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = new URL("../debug", import.meta.url).pathname

      // Rebuild converted collections so deleted records and changed handles cannot survive a fresh export.
      yield* Effect.forEach(
        Record.values(previewCollections),
        (folder) =>
          Effect.gen(function* () {
            const collectionDirectory = path.join(directory, folder)
            if (!(yield* fs.exists(collectionDirectory))) return

            yield* Effect.forEach(
              (yield* fs.readDirectory(collectionDirectory)).filter((file) =>
                file.endsWith(".json"),
              ),
              (file) => fs.remove(path.join(collectionDirectory, file)),
              { concurrency: 1 },
            )
          }),
        { concurrency: 1 },
      )

      yield* sourceGelIdMappings
      yield* sourceGelUsers
      yield* sourceGelTags
      yield* sourceGelVegetables
      yield* sourceGelVegetableVarieties
      yield* sourceGelResources
      yield* sourceGelNotes
      yield* sourceGelBookmarks
      if (exportOnly) return
      yield* ingestApplication(new URL("../debug", import.meta.url).pathname)
    }),
).pipe(Command.withDescription("Migrate data from Gel"))
