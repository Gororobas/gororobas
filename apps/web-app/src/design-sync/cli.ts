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
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { type Mirror, type PenDocument, type SyncLedger, checkDesignSync } from "./check"
import { designVariables } from "./design-tokens"

const webAppSource = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const designDirectory = resolve(webAppSource, "../../../design")
const penPath = join(designDirectory, "explorations.pen")
const ledgerPath = join(designDirectory, "design-sync.json")

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory)
    .toSorted()
    .flatMap((entry) => {
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) {
        return sourceFiles(path)
      }
      return /\.(ts|css)$/.test(entry) && !entry.endsWith(".test.ts") ? [path] : []
    })

/** Hashes sources with paths relative to the folder, so moving the checkout doesn't change it. */
const hashSource = (source: string): string | undefined => {
  const path = join(webAppSource, source)
  let stats

  try {
    stats = statSync(path)
  } catch {
    return undefined
  }

  const hash = createHash("sha256")
  for (const file of stats.isDirectory() ? sourceFiles(path) : [path]) {
    hash.update(file.slice(path.length))
    hash.update(readFileSync(file))
  }
  return hash.digest("hex").slice(0, 16)
}

const readLedger = (): SyncLedger => JSON.parse(readFileSync(ledgerPath, "utf8")) as SyncLedger

/** `theme` is mirrored as variables and `styles` holds CSS helpers, so neither is a component. */
const NOT_COMPONENTS = new Set(["theme", "styles"])

const uiFolders = (): ReadonlyArray<string> =>
  readdirSync(join(webAppSource, "ui")).filter(
    (entry) =>
      !NOT_COMPONENTS.has(entry) && statSync(join(webAppSource, "ui", entry)).isDirectory(),
  )

const check = (): number => {
  const ledger = readLedger()

  const problems = checkDesignSync({
    pen: JSON.parse(readFileSync(penPath, "utf8")) as PenDocument,
    ledger,
    variables: designVariables(),
    uiFolders: uiFolders(),
    sourceHashes: Object.fromEntries(
      ledger.mirrors.flatMap(({ source }) => {
        const hash = hashSource(source)
        return hash === undefined ? [] : [[source, hash] as const]
      }),
    ),
  })

  if (problems.length === 0) {
    console.log("Design file is in sync with the web app.")
    return 0
  }
  console.error(
    `The design file is out of sync with the web app:\n\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  )
  return 1
}

const acknowledge = (names: ReadonlyArray<string>): number => {
  const ledger = readLedger()
  const everything = names.length === 1 && names[0] === "--all"
  const unknown = everything
    ? []
    : names.filter((name) => !ledger.mirrors.some((mirror) => mirror.penNode === name))

  if (names.length === 0 || unknown.length > 0) {
    console.error(
      `Name mirrors from design/design-sync.json. Unknown: ${unknown.join(", ") || "(none given)"}`,
    )
    return 1
  }

  const updated: ReadonlyArray<Mirror> = ledger.mirrors.map((mirror) =>
    everything || names.includes(mirror.penNode)
      ? { ...mirror, sourceHash: hashSource(mirror.source) ?? mirror.sourceHash }
      : mirror,
  )

  writeFileSync(ledgerPath, `${JSON.stringify({ ...ledger, mirrors: updated }, null, 2)}\n`)
  return 0
}

/** The design file's tokens as a snippet to paste into Pencil's `execute`. */
const variables = (): number => {
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

  console.log(`SetVariables(${JSON.stringify(Object.fromEntries(entries))})`)
  return 0
}

const [command, ...rest] = process.argv.slice(2)

process.exit(
  command === "check"
    ? check()
    : command === "variables"
      ? variables()
      : command === "acknowledge"
        ? acknowledge(rest)
        : (console.error("Usage: cli.ts check | variables | acknowledge <penNode>..."), 1),
)
