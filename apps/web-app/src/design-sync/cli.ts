/**
 * Keeps `design/explorations.pen` in sync with the web app, which is canonical.
 *
 * pnpm --filter @gororobas/web-app design:check
 * pnpm --filter @gororobas/web-app design:variables
 * pnpm --filter @gororobas/web-app design:acknowledge <penNode>... | --all
 *
 * `design:variables` prints the tokens the design file should hold, as a snippet for Pencil's
 * `execute` tool. `design:acknowledge` re-records a mirror's source hash after the design was updated.
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

import { PenDocument, SyncLedger, checkDesignSync } from "./check"
import { designVariables } from "./design-tokens"

/** A failure the person running the command can fix: printed as is, without a stack trace. */
class DesignSyncError extends Schema.TaggedError<DesignSyncError>()("DesignSyncError", {
  message: Schema.String,
}) {
  readonly [Runtime.errorReported] = false
}

const LedgerJson = Schema.fromJsonString(SyncLedger, { space: 2 })
const PenJson = Schema.fromJsonString(PenDocument)

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
    penPath: path.join(designDirectory, "explorations.pen"),
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
    const { penPath } = yield* locations
    const ledger = yield* readLedger

    const sourceHashes = yield* Effect.forEach(ledger.mirrors, ({ source }) =>
      Effect.map(
        hashSource(source),
        Option.map((hash) => [source, hash] as const),
      ),
    )

    const problems = checkDesignSync({
      pen: yield* Schema.decodeEffect(PenJson)(yield* fileSystem.readFileString(penPath)),
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
    penNodes: Argument.String("penNode").pipe(
      Argument.withDescription("Mirrors to acknowledge, by their penNode in design-sync.json"),
      Argument.variadic,
    ),
    all: Flag.Boolean("all").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Acknowledge every mirror"),
    ),
  },
  ({ penNodes, all }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const { ledgerPath } = yield* locations
      const ledger = yield* readLedger
      const unknown = penNodes.filter(
        (name) => !ledger.mirrors.some((mirror) => mirror.penNode === name),
      )

      if ((!all && penNodes.length === 0) || unknown.length > 0) {
        return yield* new DesignSyncError({
          message: `Name mirrors from design/design-sync.json, or pass --all. Unknown: ${unknown.join(", ") || "(none given)"}`,
        })
      }

      const mirrors = yield* Effect.forEach(ledger.mirrors, (mirror) =>
        all || penNodes.includes(mirror.penNode)
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
  const entries = Object.entries(designVariables()).map(([name, variable]) =>
    variable.type === "color"
      ? [
          name,
          {
            type: "color",
            value:
              variable.value.light === variable.value.dark
                ? variable.value.light
                : [
                    { value: variable.value.light, theme: { mode: "light" } },
                    { value: variable.value.dark, theme: { mode: "dark" } },
                  ],
          },
        ]
      : [name, variable],
  )

  return Console.log(`SetVariables(${JSON.stringify(Object.fromEntries(entries))})`)
}).pipe(
  Command.withDescription(
    "Print the design file's tokens as a snippet to paste into Pencil's `execute`",
  ),
)

const command = Command.make("design-sync").pipe(
  Command.withDescription("Keep design/explorations.pen in sync with the web app"),
  Command.withSubcommands([check, variables, acknowledge]),
)

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.tapErrorTag("DesignSyncError", (error) => Console.error(error.message)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
