import { describe, expect, it } from "@effect/vitest"

import { type CheckInputs, checkDesignSync, designTokenName } from "./check"
import { parseCanvas, parseDesignSystem } from "./design-file"
import { designVariables } from "./design-tokens"
import { colorToHex } from "./oklch"

/** The design system as Brilliant writes it: per-mode colors in braces, the rest as `name: value`. */
const designSystemFor = (variables: ReturnType<typeof designVariables>): string =>
  [
    "modes { rendering: [] }",
    ...Object.entries(variables).map(([name, variable]) =>
      variable.type === "color"
        ? `${designTokenName(name)} { $default: ${variable.value.light}, theme.dark: ${variable.value.dark} }`
        : `${designTokenName(name)}: ${variable.value}`,
    ),
    "hide: pen.view.reference",
  ].join("\n")

const canvas = [
  "bp:v1",
  "canvas:",
  "  writer: 1",
  "---",
  '913f56883e075494 al(v,g(32)) ds(gororobas) f[] "Components"',
  '  4187b4b7b16716e9 fr comp axes[state[option,selected]] p(0,0) s(194,66) "ui/chip"',
  '    c733947a652b0189 t("Plants",Alan Sans,14) f[] "Label"',
  '  d2666bc185439da3 fr comp p(0,0) s(80,26) "ui/chip/compact"',
  '9c4b9ed9a90b15f6 al(v) s(375,hug) f[] clip "Artigo"',
].join("\n")

const inSync = (): CheckInputs => {
  const variables = designVariables()

  return {
    design: {
      nodes: parseCanvas(canvas),
      tokens: parseDesignSystem(designSystemFor(variables)),
    },
    ledger: {
      mirrors: [
        { designNode: "ui/chip", source: "ui/chip", sourceHash: "a", kind: "component" },
        { designNode: "Artigo", source: "blocks/wiki-article", sourceHash: "b", kind: "screen" },
      ],
      notYetMirrored: [],
    },
    variables,
    sourceHashes: { "ui/chip": "a", "blocks/wiki-article": "b" },
    uiFolders: ["chip"],
  }
}

describe("parseCanvas", () => {
  it("reads element names and which elements are components", () => {
    expect(parseCanvas(canvas)).toEqual([
      { name: "Components", isComponent: false },
      { name: "ui/chip", isComponent: true },
      { name: "Label", isComponent: false },
      { name: "ui/chip/compact", isComponent: true },
      { name: "Artigo", isComponent: false },
    ])
  })
})

describe("checkDesignSync", () => {
  it("accepts a design file that matches the web app", () => {
    expect(checkDesignSync(inSync())).toEqual([])
  })

  it("flags a color that drifted from the theme", () => {
    const inputs = inSync()
    const drifted = {
      ...inputs.design.tokens,
      [designTokenName("tone/primary/background")]: { light: "#000000", dark: "#000000" },
    }
    const problems = checkDesignSync({
      ...inputs,
      design: { ...inputs.design, tokens: drifted },
    })

    expect(
      problems.some((problem) => problem.startsWith("Token pen.tone.primary.background (light)")),
    ).toBe(true)
  })

  it("flags a source that changed after the design was synced", () => {
    const inputs = inSync()
    const problems = checkDesignSync({
      ...inputs,
      sourceHashes: { ...inputs.sourceHashes, "ui/chip": "changed" },
    })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("ui/chip changed since")
  })

  it("requires new UI kit folders to be mirrored or explicitly deferred", () => {
    const inputs = inSync()

    expect(checkDesignSync({ ...inputs, uiFolders: ["chip", "new-widget"] })).toEqual([
      expect.stringContaining("ui/new-widget is neither mirrored"),
    ])
  })

  it("flags design components that have no web-app source", () => {
    const inputs = inSync()
    const design = {
      ...inputs.design,
      nodes: [...inputs.design.nodes, { name: "ui/ghost", isComponent: true }],
    }

    expect(checkDesignSync({ ...inputs, design })).toEqual([expect.stringContaining("ui/ghost")])
  })
})

describe("colorToHex", () => {
  it("converts the theme's oklch ramps to the hex Tailwind documents", () => {
    expect(colorToHex("oklch(63.7% 0.237 25.331)")).toBe("#fb2c36")
    expect(colorToHex("#FDEADD")).toBe("#fdeadd")
  })
})
