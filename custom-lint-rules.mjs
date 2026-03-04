/**
 * Custom ESLint rule to ban { disableValidation: true } in Schema.make() calls.
 * Disabling validation defeats the purpose of using Schema and can hide bugs.
 */
const noDisableValidationRule = {
  create(context) {
    return {
      Property(node) {
        if (
          node.key &&
          ((node.key.type === "Identifier" && node.key.name === "disableValidation") ||
            (node.key.type === "Literal" && node.key.value === "disableValidation")) &&
          node.value &&
          node.value.type === "Literal" &&
          node.value.value === true
        ) {
          context.report({
            messageId: "noDisableValidation",
            node,
          })
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow disableValidation: true in Schema operations",
    },
    messages: {
      noDisableValidation:
        "Do not use { disableValidation: true }. Schema validation should always be enabled to catch invalid data. If you're seeing validation errors, fix the data or schema instead of disabling validation.",
    },
    schema: [],
    type: "problem",
  },
}

/**
 * Custom ESLint rule to ban sql<Type>`...` pattern.
 * Using type parameters with sql template literals provides no runtime validation.
 * Use SqlSchema.findOne/findAll/single/void with Schema for type-safe queries.
 */
const noSqlTypeParameterRule = {
  create(context) {
    return {
      TaggedTemplateExpression(node) {
        const tag = node.tag
        // Check for sql<Type>`...` - typeArguments on TaggedTemplateExpression
        if (node.typeArguments || node.typeParameters) {
          // Check if tag is sql or ends with .sql
          const isSql =
            (tag.type === "Identifier" && tag.name === "sql") ||
            (tag.type === "MemberExpression" &&
              tag.property.type === "Identifier" &&
              tag.property.name === "sql")
          if (isSql) {
            context.report({
              messageId: "noSqlTypeParam",
              node,
            })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow type parameters on sql template literals",
    },
    messages: {
      noSqlTypeParam:
        "Do not use sql<Type>`...`. Type parameters provide no runtime validation. Use SqlSchema.findOne/findAll/single/void with a Schema for type-safe queries that validate at runtime.",
    },
    schema: [],
    type: "problem",
  },
}

/**
 * Custom ESLint rule to suggest Option.fromNullable instead of ternary with Option.some/none.
 * x !== null ? Option.some(x) : Option.none() should be Option.fromNullable(x)
 */
const preferOptionFromNullableRule = {
  create(context) {
    return {
      ConditionalExpression(node) {
        const { test, consequent, alternate } = node

        // Check if test is: x !== null or x != null
        if (test.type !== "BinaryExpression") return
        if (test.operator !== "!==" && test.operator !== "!=") return

        let testedName = null
        if (
          test.left.type === "Identifier" &&
          test.right.type === "Literal" &&
          test.right.value === null
        ) {
          testedName = test.left.name
        } else if (
          test.right.type === "Identifier" &&
          test.left.type === "Literal" &&
          test.left.value === null
        ) {
          testedName = test.right.name
        } else if (
          test.left.type === "MemberExpression" &&
          test.right.type === "Literal" &&
          test.right.value === null
        ) {
          testedName = context.getSourceCode().getText(test.left)
        } else if (
          test.right.type === "MemberExpression" &&
          test.left.type === "Literal" &&
          test.left.value === null
        ) {
          testedName = context.getSourceCode().getText(test.right)
        }
        if (!testedName) return

        // Check if consequent is Option.some(x)
        if (consequent.type !== "CallExpression") return
        const conseqCallee = consequent.callee
        const isOptionSome =
          conseqCallee.type === "MemberExpression" &&
          conseqCallee.object.type === "Identifier" &&
          conseqCallee.object.name === "Option" &&
          conseqCallee.property.type === "Identifier" &&
          conseqCallee.property.name === "some"
        if (!isOptionSome) return

        // Check if alternate is Option.none()
        if (alternate.type !== "CallExpression") return
        const altCallee = alternate.callee
        // Handle both Option.none() and Option.none<Type>()
        const isOptionNone =
          (altCallee.type === "MemberExpression" &&
            altCallee.object.type === "Identifier" &&
            altCallee.object.name === "Option" &&
            altCallee.property.type === "Identifier" &&
            altCallee.property.name === "none") ||
          (altCallee.type === "TSInstantiationExpression" &&
            altCallee.expression.type === "MemberExpression" &&
            altCallee.expression.object.type === "Identifier" &&
            altCallee.expression.object.name === "Option" &&
            altCallee.expression.property.type === "Identifier" &&
            altCallee.expression.property.name === "none")
        if (!isOptionNone) return

        context.report({
          data: { name: testedName },
          messageId: "preferFromNullable",
          node,
        })
      },
    }
  },
  meta: {
    docs: {
      description: "Prefer Option.fromNullable over ternary with Option.some/none",
    },
    messages: {
      preferFromNullable:
        "Use Option.fromNullable({{name}}) instead of ternary with Option.some/Option.none.",
    },
    schema: [],
    type: "suggestion",
  },
}

/**
 * Custom ESLint rule to ban direct fetch() usage.
 * Use Effect Platform or Effect RPC instead.
 * Direct fetch bypasses type safety, authentication handling, and error handling.
 */
const noDirectFetchRule = {
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee

        // Direct fetch() call
        if (callee.type === "Identifier" && callee.name === "fetch") {
          context.report({ messageId: "noDirectFetch", node })
          return
        }

        // window.fetch() or globalThis.fetch()
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "fetch" &&
          callee.object.type === "Identifier" &&
          (callee.object.name === "window" || callee.object.name === "globalThis")
        ) {
          context.report({ messageId: "noDirectFetch", node })
          return
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow direct fetch() usage - use Effect Platform or Effect RPC instead",
    },
    messages: {
      noDirectFetch: "Do not use fetch() directly. Use Effect Platform or Effect RPC instead.",
    },
    schema: [],
    type: "problem",
  },
}

/**
 * Custom ESLint rule to warn when .pipe() has too many arguments.
 * Long pipes are hard to read and should be split into multiple .pipe() calls.
 */
const pipeMaxArgumentsRule = {
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        // Check for .pipe() method call
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "pipe"
        ) {
          if (node.arguments.length > 20) {
            context.report({
              data: { count: node.arguments.length },
              messageId: "tooManyArgs",
              node,
            })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow .pipe() with more than 20 arguments",
    },
    messages: {
      tooManyArgs:
        ".pipe() has {{count}} arguments. Consider splitting into multiple .pipe() calls for readability (max 20).",
    },
    schema: [],
    type: "problem",
  },
}

/**
 * Custom ESLint rule to warn when Layer.provide is nested inside another Layer.provide.
 * Nested Layer.provide calls are confusing and should be refactored.
 */
const noNestedLayerProvideRule = {
  create(context) {
    function isLayerProvide(node) {
      if (node.type !== "CallExpression") return false
      const callee = node.callee
      return (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Layer" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "provide"
      )
    }

    return {
      CallExpression(node) {
        if (!isLayerProvide(node)) return

        // Check if any argument is also a Layer.provide call
        for (const arg of node.arguments) {
          if (isLayerProvide(arg)) {
            context.report({
              messageId: "nestedProvide",
              node: arg,
            })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow nested Layer.provide calls",
    },
    messages: {
      nestedProvide:
        "Nested Layer.provide detected. Extract the inner Layer.provide to a separate variable or use Layer.provideMerge.",
    },
    schema: [],
    type: "problem",
  },
}

const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function isTestFile(filename) {
  if (!filename) return false
  return filename.includes("/test/") || filename.includes(".test.") || filename.includes("_test.")
}

const noDirectIdConstructionRule = {
  create(context) {
    const filename = context.getFilename?.() || ""

    return {
      CallExpression(node) {
        if (isTestFile(filename)) return

        const callee = node.callee
        if (callee.type !== "MemberExpression") return
        if (callee.property.type !== "Identifier" || callee.property.name !== "make") return

        const obj = callee.object
        if (obj.type !== "Identifier") return

        if (obj.name.endsWith("Id")) {
          context.report({
            data: { idType: obj.name },
            messageId: "noDirectIdMake",
            node,
          })
        }
      },

      Literal(node) {
        if (isTestFile(filename)) return
        if (typeof node.value !== "string") return
        if (!UUID_REGEX.test(node.value)) return

        context.report({
          messageId: "noHardcodedUuid",
          node,
        })
      },
    }
  },
  meta: {
    docs: {
      description: "Require IdGen.make() for ID generation instead of direct construction",
    },
    messages: {
      noDirectIdMake:
        "Do not use {{idType}}.make() directly. Use yield* IdGen.make({{idType}}) to generate IDs through the IdGen service.",
      noHardcodedUuid:
        "Hardcoded UUID detected. Use yield* IdGen.make(XxxId) to generate IDs through the IdGen service.",
    },
    schema: [],
    type: "problem",
  },
}

/**
 * Custom ESLint rule to ensure Schema.TaggedError classes end with "Error" suffix.
 * Consistent naming convention: ProfileNotFoundError, not ProfileNotFound.
 */
const taggedErrorSuffixRule = {
  create(context) {
    return {
      ClassDeclaration(node) {
        if (!node.id || node.id.type !== "Identifier") return

        const heritage = node.superClass
        if (!heritage) return

        // Check if extends Schema.TaggedError
        // Pattern: Schema.TaggedError<...>()("...", ...)
        let isTaggedError = false

        if (
          heritage.type === "CallExpression" &&
          heritage.callee.type === "CallExpression" &&
          heritage.callee.callee.type === "MemberExpression" &&
          heritage.callee.callee.object.type === "Identifier" &&
          heritage.callee.callee.object.name === "Schema" &&
          heritage.callee.callee.property.type === "Identifier" &&
          heritage.callee.callee.property.name === "TaggedError"
        ) {
          isTaggedError = true
        }

        if (!isTaggedError) return

        const className = node.id.name
        if (!className.endsWith("Error")) {
          context.report({
            data: { name: className },
            messageId: "missingErrorSuffix",
            node: node.id,
          })
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Require Schema.TaggedError class names to end with 'Error' suffix",
    },
    messages: {
      missingErrorSuffix:
        "Schema.TaggedError class '{{name}}' should end with 'Error' suffix (e.g., ProfileNotFoundError, not ProfileNotFound).",
    },
    schema: [],
    type: "problem",
  },
}

export default {
  meta: { name: "custom-lint-rules" },
  rules: {
    "no-direct-fetch": noDirectFetchRule,
    "no-direct-id-construction": noDirectIdConstructionRule,
    "no-disable-validation": noDisableValidationRule,
    "no-nested-layer-provide": noNestedLayerProvideRule,
    "no-sql-type-parameter": noSqlTypeParameterRule,
    "pipe-max-arguments": pipeMaxArgumentsRule,
    "prefer-option-from-nullable": preferOptionFromNullableRule,
    "tagged-error-suffix": taggedErrorSuffixRule,
  },
}
