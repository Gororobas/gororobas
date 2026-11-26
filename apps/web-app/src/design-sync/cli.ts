/**
 * Keeps the design file (`design/main.bl`, tokens in `design/Styles/gororobas.ds`) in sync with
 * the web app, which is canonical.
 *
 * pnpm --filter @gororobas/web-app design:check
 * pnpm --filter @gororobas/web-app design:variables
 * pnpm --filter @gororobas/web-app design:acknowledge <designNode>... | --all
 *
 * `design:variables` prints the tokens the design system should hold, as a ```ds fence for
 * Brilliant's `edit` tool (Brilliant owns its files while open, so they aren't written here).
 * `design:acknowledge` re-records a mirror's source hash after the design was updated.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Array as EffectArray,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Record,
  Runtime,
  Schema,
} from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { createHash } from "node:crypto"

import { SyncLedger, checkDesignSync, designTokenName } from "./check"
import { parseCanvas, parseDesignSystem } from "./design-file"
import { designVariables } from "./design-tokens"

/** A failure the person running the command can fix: printed as is, without a stack trace. */
class DesignSyncError extends Schema.TaggedError<DesignSyncError>()("DesignSyncError", {
  message: Schema.String,
}) {
  readonly [Runtime.errorReported] = false
}

const LedgerJson = Schema.fromJsonString(SyncLedger, { space: 2 })

/** `theme` is mirrored as variables and `styles` holds CSS helpers, so neither is a component. */
const NOT_COMPONENTS = new Set(["theme", "styles"])

const locations = Effect.gen(function* () {
  const path = yield* Path.Path
  const webAppSource = path.resolve(
    path.dirname(yield* path.fromFileUrl(new URL(import.meta.url))),
    "..",
  )
  const designDirectory = path.resolve(webAppSource, "../../../design")

  return {
    webAppSource,
    canvasPath: path.join(designDirectory, "main.bl"),
    designSystemPath: path.join(designDirectory, "Styles", "gororobas.ds"),
    ledgerPath: path.join(designDirectory, "design-sync.json"),
  }
})

const isDirectory = (path: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    return (yield* fileSystem.stat(path)).type === "Directory"
  })

const sourceFiles = (
  directory: string,
): Effect.Effect<
  ReadonlyArray<string>,
  Effect.Error<ReturnType<typeof isDirectory>>,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entries = (yield* fileSystem.readDirectory(directory)).toSorted()

    const files = yield* Effect.forEach(entries, (entry) => {
      const entryPath = path.join(directory, entry)

      return Effect.flatMap(isDirectory(entryPath), (directoryEntry) =>
        directoryEntry
          ? sourceFiles(entryPath)
          : Effect.succeed(
              /\.(ts|css)$/.test(entry) && !entry.endsWith(".test.ts") ? [entryPath] : [],
            ),
      )
    })

    return files.flat()
  })

/**
 * Hashes sources with paths relative to the folder, so moving the checkout doesn't change it.
 * None when the source no longer exists.
 */
const hashSource = (source: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { webAppSource } = yield* locations
    const sourcePath = path.join(webAppSource, source)

    if (!(yield* fileSystem.exists(sourcePath))) {
      return Option.none<string>()
    }

    const files = (yield* isDirectory(sourcePath)) ? yield* sourceFiles(sourcePath) : [sourcePath]
    const hash = createHash("sha256")
    for (const file of files) {
      hash.update(file.slice(sourcePath.length))
      hash.update(yield* fileSystem.readFile(file))
    }

    return Option.some(hash.digest("hex").slice(0, 16))
  })

const readLedger = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const { ledgerPath } = yield* locations
  return yield* Schema.decodeEffect(LedgerJson)(yield* fileSystem.readFileString(ledgerPath))
})

const uiFolders = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { webAppSource } = yield* locations
  const uiDirectory = path.join(webAppSource, "ui")
  const entries = yield* fileSystem.readDirectory(uiDirectory)

  return yield* Effect.filter(
    entries.filter((entry) => !NOT_COMPONENTS.has(entry)),
    (entry) => isDirectory(path.join(uiDirectory, entry)),
  )
})

const check = Command.make("check", {}, () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const { canvasPath, designSystemPath } = yield* locations
    const ledger = yield* readLedger

    const sourceHashes = yield* Effect.forEach(ledger.mirrors, ({ source }) =>
      Effect.map(
        hashSource(source),
        Option.map((hash) => [source, hash] as const),
      ),
    )

    const problems = checkDesignSync({
      design: {
        nodes: parseCanvas(yield* fileSystem.readFileString(canvasPath)),
        tokens: parseDesignSystem(yield* fileSystem.readFileString(designSystemPath)),
      },
      ledger,
      variables: designVariables(),
      uiFolders: yield* uiFolders,
      sourceHashes: Record.fromEntries(EffectArray.getSomes(sourceHashes)),
    })

    if (EffectArray.isReadonlyArrayNonEmpty(problems)) {
      return yield* new DesignSyncError({
        message: `The design file is out of sync with the web app:\n\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
      })
    }

    yield* Console.log("Design file is in sync with the web app.")
  }),
).pipe(Command.withDescription("Fail when the design file drifted from the web app"))

const acknowledge = Command.make(
  "acknowledge",
  {
    designNodes: Argument.String("designNode").pipe(
      Argument.withDescription("Mirrors to acknowledge, by their designNode in design-sync.json"),
      Argument.variadic,
    ),
    all: Flag.Boolean("all").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Acknowledge every mirror"),
    ),
  },
  ({ designNodes, all }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const { ledgerPath } = yield* locations
      const ledger = yield* readLedger
      const unknown = designNodes.filter(
        (name) => !ledger.mirrors.some((mirror) => mirror.designNode === name),
      )

      if ((!all && designNodes.length === 0) || unknown.length > 0) {
        return yield* new DesignSyncError({
          message: `Name mirrors from design/design-sync.json, or pass --all. Unknown: ${unknown.join(", ") || "(none given)"}`,
        })
      }

      const mirrors = yield* Effect.forEach(ledger.mirrors, (mirror) =>
        all || designNodes.includes(mirror.designNode)
          ? Effect.map(hashSource(mirror.source), (hash) => ({
              ...mirror,
              sourceHash: Option.getOrElse(hash, () => mirror.sourceHash),
            }))
          : Effect.succeed(mirror),
      )

      yield* fileSystem.writeFileString(
        ledgerPath,
        `${yield* Schema.encodeEffect(LedgerJson)({ ...ledger, mirrors })}\n`,
      )
    }),
).pipe(
  Command.withDescription("Re-record mirrors' source hashes after updating the design to match"),
)

const variables = Command.make("variables", {}, () => {
  const statements = Object.entries(designVariables()).map(([name, variable]) =>
    variable.type === "color"
      ? variable.value.light === variable.value.dark
        ? `${designTokenName(name)}: ${variable.value.light}`
        : `${designTokenName(name)} { $default: ${variable.value.light}, theme.dark: ${variable.value.dark} }`
      : `${designTokenName(name)}: ${variable.value}`,
  )

  return Console.log(["```ds", 'file("Styles/gororobas.ds")', ...statements, "```"].join("\n"))
}).pipe(
  Command.withDescription(
    "Print the design system's tokens as a ```ds fence for Brilliant's `edit` tool",
  ),
)

const command = Command.make("design-sync").pipe(
  Command.withDescription("Keep design/main.bl in sync with the web app"),
  Command.withSubcommands([check, variables, acknowledge]),
)

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.tapErrorTag("DesignSyncError", (error) => Console.error(error.message)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
