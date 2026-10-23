import {
  Console,
  Schema,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  String as EffectString,
  Array as EffectArray,
} from "effect"
import { glob } from "glob"

import { parseFeatureFile } from "../../parser/feature-parser.js"
import { makeReporter, Reporter } from "../services/reporter.js"
import { StepDiscovery, StepDiscoveryLive } from "../services/step-discovery.js"
import { StepMatcher, StepMatcherLive, aggregateResults } from "../services/step-matcher.js"
import type { OutputFormat } from "../types.js"

class CheckFailedError extends Schema.TaggedError<CheckFailedError>()("CheckFailedError", {}) {}

export interface CheckConfig {
  patterns: string
  testPattern: string
  format: OutputFormat
  ignore: Option.Option<string>
  quiet: boolean
  /**
   * Only count steps defined in each feature's paired test file, `<name>-feature.test.ts` next to
   * `<name>.feature`. Generic steps such as "access is denied" exist in several suites, so global
   * matching lets another feature's bindings hide a missing implementation.
   */
  paired: boolean
}

export const pairedTestFile = (featurePath: string) =>
  featurePath.replace(/\.feature$/, "-feature.test.ts")

export function splitPatterns(patterns: string): Array<string> {
  return patterns
    .split(",")
    .map((p) => p.trim())
    .filter(EffectString.isNonEmpty)
}

const DESCRIBE_FEATURE_REGEX = /describeFeature\s*\(/

/**
 * Read .gitignore and convert entries to glob ignore patterns.
 */
function readGitignorePatterns(
  cwd: string,
): Effect.Effect<Array<string>, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const content = yield* Effect.matchEffect(
      fileSystem.readFileString(path.resolve(cwd, ".gitignore")),
      {
        onFailure: () => Effect.succeed(undefined),
        onSuccess: Effect.succeed,
      },
    )

    if (content === undefined) return []

    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) => EffectString.isNonEmpty(line) && !line.startsWith("#") && !line.startsWith("!"),
      )
      .flatMap((pattern) => {
        const cleaned = pattern.replace(/\/$/, "")
        return [`${cleaned}`, `${cleaned}/**`]
      })
  })
}

function globFiles(
  patterns: Array<string>,
  ignore: Array<string>,
): Effect.Effect<Array<string>, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const gitignorePatterns = yield* readGitignorePatterns(process.cwd())

    const allIgnore = EffectArray.dedupe([
      ...ignore,
      ...gitignorePatterns,
      "node_modules",
      "node_modules/**",
    ])

    return yield* Effect.tryPromise(() => glob(patterns, { ignore: allIgnore, nodir: true })).pipe(
      Effect.orDie,
    )
  })
}

/**
 * Pre-filter test files by checking for `describeFeature(` via regex
 * before expensive TypeScript parsing.
 */
function filterTestFilesWithFeature(
  files: Array<string>,
): Effect.Effect<Array<string>, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem

    const matches = yield* Effect.all(
      files.map((file) =>
        Effect.matchEffect(fileSystem.readFileString(file), {
          onFailure: () => Effect.succeed(false),
          onSuccess: (content) => Effect.succeed(DESCRIBE_FEATURE_REGEX.test(content)),
        }),
      ),
      { concurrency: 150 },
    )

    return files.filter((_, index) => matches[index] === true)
  })
}

function createCheckLayer(format: OutputFormat, quiet: boolean) {
  return Layer.mergeAll(StepMatcherLive, StepDiscoveryLive, makeReporter(format, quiet))
}

export function runCheck(
  config: CheckConfig,
): Effect.Effect<void, Error, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const featurePatterns = splitPatterns(config.patterns)
    const testPatterns = splitPatterns(config.testPattern)
    const ignorePatterns = Option.match(config.ignore, {
      onNone: (): Array<string> => [],
      onSome: splitPatterns,
    })

    const allTestFiles = yield* globFiles(testPatterns, ignorePatterns)
    const relevantTestFiles = yield* filterTestFilesWithFeature(allTestFiles)
    const stepDiscovery = yield* StepDiscovery
    const discoveredSteps = stepDiscovery.discoverSteps(relevantTestFiles)

    if (EffectArray.isArrayEmpty(discoveredSteps) && !config.quiet) {
      yield* Console.log("No step definitions found in test files")
    }

    const allFeatureFiles = yield* globFiles(featurePatterns, ignorePatterns)
    const stepMatcher = yield* StepMatcher

    const path = yield* Path.Path

    const stepsFor = (featurePath: string) => {
      if (!config.paired) return discoveredSteps
      const testFile = path.resolve(pairedTestFile(featurePath))
      return discoveredSteps.filter((step) => path.resolve(step.file) === testFile)
    }

    const featureResults = yield* Effect.all(
      allFeatureFiles.map((featurePath) =>
        Effect.gen(function* () {
          const feature = yield* parseFeatureFile(featurePath)

          return yield* stepMatcher.checkFeature({
            feature: feature,
            discoveredSteps: stepsFor(featurePath),
            featurePath: featurePath,
          })
        }),
      ),
      { concurrency: "unbounded" },
    )

    const result = aggregateResults(featureResults)
    const reporter = yield* Reporter
    yield* reporter.report(result)

    if (!result.passed) {
      return yield* Effect.fail(new CheckFailedError({}))
    }
  }).pipe(Effect.provide(createCheckLayer(config.format, config.quiet)))
}
