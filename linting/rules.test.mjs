import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"

import { noNodeApisRule } from "./no-node-apis.mjs"
import {
  noFunctionAliasesRule,
  noInlineImportsRule,
  noManyFunctionParametersRule,
  paddingAroundLargeStatementsRule,
} from "./readability.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-node-apis", noNodeApisRule, {
  valid: [
    'import { Path } from "effect"',
    'import x from "./path.js"',
    'import x from "node-fetch"',
  ],
  invalid: [
    'import x from "node:path"',
    'import x from "fs/promises"',
    'export { readFile } from "node:fs/promises"',
    'export * from "node:crypto"',
    'const x = import("node:http")',
    "const x = import(`node:fs`)",
    'const x = require("node:child_process")',
  ]
    .map((code) => ({ code, errors: [{ messageId: "node" }] }))
    .concat([
      {
        code: 'type X = import("node:fs").Stats',
        filename: "test.ts",
        errors: [{ messageId: "node" }],
      },
    ]),
})

tester.run("no-function-aliases", noFunctionAliasesRule, {
  valid: [
    "const factory = () => create()",
    "const wrapper = async (value) => target(value)",
    "function* wrapper(value) { return target(value) }",
    "const wrapper = (value) => value.method(value)",
    {
      code: "const wrapper = (value: unknown): value is string => guard(value)",
      filename: "test.ts",
    },
    "const wrapper = (value = 1) => target(value)",
    "const wrapper = (value) => target(transform(value))",
    "const wrapper = (target) => target(target)",
    "export default function(value) { return target(value) }",
    "function wrapper(value) { return wrapper(value) }",
    "const wrapper = function recursive(value) { return recursive(value) }",
  ],
  invalid: [
    "const wrapper = (value) => object.method(value)",
    "const wrapper = (value) => makeTarget(options)(value)",
    "const wrapper = (value) => target(value)",
    "function wrapper(value) { return target(value) }",
    "const wrapper = function(value) { return target(value) }",
  ].map((code) => ({ code, errors: [{ messageId: "alias" }] })),
})

tester.run("no-many-function-parameters", noManyFunctionParametersRule, {
  valid: [
    "const f = ({ a, b, c }) => a + b + c",
    "const f = (a, b) => a + b",
    "function update(a, b, c) {}",
    "Submodel.defineView((a, b, c) => a)",
  ],
  invalid: [
    "function f(a, b, c) {}",
    "const f = (a, b, c) => a",
    "const f = function(a, b, c) {}",
    "Other.defineView((a, b, c) => a)",
  ].map((code) => ({ code, errors: [{ messageId: "parameters" }] })),
})

tester.run("no-inline-imports", noInlineImportsRule, {
  valid: [{ code: 'import type { A } from "./a"; type B = A', filename: "test.ts" }],
  invalid: [
    { code: 'type A = import("./a").A', filename: "test.ts", errors: [{ messageId: "inline" }] },
  ],
})

const large = "const large = make({\n  a: 1,\n  b: 2,\n  c: 3,\n})"

tester.run("padding-around-large-statements", paddingAroundLargeStatementsRule, {
  valid: [
    "const a = 1\nconst b = 2",
    "function f() {\n;[1, 2].forEach((value) => {\nconsole.log(value)\nconsole.log(value)\nconsole.log(value)\n})\n}",
    "const a = make({\n  b: 1,\n})\nconst b = 2",
    `${large}\n\nconst next = 1`,
    `${large}\n\n// Next group\nconst next = 1`,
    'import {\n  A,\n  B,\n  C,\n} from "effect"\nconst next = 1',
  ],
  invalid: [
    {
      code: `${large} // Trailing comment\nconst next = 1`,
      output: `${large} // Trailing comment\n\nconst next = 1`,
      errors: [{ messageId: "padding" }],
    },
    {
      code: `${large}\nconst next = 1`,
      output: `${large}\n\nconst next = 1`,
      errors: [{ messageId: "padding" }],
    },
    {
      code: `const before = 1\n${large}`,
      output: `const before = 1\n\n${large}`,
      errors: [{ messageId: "padding" }],
    },
    {
      code: `${large}\n// Next group\nconst next = 1`,
      output: `${large}\n\n// Next group\nconst next = 1`,
      errors: [{ messageId: "padding" }],
    },
    {
      code: `function f() {\n${large}\nreturn 1\n}`,
      output: `function f() {\n${large}\n\nreturn 1\n}`,
      errors: [{ messageId: "padding" }],
    },
  ],
})
