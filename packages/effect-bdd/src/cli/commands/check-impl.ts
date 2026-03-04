import { Console, Effect, Layer, Option } from "effect"
import { glob } from "glob"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { parseFeatureFile } from "../../parser/feature-parser.js"
import { makeReporter, Reporter } from "../services/reporter.js"
import { StepDiscovery, StepDiscoveryLive } from "../services/step-discovery.js"
import { StepMatcher, StepMatcherLive, aggregateResults } from "../services/step-matcher.js"
import type { OutputFormat } from "../types.js"

export interface CheckConfig {
  patterns: string
  testPattern: string
  format: OutputFormat
  ignore: Option.Option<string>
}

export function splitPatterns(patterns: string): Array<string> {
  return patterns
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

const DESCRIBE_FEATURE_REGEX = /describeFeature\s*\(/

/**
 * Read .gitignore and convert entries to glob ignore patterns.
 */
function readGitignorePatterns(cwd: string): Array<string> {
  try {
    const content = readFileSync(resolve(cwd, ".gitignore"), "utf8")
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"))
      .flatMap((pattern) => {
        const cleaned = pattern.replace(/\/$/, "")
        return [`${cleaned}`, `${cleaned}/**`]
      })
  } catch {
    return []
  }
}

function globFiles(patterns: Array<string>, ignore: Array<string>): Effect.Effect<Array<string>> {
  const gitignorePatterns = readGitignorePatterns(process.cwd())
  const allIgnore = [
    ...new Set([...ignore, ...gitignorePatterns, "node_modules", "node_modules/**"]),
  ]
  return Effect.promise(
    () => glob(patterns, { ignore: allIgnore, nodir: true }) as Promise<Array<string>>,
  )
}

/**
 * Pre-filter test files by checking for `describeFeature(` via regex
 * before expensive TypeScript parsing.
 */
function filterTestFilesWithFeature(files: Array<string>): Array<string> {
  return files.filter((file) => {
    try {
      const content = readFileSync(file, "utf8")
      return DESCRIBE_FEATURE_REGEX.test(content)
    } catch {
      return false
    }
  })
}

function createCheckLayer(format: OutputFormat) {
  return Layer.mergeAll(StepMatcherLive, StepDiscoveryLive, makeReporter(format))
}

export function runCheck(config: CheckConfig): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const featurePatterns = splitPatterns(config.patterns)
    const testPatterns = splitPatterns(config.testPattern)
    const ignorePatterns = Option.match(config.ignore, {
      onNone: () => [] as Array<string>,
      onSome: splitPatterns,
    })

    const allTestFiles = yield* globFiles(testPatterns, ignorePatterns)
    const relevantTestFiles = filterTestFilesWithFeature(allTestFiles)
    const stepDiscovery = yield* StepDiscovery
    const discoveredSteps = stepDiscovery.discoverSteps(relevantTestFiles)

    if (discoveredSteps.length === 0) {
      yield* Console.log("No step definitions found in test files")
    }

    const allFeatureFiles = yield* globFiles(featurePatterns, ignorePatterns)
    const stepMatcher = yield* StepMatcher

    const featureResults = yield* Effect.all(
      allFeatureFiles.map((featurePath) =>
        Effect.gen(function* () {
          const feature = yield* parseFeatureFile(featurePath).pipe(
            Effect.mapError((e) => new Error(`Failed to parse ${featurePath}: ${e.message}`)),
          )
          return yield* stepMatcher.checkFeature(feature, discoveredSteps, featurePath)
        }),
      ),
      { concurrency: "unbounded" },
    )

    const result = aggregateResults(featureResults)
    const reporter = yield* Reporter
    yield* reporter.report(result)

    if (!result.passed) {
      return yield* Effect.fail("CHECK_FAILED" as never)
    }
  }).pipe(Effect.provide(createCheckLayer(config.format)))
}
