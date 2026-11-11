import type { DesignVariable } from "./design-tokens"
import { colorToHex } from "./oklch"

/**
 * The web app is canonical; `design/explorations.pen` follows it. Two things are compared:
 *
 * - **Variables**: every color role and primitive scale the app defines must exist in the file
 *   with the same value, and the file must not keep tone variables the app no longer has.
 * - **Mirrors**: web-app sources (UI kit components, article screens) that the design file draws.
 *   Each records the hash of its source when the design last matched it, so changing the source
 *   fails the check until someone updates the design and runs `design:acknowledge`.
 */
export type Mirror = Readonly<{
  /** Name of the node in the design file. Components are reusable frames named `ui/<folder>`. */
  penNode: string
  /** Path from `apps/web-app/src` to the folder whose sources the node draws. */
  source: string
  /** Hash of the source when the design last matched it. */
  sourceHash: string
  kind: "component" | "screen"
}>

export type SyncLedger = Readonly<{
  mirrors: ReadonlyArray<Mirror>
  /** UI kit folders that exist in the web app but aren't drawn yet. New folders must land here or in `mirrors`. */
  notYetMirrored: ReadonlyArray<string>
}>

export type PenNode = Readonly<{
  name?: string
  reusable?: boolean
  children?: ReadonlyArray<PenNode>
}>

export type PenVariable = Readonly<{
  type: string
  value: unknown
}>

export type PenDocument = Readonly<{
  variables?: Readonly<Record<string, PenVariable>>
  children?: ReadonlyArray<PenNode>
}>

export type CheckInputs = Readonly<{
  pen: PenDocument
  ledger: SyncLedger
  variables: Readonly<Record<string, DesignVariable>>
  /** Current hash of each source folder, by path from `apps/web-app/src`. */
  sourceHashes: Readonly<Record<string, string>>
  /** The folders under `ui/`, by name. */
  uiFolders: ReadonlyArray<string>
}>

const TONE_PREFIX = "tone/"

const collectNodes = (nodes: ReadonlyArray<PenNode> | undefined): ReadonlyArray<PenNode> =>
  (nodes ?? []).flatMap((node) => [node, ...collectNodes(node.children)])

const penColor = (variable: PenVariable, mode: "light" | "dark"): string | undefined => {
  const { value } = variable
  if (typeof value === "string") {
    return colorToHex(value)
  }

  if (Array.isArray(value)) {
    const match = value.find(
      (entry: { theme?: { mode?: string } }) => entry.theme?.mode === mode,
    ) as { value?: string } | undefined
    return match?.value === undefined ? undefined : colorToHex(match.value)
  }

  return undefined
}

const variableProblems = ({ pen, variables }: CheckInputs): ReadonlyArray<string> => {
  const penVariables = pen.variables ?? {}

  const missingOrWrong = Object.entries(variables).flatMap(([name, expected]) => {
    const actual = penVariables[name]
    if (actual === undefined) {
      return [`Variable ${name} is missing from the design file.`]
    }

    if (expected.type === "color") {
      return (["light", "dark"] as const).flatMap((mode) =>
        penColor(actual, mode) === expected.value[mode]
          ? []
          : [
              `Variable ${name} (${mode}) is ${penColor(actual, mode) ?? "unset"} in the design file; the web app has ${expected.value[mode]}.`,
            ],
      )
    }

    return actual.value === expected.value
      ? []
      : [
          `Variable ${name} is ${JSON.stringify(actual.value)} in the design file; the web app has ${JSON.stringify(expected.value)}.`,
        ]
  })

  const stale = Object.keys(penVariables)
    .filter((name) => name.startsWith(TONE_PREFIX) && variables[name] === undefined)
    .map((name) => `Variable ${name} no longer exists in the web app's theme.`)

  return [...missingOrWrong, ...stale]
}

const mirrorProblems = ({ pen, ledger, sourceHashes, uiFolders }: CheckInputs) => {
  const nodes = collectNodes(pen.children)
  const namedNodes = new Set(nodes.flatMap((node) => (node.name === undefined ? [] : [node.name])))
  const reusableNames = new Set(
    nodes.flatMap((node) => (node.reusable === true && node.name !== undefined ? [node.name] : [])),
  )
  /** A component may come as several variants named `<penNode>/<variant>`. */
  const hasReusable = (penNode: string) =>
    [...reusableNames].some((name) => name === penNode || name.startsWith(`${penNode}/`))

  const mirroredSources = new Set(ledger.mirrors.map((mirror) => mirror.source))
  const waived = new Set(ledger.notYetMirrored.map((folder) => `ui/${folder}`))

  const perMirror = ledger.mirrors.flatMap((mirror) => {
    const current = sourceHashes[mirror.source]
    const exists =
      mirror.kind === "component" ? hasReusable(mirror.penNode) : namedNodes.has(mirror.penNode)

    return [
      ...(exists
        ? []
        : [
            `${mirror.penNode} is in the sync ledger but the design file has no ${mirror.kind === "component" ? "reusable component" : "node"} with that name.`,
          ]),
      ...(current === undefined
        ? [
            `${mirror.source} no longer exists in the web app, but ${mirror.penNode} still mirrors it.`,
          ]
        : current === mirror.sourceHash
          ? []
          : [
              `${mirror.source} changed since ${mirror.penNode} was last synced. Update the design to match the web app, then run \`pnpm --filter @gororobas/web-app design:acknowledge ${mirror.penNode}\`.`,
            ]),
    ]
  })

  const unlisted = uiFolders
    .filter((folder) => !mirroredSources.has(`ui/${folder}`) && !waived.has(`ui/${folder}`))
    .map(
      (folder) =>
        `ui/${folder} is neither mirrored in the design file nor listed under notYetMirrored in design/design-sync.json.`,
    )

  const strayComponents = [...reusableNames]
    .filter((name) => name.startsWith("ui/") || name.startsWith("wiki-article/"))
    .filter(
      (name) =>
        !ledger.mirrors.some(
          (mirror) => name === mirror.penNode || name.startsWith(`${mirror.penNode}/`),
        ),
    )
    .map(
      (name) =>
        `${name} is a reusable component in the design file with no entry in design/design-sync.json (and so no web-app source to stay in sync with).`,
    )

  const staleWaivers = ledger.notYetMirrored
    .filter((folder) => !uiFolders.includes(folder))
    .map((folder) => `notYetMirrored lists ui/${folder}, which no longer exists.`)

  return [...perMirror, ...unlisted, ...strayComponents, ...staleWaivers]
}

export const checkDesignSync = (inputs: CheckInputs): ReadonlyArray<string> => [
  ...variableProblems(inputs),
  ...mirrorProblems(inputs),
]
