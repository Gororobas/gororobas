import { PersonId, ProfileId } from "@gororobas/domain"
import { Effect, FileSystem, Path, Record, Schema } from "effect"

import { IngestionError } from "./ingestion-error.js"
import { PreviewExports, PreviewRecord } from "./preview-exports.js"
import { UserDataForMigration } from "./schemas/gel/entities.js"
import { buildWikiMigrationHistory, WikiMigrationVersion } from "./wiki-migration-history.js"

// oxlint-disable-next-line custom-lint-rules/no-direct-id-construction -- User-specified identities in the legacy Gel database, not generated target IDs.
export const fallbackGelProfileId = "02b81d06-1927-11ef-9ba8-1f058bdea354"
// oxlint-disable-next-line custom-lint-rules/no-direct-id-construction -- User-specified legacy author override for buganvília.
export const angieGelProfileId = "5e66878a-1929-11ef-bd5a-07926f01b7d1"
// oxlint-disable-next-line custom-lint-rules/no-direct-id-construction -- User-specified legacy account requiring an email override.
export const fredGelProfileId = "d8c5fecc-064d-11f0-ab0d-831c2c5fa029"

type MutableExports = Record<string, Array<{ file: string; data: typeof PreviewRecord.Type }>>
const isJsonObject = Schema.is(PreviewRecord)
const isString = Schema.is(Schema.String)
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

export const prepareIngestion = (exports: MutableExports) =>
  Effect.gen(function* () {
    const people: Record<string, PersonId> = {}
    const excludedProfiles: Array<string> = []
    const excludedAccounts: Array<Schema.Json> = []
    const excludedPublications: Array<Schema.Json> = []

    const authorOverrides: Array<{
      file: string
      sourceActorId: string | null
      authorId: PersonId
    }> = []

    const retainedUsers: MutableExports[string] = []

    yield* Effect.forEach(
      exports.users,
      (entry) =>
        Effect.gen(function* () {
          const user = yield* Schema.decodeEffect(Schema.toCodecJson(UserDataForMigration))(
            entry.data,
          )
          if (!user.profile.id) {
            return yield* new IngestionError({ message: `Missing profile ID: ${entry.file}` })
          }
          const email =
            user.latest_source.profile.id === fredGelProfileId
              ? "fred@gororobas.com"
              : user.account.email

          if (!email) {
            excludedProfiles.push(user.profile.id)
            excludedAccounts.push(entry.data)
            return
          }

          people[user.latest_source.profile.id] = PersonId.make(user.profile.id)

          retainedUsers.push({
            file: entry.file,
            data: {
              ...entry.data,
              account: Record.fromEntries([
                ...Record.toEntries(isJsonObject(entry.data.account) ? entry.data.account : {}),
                ["email", email] as const,
              ]),
            },
          })
        }),
      { concurrency: 1 },
    )

    exports.users = retainedUsers
    const fallbackAuthorId = people[fallbackGelProfileId]
    const angieId = people[angieGelProfileId]

    if (!fallbackAuthorId || !angieId) {
      return yield* new IngestionError({
        message: "Henrique and Angie must be retained migration accounts",
      })
    }

    const retainedIds = Record.values(people)

    exports.notes = exports.notes.filter((entry) => {
      const publication = entry.data.publication
      const metadata = isJsonObject(publication) ? publication.metadata : null
      const ownerId = isJsonObject(metadata) ? metadata.ownerProfileId : null
      if (isString(ownerId) && excludedProfiles.includes(ownerId)) {
        excludedPublications.push(entry.data)
        return false
      }
      return true
    })

    yield* Effect.forEach(
      ["plants", "resources", "cultivars"],
      (category) =>
        Effect.forEach(
          exports[category],
          (entry) =>
            Effect.gen(function* () {
              const source = entry.data.latest_source
              const isBuganvilia = isJsonObject(source) && source.handle === "buganvilia"
              if (!Array.isArray(entry.data.versions)) {
                entry.data = { ...entry.data, creatorId: isBuganvilia ? angieId : fallbackAuthorId }
                return
              }
              const versions = yield* Schema.decodeEffect(
                Schema.toCodecJson(Schema.Array(WikiMigrationVersion)),
              )(entry.data.versions)

              const inputs = yield* Effect.forEach(
                versions,
                (version, index) =>
                  Effect.gen(function* () {
                    let actorId =
                      version.actorId && retainedIds.includes(PersonId.make(version.actorId))
                        ? PersonId.make(version.actorId)
                        : null
                    if (isBuganvilia && index === 0) actorId = angieId

                    if (!actorId) {
                      if (index > 0 && version.sourceEditId) {
                        return yield* new IngestionError({
                          message: `Unresolved edit author: ${category}/${entry.file}/${version.sourceEditId}`,
                        })
                      }

                      actorId = fallbackAuthorId
                    }

                    if (actorId !== version.actorId) {
                      authorOverrides.push({
                        file: `${category}/${entry.file}`,
                        sourceActorId: version.actorId,
                        authorId: actorId,
                      })
                    }

                    return { ...version, actorId: ProfileId.make(actorId) }
                  }),
                { concurrency: 1 },
              )

              const history = yield* buildWikiMigrationHistory(inputs)

              entry.data = {
                ...entry.data,
                versions: yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.Array(WikiMigrationVersion)),
                )(history).pipe(
                  Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))),
                ),
              }
            }),
          { concurrency: 1 },
        ),
      { concurrency: 1 },
    )

    exports.images = exports.images.map((entry) => {
      const source = entry.data.latest_source
      const creator = isJsonObject(source) ? source.created_by : null
      const legacyId = isJsonObject(creator) ? creator.id : null
      const ownerProfileId = isString(legacyId)
        ? (people[legacyId] ?? fallbackAuthorId)
        : fallbackAuthorId
      return { file: entry.file, data: { ...entry.data, ownerProfileId } }
    })

    return { fallbackAuthorId, excludedAccounts, excludedPublications, authorOverrides }
  })

/** Preserve excluded accounts and every raw record referencing their legacy account/profile IDs. */
export const archiveExcludedAccounts = (input: {
  exportDirectory: string
  directory: string
  exports: PreviewExports
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const rawDirectory = path.join(input.exportDirectory, "raw-gel")
    if (!(yield* fs.exists(path.join(rawDirectory, "users.json")))) return
    const rawCollections: Record<string, Array<Schema.Json>> = {}

    yield* Effect.forEach(
      yield* fs.readDirectory(rawDirectory),
      (filename) =>
        Effect.gen(function* () {
          if (!filename.endsWith(".json")) return
          const raw = yield* fs
            .readFileString(path.join(rawDirectory, filename))
            .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))))
          if (Array.isArray(raw)) rawCollections[filename] = raw
        }),
      { concurrency: 1 },
    )

    const retained = input.exports.users.map((entry) =>
      isJsonObject(entry.data.latest_source) ? entry.data.latest_source.id : null,
    )

    const excluded = (rawCollections["users.json"] ?? [])
      .filter((raw) => isJsonObject(raw) && isString(raw.id) && !retained.includes(raw.id))
      .map((raw) => {
        if (!isJsonObject(raw)) return raw
        const profileId = isJsonObject(raw.profile) ? raw.profile.id : null
        const identifiers = [raw.id, profileId].filter(isString)

        return {
          account: raw,
          reason: raw.email ? "activity-filter" : "missing-email",
          content: Record.fromEntries(
            Record.toEntries(rawCollections)
              .filter(([name]) => name !== "users.json")
              .map(([name, records]) => [
                name,
                records.filter((record) =>
                  identifiers.some((id) => json(record).includes(json(id))),
                ),
              ]),
          ),
        }
      })

    yield* fs.writeFileString(
      path.join(input.directory, "excluded-accounts.json"),
      Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(excluded),
    )
  })
