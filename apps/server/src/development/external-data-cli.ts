/**
 * Runs and reports external data fetches against the database selected by `APP_DB_FILENAME`.
 *
 * pnpm --filter @gororobas/server external-data run --plants 10 --books 10
 * pnpm --filter @gororobas/server external-data report
 *
 * `run` executes `FetchArticleExternalData` in process against the real providers, so stop any
 * API using the same database first. Articles are fetched with their own IDs and ISBNs, and aren't
 * edited.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { ExternalDataInputs, WikiArticleId, WikiArticleKind } from "@gororobas/domain"
import { Maple } from "@maple-dev/effect-sdk/server"
import {
  Array as EffectArray,
  Config,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Schema,
} from "effect"
import { Command, Flag } from "effect/cli"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { IdGenLive } from "../id-gen-live.js"
import { MediaAssetsServiceLive } from "../media-assets/service.js"
import { makeAppSql } from "../sql.js"
import { buildExternalDataRequest } from "../wiki/external-data/inputs.js"
import { ExternalDataReport, reportExternalData } from "../wiki/external-data/report.js"
import { ExternalDataProvidersLive } from "../wiki/external-data/services/external-data-providers-live.js"
import {
  FetchArticleExternalData,
  FetchArticleExternalDataLive,
} from "../wiki/external-data/workflow.js"
import { WikiArticlesRepository } from "../wiki/repository.js"

const ArticleListing = Schema.Struct({
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  title: Schema.NullOr(Schema.String),
})

const findArticles = SqlSchema.findAll({
  Request: Schema.Struct({ kind: Schema.Literals(["PLANT", "BOOK"]), limit: Schema.Int }),
  Result: ArticleListing,
  execute: ({ kind, limit }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT article.id AS wiki_article_id, article.kind, ${titleColumn(sql)} AS title
        FROM wiki_article_projections article
        WHERE article.kind = ${kind}
        ORDER BY article.id
        LIMIT ${limit}
      `,
    ),
})

const findArticlesById = SqlSchema.findAll({
  Request: Schema.Array(WikiArticleId),
  Result: ArticleListing,
  execute: (ids) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT article.id AS wiki_article_id, article.kind, ${titleColumn(sql)} AS title
        FROM wiki_article_projections article
        WHERE ${sql.in("article.id", ids)}
        ORDER BY article.id
      `,
    ),
})

const findObservedArticles = SqlSchema.findAll({
  Request: Schema.Void,
  Result: ArticleListing,
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT article.id AS wiki_article_id, article.kind, ${titleColumn(sql)} AS title
        FROM wiki_article_projections article
        WHERE EXISTS (SELECT 1 FROM wiki_article_external_data_observations observation
          WHERE observation.wiki_article_id = article.id)
        ORDER BY article.kind, article.id
      `,
    ),
})

/** The Portuguese name when there is one, as the legacy content is in Portuguese. */
const titleColumn = (sql: SqlClient.SqlClient) => sql`(
  SELECT json_extract(translation.common_names, '$[0].name') FROM wiki_article_translations translation
  WHERE translation.wiki_article_id = article.id
  ORDER BY translation.language = 'pt' DESC, translation.language LIMIT 1
)`

const ArticleRun = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  inputs: ExternalDataInputs,
  workflowError: Schema.NullOr(Schema.String),
  report: Schema.NullOr(ExternalDataReport),
})

type ArticleRun = typeof ArticleRun.Type

const runArticle = Effect.fn("ExternalData.runArticle")(function* (
  article: typeof ArticleListing.Type,
  generation: string,
) {
  const row = yield* (yield* WikiArticlesRepository).findById(article.wikiArticleId)
  if (Option.isNone(row)) return yield* Effect.die(`Article ${article.wikiArticleId} vanished`)

  const request = buildExternalDataRequest(row.value)

  const workflowError = yield* FetchArticleExternalData.execute({
    ...request,
    refreshGeneration: generation,
  }).pipe(
    Effect.as(null),
    // Provider failures are observations; this is the workflow failing as a whole.
    Effect.catchTag("ExternalDataFetchError", (error) => Effect.succeed(error.message)),
  )

  const [report] = yield* reportExternalData([article.wikiArticleId])

  return {
    title: article.title,
    inputs: request.inputs,
    workflowError,
    report: report ?? null,
  }
})

const formatInputs = (inputs: ExternalDataInputs): string =>
  Match.value(inputs).pipe(
    Match.discriminatorsExhaustive("kind")({
      PLANT: ({ wikidataId }) => Option.getOrElse(wikidataId, () => "no Wikidata ID"),
      BOOK: ({ googleBooksVolumeId, isbn13, isbn10 }) =>
        Option.match(googleBooksVolumeId, {
          onSome: (volumeId) => `volume ${volumeId}`,
          onNone: () =>
            Option.match(
              Option.orElse(isbn13, () => isbn10),
              {
                onSome: (isbn) => `ISBN ${isbn}`,
                onNone: () => "no volume ID or ISBN",
              },
            ),
        }),
      NONE: () => "-",
    }),
  )

const formatRun = (run: ArticleRun): ReadonlyArray<string> => {
  const stored =
    run.report === null
      ? ""
      : run.report.kind === "BOOK"
        ? `editions ${run.report.bookEditions}`
        : `links ${run.report.externalLinks}, media ${run.report.externalMedia}, classification ${run.report.taxonomyClassification}, group ${run.report.taxonomyGroup ?? "-"}`

  return [
    `● ${run.title ?? "(untitled)"} [${run.report?.kind ?? run.inputs.kind}] ${run.report?.wikiArticleId ?? ""}`,
    `    inputs: ${formatInputs(run.inputs)}`,
    ...(run.report?.providers ?? []).map(
      (provider) =>
        `    ${provider.provider}: ${provider.lastOutcome}${provider.lastError === null ? "" : ` — ${provider.lastError}`} (${provider.observations} observations, ${provider.failures} failed)`,
    ),
    ...(run.workflowError === null ? [] : [`    workflow failed: ${run.workflowError}`]),
    `    stored: ${stored}`,
  ]
}

const writeJson = Effect.fn(function* <A, I>({
  output,
  schema,
  value,
}: {
  output: Option.Option<string>
  schema: Schema.Codec<A, I>
  value: A
}) {
  if (Option.isNone(output)) return
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fileSystem.makeDirectory(path.dirname(output.value), { recursive: true })
  yield* fileSystem.writeFileString(
    output.value,
    yield* Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value),
  )
  yield* Console.log(`Report written to ${output.value}`)
})

const articleFlag = Flag.String("article").pipe(
  Flag.atLeast(0),
  Flag.withDescription("Only these article IDs (repeatable)."),
)
const outputFlag = Flag.String("output").pipe(
  Flag.optional,
  Flag.withDescription("Also write the report as JSON to this file."),
)

const run = Command.make(
  "run",
  {
    plants: Flag.Int("plants").pipe(
      Flag.withDefault(10),
      Flag.withDescription("How many plants to fetch, in ID order."),
    ),
    books: Flag.Int("books").pipe(
      Flag.withDefault(10),
      Flag.withDescription("How many books to fetch, in ID order."),
    ),
    article: articleFlag,
    output: outputFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const articles = EffectArray.isReadonlyArrayNonEmpty(flags.article)
        ? yield* findArticlesById(
            yield* Schema.decodeEffect(Schema.Array(WikiArticleId))(flags.article),
          )
        : [
            ...(yield* findArticles({ kind: "PLANT", limit: flags.plants })),
            ...(yield* findArticles({ kind: "BOOK", limit: flags.books })),
          ]

      // Workflow executions are keyed by generation, so every run fetches again.
      const generation = `cli:${DateTime.formatIso(yield* DateTime.now)}`

      const runs = yield* Effect.forEach(
        articles,
        (article) =>
          runArticle(article, generation).pipe(
            Effect.tap((result) => Console.log(formatRun(result).join("\n"))),
          ),
        { concurrency: 1 },
      )

      yield* writeJson({ output: flags.output, schema: Schema.Array(ArticleRun), value: runs })
    }).pipe(
      Effect.provide(
        FetchArticleExternalDataLive.pipe(
          Layer.provideMerge(ExternalDataProvidersLive),
          Layer.provideMerge(MediaAssetsServiceLive),
          Layer.provideMerge(WorkflowEngine.layerMemory),
        ),
      ),
    ),
).pipe(Command.withDescription("Fetch external data for migrated articles and report each step."))

const report = Command.make("report", { article: articleFlag, output: outputFlag }, (flags) =>
  Effect.gen(function* () {
    const articles = EffectArray.isReadonlyArrayNonEmpty(flags.article)
      ? yield* findArticlesById(
          yield* Schema.decodeEffect(Schema.Array(WikiArticleId))(flags.article),
        )
      : yield* findObservedArticles()

    const reports = yield* reportExternalData(articles.map((article) => article.wikiArticleId))

    const runs = articles.map((article): ArticleRun => ({
      title: article.title,
      inputs: { kind: "NONE" },
      workflowError: null,
      report: reports.find((report) => report.wikiArticleId === article.wikiArticleId) ?? null,
    }))

    yield* Console.log(runs.flatMap(formatRun).join("\n"))
    yield* writeJson({ output: flags.output, schema: Schema.Array(ArticleRun), value: runs })
  }),
).pipe(Command.withDescription("Summarize stored external data and observations per article."))

const externalData = Command.make("external-data").pipe(
  Command.withSubcommands([run, report]),
  Command.withDescription("Inspect wiki external data enrichment."),
)

const AppSql = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path
    const database = path.resolve(
      yield* Config.String("APP_DB_FILENAME").pipe(Config.withDefault("gororobas.db")),
    )
    yield* Console.log(`Database: ${database}`)
    return makeAppSql(database)
  }),
)

externalData.pipe(
  Command.run({ version: "0.0.0" }),
  Effect.provide(
    Layer.mergeAll(
      AppSql,
      IdGenLive,
      Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make),
      Maple.layer({
        serviceName: "gororobas-external-data-cli",
        serviceVersion: "0.0.0",
        endpoint: "http://127.0.0.1:4318",
        environment: "development",
      }),
    ).pipe(Layer.provideMerge(NodeServices.layer)),
  ),
  NodeRuntime.runMain,
)
