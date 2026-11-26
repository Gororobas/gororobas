import { Schema } from "effect"

import type { DesignFile, DesignToken } from "./design-file"
import type { DesignVariable } from "./design-tokens"
import { colorToHex } from "./oklch"

/**
 * The web app is canonical; the design file (`design/main.bl`, with its tokens in
 * `design/Styles/gororobas.ds`) follows it. Two things are compared:
 *
 * - **Tokens**: every color role and primitive scale the app defines must exist in the design
 *   system with the same value, and the design system must not keep tone tokens the app no
 *   longer has.
 * - **Mirrors**: web-app sources (UI kit components, screens) that the design file draws. Each
 *   records the hash of its source when the design last matched it, so changing the source fails
 *   the check until someone updates the design and runs `design:acknowledge`.
 */
export const Mirror = Schema.Struct({
  /** Name of the element in `design/main.bl`. Components are named after their source, such as `ui/<folder>`. */
  designNode: Schema.String,
  /** Path from `apps/web-app/src` to the folder or file whose sources the element draws. */
  source: Schema.String,
  /** Hash of the source when the design last matched it. */
  sourceHash: Schema.String,
  kind: Schema.Literals(["component", "screen"]),
})

export type Mirror = typeof Mirror.Type

export const SyncLedger = Schema.Struct({
  mirrors: Schema.Array(Mirror),
  /** UI kit folders that exist in the web app but aren't drawn yet. New folders must land here or in `mirrors`. */
  notYetMirrored: Schema.Array(Schema.String),
})

export type SyncLedger = typeof SyncLedger.Type

export type CheckInputs = Readonly<{
  design: DesignFile
  ledger: SyncLedger
  variables: Readonly<Record<string, DesignVariable>>
  /** Current hash of each source, by path from `apps/web-app/src`. */
  sourceHashes: Readonly<Record<string, string>>
  /** The folders under `ui/`, by name. */
  uiFolders: ReadonlyArray<string>
}>

/**
 * The design system's tokens came over from a Pencil import as `pen.*`. Renaming them means
 * re-binding every element that uses them, so the prefix stays until that's worth doing.
 */
const TOKEN_PREFIX = "pen."

/** `tone/primary/background` in the web app is `pen.tone.primary.background` in the design system. */
export const designTokenName = (variableName: string): string =>
  `${TOKEN_PREFIX}${variableName.replaceAll("/", ".")}`

const TONE_TOKEN_PREFIX = designTokenName("tone/")

/** Component masters whose names claim a web-app source, and so need a mirror. */
const SOURCED_COMPONENT_PREFIXES = ["ui/", "wiki-article/", "search/", "icon/"]

const tokenProblems = ({ design, variables }: CheckInputs): ReadonlyArray<string> => {
  const missingOrWrong = Object.entries(variables).flatMap(([name, expected]) => {
    const tokenName = designTokenName(name)
    const actual: DesignToken | undefined = design.tokens[tokenName]
    if (actual === undefined) {
      return [`Token ${tokenName} is missing from the design system.`]
    }

    if (expected.type === "color") {
      return (["light", "dark"] as const).flatMap((mode) => {
        const actualColor = colorToHex(actual[mode])

        return actualColor === expected.value[mode]
          ? []
          : [
              `Token ${tokenName} (${mode}) is ${actual[mode]} in the design system; the web app has ${expected.value[mode]}.`,
            ]
      })
    }

    return String(expected.value) === actual.light
      ? []
      : [
          `Token ${tokenName} is ${actual.light} in the design system; the web app has ${String(expected.value)}.`,
        ]
  })

  const expectedTokens = new Set(Object.keys(variables).map(designTokenName))
  const stale = Object.keys(design.tokens)
    .filter((name) => name.startsWith(TONE_TOKEN_PREFIX) && !expectedTokens.has(name))
    .map((name) => `Token ${name} no longer exists in the web app's theme.`)

  return [...missingOrWrong, ...stale]
}

const mirrorProblems = ({ design, ledger, sourceHashes, uiFolders }: CheckInputs) => {
  const namedNodes = new Set(design.nodes.map((node) => node.name))
  const componentNames = new Set(
    design.nodes.flatMap((node) => (node.isComponent ? [node.name] : [])),
  )
  /** A component may come with sub-components named `<designNode>/<part>`. */
  const hasComponent = (designNode: string) =>
    [...componentNames].some((name) => name === designNode || name.startsWith(`${designNode}/`))

  const mirroredSources = new Set(ledger.mirrors.map((mirror) => mirror.source))
  const waived = new Set(ledger.notYetMirrored.map((folder) => `ui/${folder}`))

  const perMirror = ledger.mirrors.flatMap((mirror) => {
    const current = sourceHashes[mirror.source]
    const exists =
      mirror.kind === "component"
        ? hasComponent(mirror.designNode)
        : namedNodes.has(mirror.designNode)

    return [
      ...(exists
        ? []
        : [
            `${mirror.designNode} is in the sync ledger but the design file has no ${mirror.kind === "component" ? "component" : "element"} with that name.`,
          ]),
      ...(current === undefined
        ? [
            `${mirror.source} no longer exists in the web app, but ${mirror.designNode} still mirrors it.`,
          ]
        : current === mirror.sourceHash
          ? []
          : [
              `${mirror.source} changed since ${mirror.designNode} was last synced. Update the design to match the web app, then run \`pnpm --filter @gororobas/web-app design:acknowledge "${mirror.designNode}"\`.`,
            ]),
    ]
  })

  const unlisted = uiFolders
    .filter((folder) => !mirroredSources.has(`ui/${folder}`) && !waived.has(`ui/${folder}`))
    .map(
      (folder) =>
        `ui/${folder} is neither mirrored in the design file nor listed under notYetMirrored in design/design-sync.json.`,
    )

  const strayComponents = [...componentNames]
    .filter((name) => SOURCED_COMPONENT_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .filter(
      (name) =>
        !ledger.mirrors.some(
          (mirror) => name === mirror.designNode || name.startsWith(`${mirror.designNode}/`),
        ),
    )
    .map(
      (name) =>
        `${name} is a component in the design file with no entry in design/design-sync.json (and so no web-app source to stay in sync with).`,
    )

  const staleWaivers = ledger.notYetMirrored
    .filter((folder) => !uiFolders.includes(folder))
    .map((folder) => `notYetMirrored lists ui/${folder}, which no longer exists.`)

  return [...perMirror, ...unlisted, ...strayComponents, ...staleWaivers]
}

export const checkDesignSync = (inputs: CheckInputs): ReadonlyArray<string> => [
  ...tokenProblems(inputs),
  ...mirrorProblems(inputs),
]
