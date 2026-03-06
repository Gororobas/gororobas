import { BunServices } from "@effect/platform-bun"
import { Effect, Layer, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import { runCheck } from "./commands/check-impl.js"
import { runWatchCommand } from "./commands/watch.js"
import type { OutputFormat } from "./types.js"

const patternsOption = Flag.string("patterns").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("Glob patterns for feature files (comma-separated)"),
  Flag.withDefault("**/*.feature"),
)

const testPatternOption = Flag.string("test-pattern").pipe(
  Flag.withAlias("t"),
  Flag.withDescription("Glob patterns for test files (comma-separated)"),
  Flag.withDefault("**/*.test.ts,**/*.spec.ts"),
)

const formatOption = Flag.choice("format", ["pretty", "json", "github-actions"]).pipe(
  Flag.withAlias("f"),
  Flag.withDescription("Output format: pretty, json, github-actions"),
  Flag.withDefault<OutputFormat>("pretty"),
)

const ignoreOption = Flag.string("ignore").pipe(
  Flag.withAlias("i"),
  Flag.withDescription("Patterns to ignore (comma-separated)"),
  Flag.optional,
)

const debounceOption = Flag.integer("debounce").pipe(
  Flag.withAlias("d"),
  Flag.withDescription("Debounce time in milliseconds (watch only)"),
  Flag.withDefault(200),
)

const checkOptions = {
  patterns: patternsOption,
  testPattern: testPatternOption,
  format: formatOption,
  ignore: ignoreOption,
}

const watchOptions = {
  patterns: patternsOption,
  testPattern: testPatternOption,
  format: formatOption,
  ignore: ignoreOption,
  debounce: debounceOption,
}

function runCheckHandler(config: {
  patterns: string
  testPattern: string
  format: OutputFormat
  ignore: Option.Option<string>
}) {
  return runCheck({
    format: config.format,
    ignore: config.ignore,
    patterns: config.patterns,
    testPattern: config.testPattern,
  })
}

const checkCommand = Command.make("check", checkOptions, (config) =>
  runCheckHandler({
    format: config.format,
    ignore: config.ignore,
    patterns: config.patterns,
    testPattern: config.testPattern,
  }),
)

const watchCommand = Command.make("watch", watchOptions, (config) =>
  runWatchCommand({
    patterns: config.patterns,
    testPattern: config.testPattern,
    format: config.format,
    ignore: config.ignore,
    debounce: config.debounce,
  }),
)

const rootCommand = Command.make("effect-bdd-check", {}).pipe(
  Command.withSubcommands([checkCommand, watchCommand]),
)

const cli = Command.run(rootCommand, {
  version: "0.0.0",
})

export function run(): void {
  const program = cli.pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer)),
    Effect.catch(() => Effect.sync(() => process.exit(1))),
  )

  Effect.runPromise(program).then(
    () => process.exit(0),
    () => process.exit(1),
  )
}
