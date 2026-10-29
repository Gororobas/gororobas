import { describe, expect, it } from "@effect/vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RuleTester } from "oxlint/plugins-dev"

import {
  collectConstants,
  moduleImportBoundaries,
  noLiteralStylesOutsideTheme,
  noStringifiedErrors,
} from "./architecture.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only
const tester = new RuleTester()

tester.run("module-import-boundaries", moduleImportBoundaries, {
  valid: [
    {
      code: 'import { query } from "./queries.js"',
      filename: "/project/apps/server/src/people/service.ts",
    },
    {
      code: 'import { query } from "./queries.js"',
      filename: "/project/apps/server/src/people/api-live.ts",
    },
  ],
  invalid: [
    {
      code: 'import { query } from "../profiles/queries.js"',
      filename: "/project/apps/server/src/people/service.ts",
      errors: 1,
    },
    {
      code: 'import { server } from "@gororobas/server"',
      filename: "/project/packages/domain/src/domain.ts",
      errors: 1,
    },
  ],
})
tester.run("no-stringified-errors", noStringifiedErrors, {
  valid: ["Message.Failed({ error })", "String(error)", "Message.Loaded({ title: String(title) })"],
  invalid: [
    "Message.Failed({ error: String(error) })",
    "Message.Failed({ error: `${error}` })",
  ].map((code) => ({ code, errors: 1 })),
})
tester.run("no-literal-styles-outside-theme", noLiteralStylesOutsideTheme, {
  valid: [
    "Style.make({ color: theme.color })",
    { code: 'Style.make({ color: "#fff" })', filename: "/project/src/ui/theme/colors.ts" },
  ],
  invalid: [
    'Style.make({ color: "#fff" })',
    'Style.make({ gap: "12px" })',
    "Style.make({ border: `1px solid ${color}` })",
  ].map((code) => ({ code, errors: 1 })),
})

it("indexes exported constants across files without counting private declarations or comments", () => {
  const directory = mkdtempSync(join(tmpdir(), "lint-constants-"))
  try {
    writeFileSync(
      join(directory, "first.ts"),
      "export const PAGE_SIZE = 10; const PRIVATE = 1; // export const COMMENT = 0",
    )
    writeFileSync(
      join(directory, "second.ts"),
      "export const PAGE_SIZE = 20; export const OTHER = 1;",
    )
    const declarations = collectConstants([directory])
    expect(declarations.get("PAGE_SIZE")).toHaveLength(2)
    expect(declarations.get("OTHER")).toHaveLength(1)
    expect(declarations.has("PRIVATE")).toBe(false)
    expect(declarations.has("COMMENT")).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
