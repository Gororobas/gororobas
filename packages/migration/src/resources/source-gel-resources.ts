import { Array as EffectArray, Effect, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import {
  gelResourceToWikiArticle,
  ResourceDataForMigration,
} from "./gel-resource-to-wiki-article.js"

const resourcesQuery = `
  select Resource {
    *,
    created_by: { id },
    thumbnail: { id },
    related_vegetables := (select .related_vegetables order by @order_index asc empty last) {
      id,
    },
    tags := (select .tags order by @order_index asc empty last) {
      id,
    },
  }
`

export const sourceGelResources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gelClient = yield* GelClient
  const resourceResults = yield* gelClient
    .use((client) => client.query(resourcesQuery))
    .pipe(
      Effect.flatMap((resources) =>
        Effect.all(
          resources.map((resource) =>
            Schema.decodeUnknownEffect(GelResourceWithRelations)(resource),
          ),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(resourceResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a resource: ", failure.message),
  })

  const resources = EffectArray.getSuccesses(resourceResults)
  const articleResults = yield* Effect.all(
    resources.map((source) =>
      gelResourceToWikiArticle(source).pipe(Effect.map((article) => ({ article, source }))),
    ),
    { concurrency: "unbounded", mode: "result" },
  )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(articleResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed converting a resource: ", failure.message),
  })

  const resourcesDirectory = path.join(import.meta.dirname, "..", "..", "debug", "resources")
  yield* fs.makeDirectory(resourcesDirectory, { recursive: true })

  yield* Effect.forEach(
    EffectArray.getSuccesses(articleResults),
    ({ article, source }) =>
      Effect.gen(function* () {
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(ResourceDataForMigration, { space: 2 }),
        )({ article, latest_source: source })
        yield* fs.writeFileString(path.join(resourcesDirectory, `${source.handle}.json`), encoded)
      }),
    { concurrency: 1 },
  )
})
