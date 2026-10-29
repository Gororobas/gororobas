import { describe, it } from "@effect/vitest"
import effectPlugin from "@mpsuesser/oxlint-plugin-effect"
import { RuleTester } from "oxlint/plugins-dev"

import localPlugin from "./index.mjs"
import { noNodeApisRule } from "./no-node-apis.mjs"
import { noSchemaDecodeUnknownRule } from "./no-schema-decode-unknown.mjs"
import { preferArrSortRule } from "./prefer-arr-sort.mjs"
import {
  noFunctionAliasesRule,
  noInlineImportsRule,
  noManyFunctionParametersRule,
  paddingAroundLargeStatementsRule,
} from "./readability.mjs"
import { requireEffectVitestRule } from "./require-effect-vitest.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("effect/no-runtime-typeof", effectPlugin.rules["no-runtime-typeof"], {
  valid: ["const value = 1"],
  invalid: [{ code: "typeof value", errors: [{ messageId: "runtimeTypeof" }] }],
})

tester.run(
  "effect/require-safety-comment-for-type-assertion",
  effectPlugin.rules["require-safety-comment-for-type-assertion"],
  {
    valid: [{ code: 'const value = "a" as const', filename: "test.ts" }],
    invalid: [
      {
        code: "const value = source as string",
        filename: "test.ts",
        errors: [{ messageId: "missingSafetyComment" }],
      },
    ],
  },
)

tester.run("no-schema-decode-unknown", noSchemaDecodeUnknownRule, {
  valid: [
    'import { Schema } from "effect"; Schema.decodeSync(schema)(value)',
    'import { Schema } from "other"; Schema.decodeUnknownSync(schema)(value)',
    'import { Schema } from "effect"; function f(Schema) { return Schema.decodeUnknownSync(value) }',
  ],
  invalid: [
    'import { Schema } from "effect"; const decode = Schema.decodeUnknownEffect(schema)',
    'import { Schema as S } from "effect"; S.decodeUnknownSync(schema)(value)',
    'import * as Schema from "effect/Schema"; Schema.decodeUnknownOption(schema)(value)',
    'import * as Effect from "effect"; Effect.Schema.decodeUnknownExit(schema)(value)',
    'import { Schema } from "effect"; Schema["decodeUnknownPromise"](schema)(value)',
    'import { decodeUnknownResult as decode } from "effect/Schema"; decode(schema)(value)',
  ].map((code) => ({ code, errors: [{ messageId: "decodeUnknown" }] })),
})

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

tester.run("prefer-arr-sort", preferArrSortRule, {
  valid: [
    'import { Array as EffectArray, Order } from "effect"; EffectArray.sort(items, Order.String)',
    'import * as EffectArray from "effect/Array"; EffectArray.sort(items, order)',
    'import * as Arr from "effect/Array"; Arr.sort(items, order)',
    "items.map(transform)",
  ],
  invalid: ["items.sort()", "items.sort(compare)", "[...items].sort(compare)"].map((code) => ({
    code,
    errors: [{ message: /Avoid native/ }],
  })),
})

tester.run("require-effect-vitest", requireEffectVitestRule, {
  valid: [
    'import { it, expect, assert } from "@effect/vitest"',
    'import * as Test from "@effect/vitest"',
    'import { defineConfig } from "vitest/config"',
    'export { it } from "@effect/vitest"',
    'import("@effect/vitest")',
  ],
  invalid: [
    'import { it, test, expect, assert } from "vitest"',
    'import * as Test from "vitest"',
    'export { test } from "vitest"',
    'export * from "vitest"',
    'import("vitest")',
    'require("vitest")',
  ].map((code) => ({ code, errors: [{ messageId: "effectVitest" }] })),
})

// Every local rule gets both an accepted and a rejected example so changes to its visitor
// cannot silently turn enforcement off.

tester.run("no-direct-fetch", localPlugin.rules["no-direct-fetch"], {
  valid: [{ code: "client.get(url)", filename: "/project/src/example.ts" }],
  invalid: [{ code: "fetch(url)", filename: "/project/src/example.ts", errors: 1 }],
})

tester.run("no-direct-id-construction", localPlugin.rules["no-direct-id-construction"], {
  valid: [{ code: "IdGen.make(PersonId)", filename: "/project/src/example.ts" }],
  invalid: [{ code: "PersonId.makeUnsafe(value)", filename: "/project/src/example.ts", errors: 1 }],
})

tester.run("no-disable-validation", localPlugin.rules["no-disable-validation"], {
  valid: [
    {
      code: "Schema.make(value, { disableValidation: false })",
      filename: "/project/src/example.ts",
    },
  ],
  invalid: [
    {
      code: "Schema.make(value, { disableValidation: true })",
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})

tester.run("no-nested-layer-provide", localPlugin.rules["no-nested-layer-provide"], {
  valid: [{ code: "Layer.provide(A, B)", filename: "/project/src/example.ts" }],
  invalid: [
    {
      code: "Layer.provide(A, Layer.provide(B, C))",
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})

tester.run("no-sql-type-parameter", localPlugin.rules["no-sql-type-parameter"], {
  valid: [{ code: "sql`SELECT 1`", filename: "/project/src/example.ts" }],
  invalid: [{ code: "sql<Row>`SELECT 1`", filename: "/project/src/example.ts", errors: 1 }],
})

tester.run("pipe-max-arguments", localPlugin.rules["pipe-max-arguments"], {
  valid: [{ code: "effect.pipe(a,b)", filename: "/project/src/example.ts" }],
  invalid: [
    {
      code: "effect.pipe(f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f,f)",
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})

tester.run("prefer-option-from-nullable", localPlugin.rules["prefer-option-from-nullable"], {
  valid: [{ code: "Option.fromNullable(x)", filename: "/project/src/example.ts" }],
  invalid: [
    {
      code: "x !== null ? Option.some(x) : Option.none()",
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})

tester.run("require-canonical-module-names", localPlugin.rules["require-canonical-module-names"], {
  valid: [{ code: 'import { Schema } from "effect"', filename: "/project/src/example.ts" }],
  invalid: [
    {
      code: 'import { Schema as S } from "effect"',
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})

tester.run(
  "require-effect-alias-for-es-namespaces",
  localPlugin.rules["require-effect-alias-for-es-namespaces"],
  {
    valid: [
      {
        code: 'import { Array as EffectArray } from "effect"',
        filename: "/project/src/example.ts",
      },
    ],
    invalid: [
      { code: 'import { Array } from "effect"', filename: "/project/src/example.ts", errors: 1 },
    ],
  },
)

tester.run(
  "service-map-class-suffix-by-file",
  localPlugin.rules["service-map-class-suffix-by-file"],
  {
    valid: [
      {
        code: 'class PeopleService extends Context.Service<PeopleService>()("People", {}) {}',
        filename: "/project/src/service.ts",
      },
    ],
    invalid: [
      {
        code: 'class People extends Context.Service<People>()("People", {}) {}',
        filename: "/project/src/service.ts",
        errors: 1,
      },
    ],
  },
)

tester.run("tagged-error-suffix", localPlugin.rules["tagged-error-suffix"], {
  valid: [
    {
      code: 'class MissingError extends Schema.TaggedError<MissingError>()("Missing", {}) {}',
      filename: "/project/src/example.ts",
    },
  ],
  invalid: [
    {
      code: 'class Missing extends Schema.TaggedError<Missing>()("Missing", {}) {}',
      filename: "/project/src/example.ts",
      errors: 1,
    },
  ],
})
