import {
  IdGen,
  ImageMetadata,
  IntNonNegative,
  MediaAssetDescriptions,
  MediaAssetId,
  ModerationStatus,
  type PersonId,
  type ProfileId,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  ConfigProvider,
  DateTime,
  Effect,
  FileSystem,
  Path,
  Random,
  Record,
  Schema,
} from "effect"

import { IdGenLive } from "../id-gen-live.js"
import { MediaAssetsRepository } from "../media-assets/repository.js"
import { MediaAssetsService } from "../media-assets/service.js"
import { MediaAssetsStorage } from "../media-assets/storage.js"
import { shortText } from "./rich-text.js"
import { chance, pick, pickOption, pickWeighted } from "./seed-random.js"
import type { SeedTimeline } from "./seed-timeline.js"
import { FIRST_NAMES, MEDIA_CATEGORIES, SURNAMES } from "./vocabulary.js"

/** Pool images live inside the storage root, so symlinks to them never leave it. */
const POOL_DIRECTORY = ".seed-pool"

/** Bump when pool images change, so cached pools are regenerated. */
const POOL_VERSION = 2

const PoolEntry = Schema.Struct({
  id: MediaAssetId,
  contentType: Schema.String,
  byteSize: IntNonNegative,
  metadata: ImageMetadata,
})

const PoolManifest = Schema.fromJsonString(Schema.Array(PoolEntry))

const PALETTES = [
  ["#1f4d2b", "#7fb069", "#f4f1de"],
  ["#5c3d2e", "#c08552", "#f3e9dc"],
  ["#264653", "#2a9d8f", "#e9c46a"],
  ["#6a994e", "#a7c957", "#f2e8cf"],
  ["#3d405b", "#81b29a", "#f2cc8f"],
  ["#7f5539", "#ddb892", "#ede0d4"],
] as const

const poolImage = (index: number) => {
  const [dark, light, accent] = PALETTES[index % PALETTES.length] ?? PALETTES[0]
  const rotation = (index * 37) % 360

  return new TextEncoder()
    .encode(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
  <rect width="960" height="720" fill="url(#g)"/>
  <circle cx="760" cy="170" r="90" fill="${accent}" opacity="0.85"/>
  <g transform="translate(400 400) rotate(${rotation})"><path d="M0 -220 C140 -120 140 120 0 220 C-140 120 -140 -120 0 -220 Z" fill="${accent}" opacity="0.55"/><path d="M0 -200 L0 200" stroke="${dark}" stroke-width="10"/></g>
</svg>`)
}

/**
 * Converting images is the slowest part of seeding, so a small pool goes through the real
 * media pipeline once and is cached across runs. Every seeded media asset is a symlink to a
 * pool entry, so the application serves real files for each row.
 */
const preparePool = (size: number) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const storage = yield* MediaAssetsStorage
    const directory = path.join(storage.root, POOL_DIRECTORY)
    const manifestFile = path.join(directory, `manifest-v${POOL_VERSION}.json`)

    const cached = (yield* fileSystem.exists(manifestFile))
      ? yield* fileSystem.readFileString(manifestFile).pipe(
          Effect.flatMap(Schema.decodeEffect(PoolManifest)),
          Effect.orElseSucceed(() => []),
        )
      : []

    const present = yield* Effect.filter(cached, (entry) =>
      fileSystem.exists(path.join(directory, entry.id, "original")),
    )

    if (present.length >= size) return present.slice(0, size)

    const poolService = yield* MediaAssetsService.make.pipe(
      Effect.provideServiceEffect(
        MediaAssetsStorage,
        MediaAssetsStorage.make.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: directory }),
          ),
        ),
      ),
    )

    const created = yield* Effect.forEach(
      Array.from({ length: size - present.length }, (_, offset) => present.length + offset),
      (index) =>
        Effect.gen(function* () {
          // Pool identifiers come from the manifest, so they stay out of the seeded random stream.
          const id = yield* IdGen.make(MediaAssetId).pipe(Effect.provide(IdGenLive))

          const prepared = yield* poolService.prepare({
            id,
            file: poolImage(index),
            contentType: "image/svg+xml",
          })

          if (prepared.metadata.format !== "IMAGE") {
            return yield* Effect.die("Seed pool images must decode as images")
          }

          return PoolEntry.make({
            id,
            contentType: prepared.contentType,
            byteSize: prepared.byteSize,
            metadata: prepared.metadata,
          })
        }),
      { concurrency: 4 },
    )

    const entries = [...present, ...created]
    yield* fileSystem.writeFileString(
      manifestFile,
      yield* Schema.encodeEffect(PoolManifest)(entries),
    )
    return entries
  })

const DESCRIPTION_PROBABILITIES = { pt: 0.7, en: 0.3, es: 0.2 } as const

const mediaDescriptions = Effect.map(
  Effect.forEach(
    Record.toEntries(DESCRIPTION_PROBABILITIES),
    ([language, probability]) =>
      Effect.gen(function* () {
        if (!(yield* chance(probability))) return []
        return [[language, yield* shortText(language)] as const]
      }),
    { concurrency: 1 },
  ),
  (entries) => MediaAssetDescriptions.make(Record.fromEntries(entries.flat())),
)

export interface CreateMediaInput {
  readonly ownerProfileId: ProfileId
  readonly at: number
  /** People who can be credited as authors of the image. */
  readonly creditablePeople: ReadonlyArray<PersonId>
}

export const makeSeedMedia = (input: { poolSize: number; timeline: SeedTimeline }) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const storage = yield* MediaAssetsStorage
    const pool = yield* preparePool(input.poolSize)

    const create = ({ ownerProfileId, at, creditablePeople }: CreateMediaInput) =>
      input.timeline.at(at)(
        Effect.gen(function* () {
          const entry = yield* pickOption(pool)
          if (!entry) return yield* Effect.die("The seed media pool is empty")

          const id = yield* IdGen.make(MediaAssetId)
          const now = yield* DateTime.now

          // Reseeding with the same seed and anchor reproduces identifiers, and their links.
          const link = path.join(storage.root, id)
          if (!(yield* fileSystem.exists(link))) {
            yield* fileSystem.symlink(path.join(POOL_DIRECTORY, entry.id), link)
          }

          const repository = yield* MediaAssetsRepository

          yield* repository.insertMediaAsset({
            id,
            format: "IMAGE",
            metadata: entry.metadata,
            contentType: entry.contentType,
            byteSize: entry.byteSize,
            category: (yield* chance(0.6)) ? yield* pick(MEDIA_CATEGORIES) : null,
            descriptions: yield* mediaDescriptions,
            moderationStatus: yield* pickWeighted(ModerationStatus.literals, {
              APPROVED_BY_DEFAULT: 90,
              CENSORED: 4,
              REAPPROVED_AFTER_CENSORING: 3,
            }),
            ownerProfileId,
            createdAt: now,
            updatedAt: now,
          })

          yield* Effect.forEach(
            EffectArray.makeBy(yield* Random.nextIntBetween(0, 2), (orderIndex) => orderIndex),
            (orderIndex) =>
              Effect.gen(function* () {
                const person = (yield* chance(0.4))
                  ? yield* pickOption(creditablePeople)
                  : undefined

                yield* repository.insertMediaAssetCredit({
                  mediaAssetId: id,
                  orderIndex,
                  creditLine: person
                    ? null
                    : `${yield* pick(FIRST_NAMES)} ${yield* pick(SURNAMES)}`,
                  creditUrl: (yield* chance(0.3)) ? "https://example.org/acervo" : null,
                  personId: person ?? null,
                })
              }),
            { concurrency: 1, discard: true },
          )

          return id
        }),
      )

    return { create, poolSize: pool.length }
  })

export type SeedMedia = Effect.Success<ReturnType<typeof makeSeedMedia>>
