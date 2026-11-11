import { describe, expect, it } from "@effect/vitest"

import { type CheckInputs, checkDesignSync } from "./check"
import { designVariables } from "./design-tokens"
import { colorToHex } from "./oklch"

const penVariablesFor = (variables: ReturnType<typeof designVariables>) =>
  Object.fromEntries(
    Object.entries(variables).map(([name, variable]) => [
      name,
      variable.type === "color"
        ? {
            type: "color",
            value: [
              { value: variable.value.light, theme: { mode: "light" } },
              { value: variable.value.dark, theme: { mode: "dark" } },
            ],
          }
        : variable,
    ]),
  )

const inSync = (): CheckInputs => {
  const variables = designVariables()

  return {
    pen: {
      variables: penVariablesFor(variables),
      children: [{ name: "ui/chip", reusable: true }, { name: "Artigo" }],
    },
    ledger: {
      mirrors: [
        { penNode: "ui/chip", source: "ui/chip", sourceHash: "a", kind: "component" },
        { penNode: "Artigo", source: "blocks/wiki-article", sourceHash: "b", kind: "screen" },
      ],
      notYetMirrored: [],
    },
    variables,
    sourceHashes: { "ui/chip": "a", "blocks/wiki-article": "b" },
    uiFolders: ["chip"],
  }
}

describe("checkDesignSync", () => {
  it("accepts a design file that matches the web app", () => {
    expect(checkDesignSync(inSync())).toEqual([])
  })

  it("flags a color that drifted from the theme", () => {
    const inputs = inSync()
    const drifted = {
      ...inputs.pen.variables,
      "tone/primary/background": { type: "color", value: "#000000" },
    }
    const problems = checkDesignSync({ ...inputs, pen: { ...inputs.pen, variables: drifted } })

    expect(
      problems.some((problem) => problem.startsWith("Variable tone/primary/background (light)")),
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

  it("flags reusable design components that have no web-app source", () => {
    const inputs = inSync()
    const pen = {
      ...inputs.pen,
      children: [...(inputs.pen.children ?? []), { name: "ui/ghost", reusable: true }],
    }

    expect(checkDesignSync({ ...inputs, pen })).toEqual([expect.stringContaining("ui/ghost")])
  })
})

describe("colorToHex", () => {
  it("converts the theme's oklch ramps to the hex Tailwind documents", () => {
    expect(colorToHex("oklch(63.7% 0.237 25.331)")).toBe("#fb2c36")
    expect(colorToHex("#FDEADD")).toBe("#fdeadd")
  })
})
