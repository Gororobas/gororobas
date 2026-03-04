import { Command, Options } from "@effect/cli"
import { BunContext } from "@effect/platform-bun"
import { Effect, Layer, Option } from "effect"

import { runCheck } from "./commands/check-impl.js"
import { runWatchCommand } from "./commands/watch.js"
import type { OutputFormat } from "./types.js"

const patternsOption = Options.text("patterns").pipe(
  Options.withAlias("p"),
  Options.withDescription("Glob patterns for feature files (comma-separated)"),
  Options.withDefault("**/*.feature"),
)

const testPatternOption = Options.text("test-pattern").pipe(
  Options.withAlias("t"),
  Options.withDescription("Glob patterns for test files (comma-separated)"),
  Options.withDefault("**/*.test.ts,**/*.spec.ts"),
)

const formatOption = Options.choice("format", ["pretty", "json", "github-actions"]).pipe(
  Options.withAlias("f"),
  Options.withDescription("Output format: pretty, json, github-actions"),
  Options.withDefault<OutputFormat>("pretty"),
)

const ignoreOption = Options.text("ignore").pipe(
  Options.withAlias("i"),
  Options.withDescription("Patterns to ignore (comma-separated)"),
  Options.optional,
)

const debounceOption = Options.integer("debounce").pipe(
  Options.withAlias("d"),
  Options.withDescription("Debounce time in milliseconds (watch only)"),
  Options.withDefault(200),
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
  name: "effect-bdd-check",
  version: "0.0.0",
})

export function run(args: Array<string>): void {
  const program = cli(args).pipe(
    Effect.provide(Layer.mergeAll(BunContext.layer)),
    Effect.catchAll(() => Effect.sync(() => process.exit(1))),
  )

  Effect.runPromise(program).then(
    () => process.exit(0),
    () => process.exit(1),
  )
}
