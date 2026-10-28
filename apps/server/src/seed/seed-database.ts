/**
 * Populates an empty application database with legible fake data covering every table,
 * through the same repositories the application writes with.
 *
 * Seeding is deterministic: the same seed, scale and anchor produce identical rows.
 */
import {
  Array as EffectArray,
  Clock,
  DateTime,
  Effect,
  Layer,
  Random,
  Record,
  Schema,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { MediaAssetsRepository } from "../media-assets/repository.js"
import { MediaAssetsStorage } from "../media-assets/storage.js"
import { OrganizationsRepository } from "../organizations/repository.js"
import { PeopleRepository } from "../people/repository.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { PublicationCommentsRepository } from "../publication-comments/repository.js"
import { PublicationsRepository } from "../publications/repository.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import type { SeedContext } from "./seed-context.js"
import { makeSeedMedia, type SeedMedia } from "./seed-media.js"
import {
  makeHandleRegistry,
  personaEmail,
  SEED_PERSONAS,
  seedOrganizations,
  seedPeople,
} from "./seed-people.js"
import { seedComments, seedPublications } from "./seed-publications.js"
import { makeSeedTimeline } from "./seed-timeline.js"
import {
  seedBookmarks,
  seedExternalData,
  seedWikiArticles,
  seedWikiRevisions,
} from "./seed-wiki.js"

export const SeedScale = Schema.Literals(["tiny", "small", "medium", "large"])
export type SeedScale = typeof SeedScale.Type

export interface SeedCounts {
  readonly people: number
  readonly organizations: number
  readonly wikiArticles: number
  readonly publications: number
  /** Distinct image files; media rows beyond this reuse pool files. */
  readonly mediaPool: number
}

/** Dependent rows (revisions, comments, bookmarks, media, memberships) scale with these. */
export const SEED_SCALES: Readonly<Record<SeedScale, SeedCounts>> = {
  tiny: {
    people: 12,
    organizations: 3,
    wikiArticles: 40,
    publications: 30,
    mediaPool: 2,
  },
  small: {
    people: 60,
    organizations: 10,
    wikiArticles: 150,
    publications: 200,
    mediaPool: 12,
  },
  medium: {
    people: 600,
    organizations: 60,
    wikiArticles: 1500,
    publications: 2500,
    mediaPool: 24,
  },
  large: {
    people: 5000,
    organizations: 400,
    wikiArticles: 12000,
    publications: 25000,
    mediaPool: 24,
  },
}

export const DEFAULT_SEED = "gororobas"

/**
 * The anchor defaults to the start of the current UTC day, so reseeding on the same day
 * reproduces identical rows and identifiers.
 */
export const defaultSeedAnchor = Effect.map(DateTime.now, (now) => DateTime.startOf(now, "day"))

export interface SeedOptions {
  readonly scale: SeedScale
  readonly seed: string
  /** The seed's "now": activity is spread over the two years before it. */
  readonly anchor: DateTime.Utc
}

export class SeedDatabaseNotEmptyError extends Schema.TaggedError<SeedDatabaseNotEmptyError>()(
  "SeedDatabaseNotEmptyError",
  { profiles: Schema.Number },
) {
  override get message() {
    return `Seeding requires an empty database, but it already has ${this.profiles} profiles`
  }
}

export class SeedIntegrityError extends Schema.TaggedError<SeedIntegrityError>()(
  "SeedIntegrityError",
  { violations: Schema.Number },
) {}

const countProfiles = SqlSchema.findOne({
  Request: Schema.Void,
  Result: Schema.Struct({ count: Schema.Number }),
  execute: () => SqlClient.SqlClient.use((sql) => sql`SELECT COUNT(*) AS count FROM profiles`),
})

const listTables = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({ name: Schema.String }),
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'effect_sql_migrations'
          -- Turso keeps full-text search indexes in tables of its own
          AND name NOT GLOB '__turso_internal_*'
        ORDER BY name
      `,
    ),
})

const countRows = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ count: Schema.Number }),
  execute: (table) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT COUNT(*) AS count FROM ${sql(table)}`),
})

/** Row counts for every application table, so callers can see what a seed covers. */
export const countTableRows = Effect.gen(function* () {
  const tables = yield* listTables()

  const counts = yield* Effect.forEach(
    tables,
    ({ name }) => Effect.map(countRows(name), ({ count }) => [name, count] as const),
    { concurrency: 1 },
  )

  return Record.fromEntries(counts)
})

const SeedRepositoriesLive = Layer.mergeAll(
  Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make),
  Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make),
  Layer.effect(OrganizationsRepository, OrganizationsRepository.make),
  Layer.effect(PeopleRepository, PeopleRepository.make),
  Layer.effect(ProfilesRepository, ProfilesRepository.make),
  Layer.effect(PublicationCommentsRepository, PublicationCommentsRepository.make),
  Layer.effect(PublicationsRepository, PublicationsRepository.make),
  Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make),
  // Seeding skips enrichment, but wiki writes still type-check against a workflow engine.
  WorkflowEngine.layerMemory,
)

/** Logs how many rows a phase seeded, measured on the real monotonic clock. */
const logPhase =
  <A>(name: string, size: (result: A) => number) =>
  <B extends A, E, R>(effect: Effect.Effect<B, E, R>) =>
    Effect.gen(function* () {
      const start = yield* Clock.monotonicTimeNanos
      const result = yield* effect
      const elapsed = Number((yield* Clock.monotonicTimeNanos) - start) / 1e9
      yield* Effect.log(`Seeded ${size(result)} ${name} in ${elapsed.toFixed(1)}s`)
      return result
    })

const length = (rows: ReadonlyArray<unknown>) => rows.length
const total = (count: number) => count

// `Random.withSeed` creates its generator eagerly; suspending gives every run a fresh one.
export const seedDatabase = (options: SeedOptions) =>
  Effect.suspend(() => seedDatabaseWithFreshRandom(options))

const seedDatabaseWithFreshRandom = (options: SeedOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const counts = SEED_SCALES[options.scale]

    const existing = yield* countProfiles()
    if (existing.count > 0) {
      return yield* new SeedDatabaseNotEmptyError({ profiles: existing.count })
    }

    const timeline = yield* makeSeedTimeline(options.anchor)

    yield* Effect.gen(function* () {
      const media = yield* makeSeedMedia({ poolSize: counts.mediaPool, timeline }).pipe(
        logPhase("pool images", (pool: SeedMedia) => pool.poolSize),
      )

      const handles = makeHandleRegistry()
      const base = { timeline, media }

      const people = yield* seedPeople(base, { count: counts.people, handles }).pipe(
        logPhase("people", length),
      )

      const organizations = yield* seedOrganizations(
        { ...base, people },
        { count: counts.organizations, handles },
      ).pipe(logPhase("organizations", length))

      const articles = yield* seedWikiArticles(
        { ...base, people, organizations },
        { count: counts.wikiArticles },
      ).pipe(logPhase("wiki articles", length))

      const publications = yield* seedPublications(
        { ...base, people, organizations, articles },
        { count: counts.publications },
      ).pipe(logPhase("publications", length))

      const context: SeedContext = { ...base, people, organizations, articles, publications }

      yield* seedWikiRevisions(context).pipe(logPhase("wiki revisions", total))
      yield* seedBookmarks(context).pipe(logPhase("bookmarks", total))
      yield* seedExternalData(context).pipe(logPhase("external data records", total))
      yield* seedComments(context).pipe(logPhase("comments", total))

      const violations = yield* sql`PRAGMA foreign_key_check`
      if (EffectArray.isReadonlyArrayNonEmpty(violations)) {
        return yield* new SeedIntegrityError({ violations: violations.length })
      }
    }).pipe(sql.withTransaction, Effect.provide(timeline.layer))

    return {
      ...options,
      anchor: DateTime.formatIso(options.anchor),
      personas: SEED_PERSONAS.map((persona) => ({
        email: personaEmail(persona.handle),
        handle: persona.handle,
        accessLevel: persona.accessLevel,
      })),
      tables: yield* countTableRows,
    }
  }).pipe(Effect.provide(SeedRepositoriesLive), Random.withSeed(options.seed))

export type SeedReport = Effect.Success<ReturnType<typeof seedDatabase>>
