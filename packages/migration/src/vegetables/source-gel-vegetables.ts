import {
  ImageId,
  ProfileId,
  WikiArticleId,
  TiptapDocument,
  WikiPlantArticle,
} from "@gororobas/domain"
import { Effect, Array as EffectArray, FileSystem, Option, Record, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { migrateRichText } from "../migrate-rich-text.js"
import { GelVegetableWithEditSuggestions } from "../schemas/gel/entities.js"
import { gelGenderToGrammaticalGender } from "../schemas/gel/enums.js"
import { MigrationContext } from "../services/migration-context.js"
import { buildWikiMigrationHistory } from "../wiki-migration-history.js"
import {
  reconstructGelVegetableHistory,
  VegetableDataForMigration,
  VegetableHistoryEntryForMigration,
} from "./backward-reconstruction.js"
import {
  gelVegetableNamesToCrdtList,
  gelVegetableToPlantEditableAttributes,
} from "./gel-vegetable-to-wiki-plant-article.js"

const vegetablesQuery = `
  select Vegetable {
    *,
    created_by_id := .created_by.id,
    photos := (select .photos order by @order_index asc empty last) {
      *,
      sources := (select .sources order by @order_index asc empty last) { * }
    },
    varieties := (select .varieties order by @order_index asc empty last) {
      *,
      photos: {
        *,
        sources := (select .sources order by @order_index asc empty last) { * },
      }
    },
    friends: {
      id,
    },
    sources: {
      *,
    },
    edit_suggestions := (select .<target_object[is EditSuggestion]
      filter .status = EditSuggestionStatus.MERGED) {
      *,
      created_by_id := .created_by.id,
      reviewed_by_id := .reviewed_by.id
    }
  }
`

export const sourceGelVegetables = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const context = yield* MigrationContext
  const gelClient = yield* GelClient
  const vegetableResults = yield* gelClient
    .use((client) => client.query(vegetablesQuery))
    .pipe(
      Effect.flatMap((vegetables) =>
        Effect.all(
          vegetables.map((vegetable) =>
            Schema.decodeUnknownEffect(GelVegetableWithEditSuggestions)(vegetable),
          ),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(vegetableResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a vegetable: ", failure.message),
  })

  const vegetables = EffectArray.getSuccesses(vegetableResults)

  // Archive discarded relationships outside debug/, which is ignored by git.
  const friendships = Record.fromEntries(
    vegetables
      .filter((plant) => EffectArray.isReadonlyArrayNonEmpty(plant.friends))
      .map((plant) => [plant.id, plant.friends.map((friend) => friend.id)] as const),
  )
  const archiveDirectory = path.join(import.meta.dirname, "..", "..", "archives")
  yield* fs.makeDirectory(archiveDirectory, { recursive: true })
  yield* fs.writeFileString(
    path.join(archiveDirectory, "plant-friendships.json"),
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(friendships),
  )
  const sources = Record.fromEntries(
    vegetables
      .filter((plant) => EffectArray.isReadonlyArrayNonEmpty(plant.sources))
      .map((plant) => [plant.id, plant.sources] as const),
  )
  yield* fs.writeFileString(
    path.join(archiveDirectory, "plant-sources.json"),
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(sources),
  )
  const historyResults = yield* Effect.all(
    vegetables.map(({ edit_suggestions, ...source }) =>
      reconstructGelVegetableHistory(source, edit_suggestions).pipe(
        Effect.map((history) => ({ source, history, edit_suggestions })),
      ),
    ),
    { concurrency: "unbounded", mode: "result" },
  )

  const vegetablesDirectory = path.join(import.meta.dirname, "..", "..", "debug", "vegetables")
  yield* fs.makeDirectory(vegetablesDirectory, { recursive: true })

  yield* Effect.forEach(
    EffectArray.getSuccesses(historyResults),
    ({ source, history, edit_suggestions }) =>
      Effect.gen(function* () {
        const historyEntries = yield* Effect.forEach(
          history,
          (historyEntry) =>
            Effect.gen(function* () {
              const originalContent = Schema.decodeUnknownSync(Schema.NullishOr(TiptapDocument))(
                historyEntry.state.content,
              )
              const content = originalContent ? yield* migrateRichText(originalContent) : null
              return VegetableHistoryEntryForMigration.make({
                ...historyEntry,
                article: WikiPlantArticle.EditableArticle.make({
                  kind: "PLANT",
                  attributes: gelVegetableToPlantEditableAttributes(historyEntry.state),
                  translations: {
                    pt: {
                      commonNames: gelVegetableNamesToCrdtList(historyEntry.state.names),
                      origin: Option.fromNullishOr(historyEntry.state.origin),
                      content: Option.fromNullishOr(content),
                      grammaticalGender: Option.fromNullishOr(
                        gelGenderToGrammaticalGender(historyEntry.state.gender),
                      ),
                    },
                  },
                }),
              })
            }),
          { concurrency: 1 },
        )
        const id = yield* context
          .resolveId(source.id, "WikiArticle")
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WikiArticleId)))
        const photoIds = yield* Effect.forEach(
          source.photos,
          (photo) =>
            context
              .resolveId(photo.id, "Image")
              .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ImageId))),
          { concurrency: 1 },
        )
        const inputs = yield* Effect.forEach(
          historyEntries,
          (entry) =>
            Effect.gen(function* () {
              const edit = Option.getOrNull(entry.edit_suggestion)
              const sourceActorId = edit ? edit.created_by_id : source.created_by_id
              const actorId = sourceActorId
                ? yield* context
                    .resolveId(sourceActorId, "Profile")
                    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ProfileId)))
                : null
              const reviewerId = edit?.reviewed_by_id
                ? yield* context
                    .resolveId(edit.reviewed_by_id, "Profile")
                    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ProfileId)))
                : null
              return {
                article: entry.article,
                sourceEditId: edit?.id ?? null,
                actorId,
                reviewerId,
                timestamp: (
                  edit?.updated_at ??
                  edit?.created_at ??
                  source.created_at
                ).toISOString(),
              }
            }),
          { concurrency: 1 },
        )
        const versions = yield* buildWikiMigrationHistory(inputs)
        const data = VegetableDataForMigration.make({
          id,
          photoIds,
          versions,
          latest_source: source,
          edit_suggestions,
          history: historyEntries,
        })
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(VegetableDataForMigration, { space: 2 }),
        )(data)
        yield* fs.writeFileString(path.join(vegetablesDirectory, `${source.handle}.json`), encoded)
      }),
    { concurrency: 1 },
  )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(historyResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a vegetable's history: ", failure.message),
  })
})
