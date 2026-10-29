import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import {
  MediaAssetRow,
  OrganizationInvitationRow,
  OrganizationMembershipRow,
  OrganizationRow,
  PersonRow,
  ProfileRow,
  PublicationCommentRow,
  PublicationCommentTranslationRow,
  PublicationRevisionRow,
  PublicationProjectionRow,
  PublicationSourceRow,
  PublicationTranslationRow,
  WikiArticleProjectionRow,
  WikiArticleRelationRow,
  WikiArticleRevisionRow,
  WikiArticleSourceRow,
  WikiArticleTranslationProjectionRow,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import {
  Array as EffectArray,
  ConfigProvider,
  DateTime,
  Effect,
  FileSystem,
  HashSet,
  Layer,
  Order,
  Path,
  Record,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"

import { countTableRows, DEFAULT_SEED, seedDatabase } from "../src/seed/seed-database.js"
import { AppSqlTest } from "../src/sql.js"

const ANCHOR = DateTime.makeUnsafe("2026-01-01T00:00:00Z")

/** Tables the seed leaves empty on purpose. Every other table must receive rows. */
const TABLES_WITHOUT_SEED_DATA = {
  auth_credentials: "Yielded creates credentials when an account signs in",
  auth_email_credentials: "Yielded creates credentials when an account signs in",
  auth_identifiers: "Yielded creates identifiers when an account signs in",
  auth_pending: "Pending sign-in flows are transient",
  auth_proofs: "Emailed codes are transient",
  auth_sessions: "Sessions start when an account signs in",
  wiki_article_external_media:
    "Synthetic provider data omits external images, which would not load",
} satisfies Record<string, string>

/** Read-side schemas each seeded table must decode with. */
const ROW_SCHEMAS = {
  media_assets: MediaAssetRow,
  organization_invitations: OrganizationInvitationRow,
  organization_memberships: OrganizationMembershipRow,
  organizations: OrganizationRow,
  people: PersonRow,
  profiles: ProfileRow,
  publication_comment_translations: PublicationCommentTranslationRow,
  publication_comments: PublicationCommentRow,
  publication_revisions: PublicationRevisionRow,
  publication_projections: PublicationProjectionRow,
  publication_sources: PublicationSourceRow,
  publication_translations: PublicationTranslationRow,
  wiki_article_projections: WikiArticleProjectionRow,
  wiki_article_relations: WikiArticleRelationRow,
  wiki_article_revisions: WikiArticleRevisionRow,
  wiki_article_sources: WikiArticleSourceRow,
  wiki_article_translations: WikiArticleTranslationProjectionRow,
} satisfies Record<string, Schema.Top>

const decodeAllRows = Effect.forEach(
  Record.toEntries(ROW_SCHEMAS),
  ([table, schema]) =>
    SqlSchema.findAll({
      Request: Schema.Void,
      Result: schema,
      execute: () => SqlClient.SqlClient.use((sql) => sql`SELECT * FROM ${sql(table)}`),
    })().pipe(Effect.mapError((cause) => new Error(`Rows of ${table} do not decode`, { cause }))),
  { concurrency: 1, discard: true },
)

/** Loro assigns random peer IDs, so CRDT internals are the only nondeterministic values. */
const CRDT_COLUMNS = HashSet.make(
  "crdtSnapshot",
  "crdtUpdate",
  "currentCrdtFrontier",
  "articleCrdtFrontier",
  "fromCrdtFrontier",
  "translatedAtCrdtFrontier",
)

const encodeRow = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const dumpWithoutCrdtInternals = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const tables = yield* Effect.forEach(
    Record.keys(yield* countTableRows),
    (table) =>
      Effect.map(sql`SELECT * FROM ${sql(table)}`, (rows) => {
        const encoded = rows.map((row) =>
          encodeRow(Record.filter(row, (_, column) => !HashSet.has(CRDT_COLUMNS, column))),
        )
        return [table, EffectArray.sort(encoded, Order.String)] as const
      }),
    { concurrency: 1 },
  )

  return Record.fromEntries(tables)
})

/** A fresh in-memory database per run, sharing one temporary media directory per test. */
type SeedRequirements = SqlClient.SqlClient | FileSystem.FileSystem | Path.Path

const withSeedEnvironment = <A, E>(
  run: (
    seedInto: <B, F>(effect: Effect.Effect<B, F, SeedRequirements>) => Effect.Effect<B>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const mediaDirectory = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: "seed-media-",
    })

    const environment = Layer.mergeAll(
      NodeServices.layer,
      Layer.succeed(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: mediaDirectory }),
      ),
    )

    return yield* run((effect) =>
      effect.pipe(Effect.provide(Layer.mergeAll(AppSqlTest, environment)), Effect.orDie),
    )
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))

describe("seedDatabase", () => {
  it.effect(
    "the default seed fills every table, with rows the read side decodes",
    () =>
      withSeedEnvironment((seedInto) =>
        seedInto(
          Effect.gen(function* () {
            const report = yield* seedDatabase({
              scale: "tiny",
              seed: DEFAULT_SEED,
              anchor: ANCHOR,
            })

            yield* decodeAllRows

            const empty = Record.keys(
              Record.filter(
                report.tables,
                (rows, table) => rows === 0 && !(table in TABLES_WITHOUT_SEED_DATA),
              ),
            )

            expect(empty).toEqual([])
          }),
        ),
      ),
    { timeout: 60_000 },
  )

  it.effect(
    "the same seed and anchor reproduce the same rows",
    () =>
      withSeedEnvironment((seedInto) =>
        Effect.gen(function* () {
          const seedAndDump = seedInto(
            seedDatabase({ scale: "tiny", seed: "determinism", anchor: ANCHOR }).pipe(
              Effect.andThen(dumpWithoutCrdtInternals),
            ),
          )

          const first = yield* seedAndDump
          const second = yield* seedAndDump
          expect(second).toEqual(first)
        }),
      ),
    { timeout: 60_000 },
  )

  it.effect(
    "any seed produces a database whose rows the read side decodes",
    () =>
      withSeedEnvironment((seedInto) =>
        assertPropertyEffect({
          arbitrary: Arbitrary.schema(Schema.String),
          predicate: (seed) =>
            seedInto(
              seedDatabase({ scale: "tiny", seed, anchor: ANCHOR }).pipe(
                Effect.andThen(decodeAllRows),
                Effect.as(true),
              ),
            ),
          options: { runs: 3 },
        }),
      ),
    { timeout: 120_000 },
  )
})
