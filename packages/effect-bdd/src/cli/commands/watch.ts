import { Console, Duration, Effect, Option, Stream } from "effect"
import { FileSystem } from "effect"

import type { OutputFormat } from "../types.js"
import { runCheck, splitPatterns } from "./check-impl.js"

export interface WatchArgs {
  patterns: string
  testPattern: string
  format: OutputFormat
  ignore: Option.Option<string>
  debounce: number
}

function clearScreen(): Effect.Effect<void> {
  return Console.log("\x1b[2J\x1b[H")
}

function performCheck(args: WatchArgs): Effect.Effect<void> {
  return runCheck({
    format: args.format,
    ignore: args.ignore,
    patterns: args.patterns,
    testPattern: args.testPattern,
  }).pipe(
    Effect.catch(() =>
      Effect.sync(() => {
        process.exitCode = 1
      }),
    ),
  )
}

function extractWatchDirectories(patterns: Array<string>): Array<string> {
  const directories = new Set<string>()

  for (const pattern of patterns) {
    const firstWildcard = pattern.search(/[*?[\]{]/)
    if (firstWildcard === -1) {
      directories.add(pattern)
    } else {
      const prefix = pattern.slice(0, firstWildcard)
      const lastSlash = prefix.lastIndexOf("/")
      directories.add(lastSlash > 0 ? prefix.slice(0, lastSlash) : ".")
    }
  }

  return Array.from(directories)
}

export function runWatchCommand(args: WatchArgs) {
  const featurePatterns = splitPatterns(args.patterns)
  const testPatterns = splitPatterns(args.testPattern)
  const allPatterns = [...featurePatterns, ...testPatterns]
  const watchDirectories = extractWatchDirectories(allPatterns)

  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem

    yield* clearScreen()
    yield* Console.log(`${new Date().toLocaleTimeString()} - Running initial check...\n`)
    yield* performCheck(args)

    yield* Console.log(`\nWatching for changes...`)
    yield* Console.log(`  Features: ${featurePatterns.join(", ")}`)
    yield* Console.log(`  Tests: ${testPatterns.join(", ")}`)
    yield* Console.log(`\nPress Ctrl+C to exit`)

    const watchStreams = watchDirectories.map((directory) => fileSystem.watch(directory))

    yield* Stream.mergeAll(watchStreams, { concurrency: "unbounded" }).pipe(
      Stream.debounce(Duration.millis(args.debounce)),
      Stream.runForEach(() =>
        Effect.gen(function* () {
          yield* clearScreen()
          yield* Console.log(`${new Date().toLocaleTimeString()} - Files changed, rechecking...\n`)
          yield* performCheck(args)
        }),
      ),
    )
  })
}
