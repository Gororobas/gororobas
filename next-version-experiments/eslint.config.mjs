import js from "@eslint/js"
import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"

/**
 * Custom ESLint rule to ban { disableValidation: true } in Schema.make() calls.
 * Disabling validation defeats the purpose of using Schema and can hide bugs.
 */
const noDisableValidationRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow disableValidation: true in Schema operations"
    },
    messages: {
      noDisableValidation: "Do not use { disableValidation: true }. Schema validation should always be enabled to catch invalid data. If you're seeing validation errors, fix the data or schema instead of disabling validation."
    },
    schema: []
  },
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
            node,
            messageId: "noDisableValidation"
          })
        }
      }
    }
  }
}

/**
 * Custom ESLint rule to ban sql<Type>`...` pattern.
 * Using type parameters with sql template literals provides no runtime validation.
 * Use SqlSchema.findOne/findAll/single/void with Schema for type-safe queries.
 */
const noSqlTypeParameterRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow type parameters on sql template literals"
    },
    messages: {
      noSqlTypeParam: "Do not use sql<Type>`...`. Type parameters provide no runtime validation. Use SqlSchema.findOne/findAll/single/void with a Schema for type-safe queries that validate at runtime."
    },
    schema: []
  },
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
              node,
              messageId: "noSqlTypeParam"
            })
          }
        }
      }
    }
  }
}

/**
 * Custom ESLint rule to suggest Option.fromNullable instead of ternary with Option.some/none.
 * x !== null ? Option.some(x) : Option.none() should be Option.fromNullable(x)
 */
const preferOptionFromNullableRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Option.fromNullable over ternary with Option.some/none"
    },
    messages: {
      preferFromNullable: "Use Option.fromNullable({{name}}) instead of ternary with Option.some/Option.none."
    },
    schema: []
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        const { test, consequent, alternate } = node

        // Check if test is: x !== null or x != null
        if (test.type !== "BinaryExpression") return
        if (test.operator !== "!==" && test.operator !== "!=") return

        let testedName = null
        if (test.left.type === "Identifier" && test.right.type === "Literal" && test.right.value === null) {
          testedName = test.left.name
        } else if (test.right.type === "Identifier" && test.left.type === "Literal" && test.left.value === null) {
          testedName = test.right.name
        } else if (test.left.type === "MemberExpression" && test.right.type === "Literal" && test.right.value === null) {
          testedName = context.getSourceCode().getText(test.left)
        } else if (test.right.type === "MemberExpression" && test.left.type === "Literal" && test.left.value === null) {
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
          node,
          messageId: "preferFromNullable",
          data: { name: testedName }
        })
      }
    }
  }
}

/**
 * Custom ESLint rule to ban direct fetch() usage.
 * Use Effect Platform or Effect RPC instead.
 * Direct fetch bypasses type safety, authentication handling, and error handling.
 */
const noDirectFetchRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct fetch() usage - use Effect Platform or Effect RPC instead"
    },
    messages: {
      noDirectFetch: "Do not use fetch() directly. Use Effect Platform or Effect RPC instead."
    },
    schema: []
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee

        // Direct fetch() call
        if (callee.type === "Identifier" && callee.name === "fetch") {
          context.report({ node, messageId: "noDirectFetch" })
          return
        }

        // window.fetch() or globalThis.fetch()
        if (callee.type === "MemberExpression" &&
            callee.property.type === "Identifier" &&
            callee.property.name === "fetch" &&
            callee.object.type === "Identifier" &&
            (callee.object.name === "window" || callee.object.name === "globalThis")) {
          context.report({ node, messageId: "noDirectFetch" })
          return
        }
      }
    }
  }
}

/**
 * Custom ESLint rule to warn when .pipe() has too many arguments.
 * Long pipes are hard to read and should be split into multiple .pipe() calls.
 */
const pipeMaxArgumentsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow .pipe() with more than 20 arguments"
    },
    messages: {
      tooManyArgs: ".pipe() has {{count}} arguments. Consider splitting into multiple .pipe() calls for readability (max 20)."
    },
    schema: []
  },
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
              node,
              messageId: "tooManyArgs",
              data: { count: node.arguments.length }
            })
          }
        }
      }
    }
  }
}

/**
 * Custom ESLint rule to warn when Layer.provide is nested inside another Layer.provide.
 * Nested Layer.provide calls are confusing and should be refactored.
 */
const noNestedLayerProvideRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow nested Layer.provide calls"
    },
    messages: {
      nestedProvide: "Nested Layer.provide detected. Extract the inner Layer.provide to a separate variable or use Layer.provideMerge."
    },
    schema: []
  },
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
              node: arg,
              messageId: "nestedProvide"
            })
          }
        }
      }
    }
  }
}


const localPlugin = {
  rules: {
    "no-disable-validation": noDisableValidationRule,
    "no-sql-type-parameter": noSqlTypeParameterRule,
    "prefer-option-from-nullable": preferOptionFromNullableRule,
    "no-direct-fetch": noDirectFetchRule,
    "pipe-max-arguments": pipeMaxArgumentsRule,
    "no-nested-layer-provide": noNestedLayerProvideRule
  }
}

export default [
  {
    ignores: [
      // Build outputs
      "**/dist/**",
      "**/build/**",
      "**/ios/**",
      "**/android/**",

      // Dependencies
      "**/node_modules/**",

      // Other
      "**/*.md",
      "**/.ralph/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "local": localPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Import extension conventions
      "local/import-extensions": "error",
      // Ban disableValidation: true
      "local/no-disable-validation": "error",
      // Ban sql<Type>`...` - use SqlSchema with Schema instead
      "local/no-sql-type-parameter": "error",
      // Prefer Option.fromNullable over ternary
      "local/prefer-option-from-nullable": "error",
      // Use TanStack Router navigate() instead of location.href
      "local/no-location-href-redirect": "error",
      // Use openapi-fetch client instead of direct fetch()
      "local/no-direct-fetch": "error",
      // localStorage is forbidden - use httpOnly cookies for auth, React state for app state
      "local/no-localstorage": "error",
      // Error when .pipe() has too many arguments (max 20)
      "local/pipe-max-arguments": "error",
      // Error when Layer.provide is nested inside another Layer.provide
      "local/no-nested-layer-provide": "error",
      // Allow unused variables starting with underscore
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      // Prohibit any and type assertions
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "never"
        }
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-namespace": "off",
      // Effect pattern: export both Schema constant and Type type with same name
      "no-redeclare": "off",
      // Effect uses generator functions that may not have explicit yield
      "require-yield": "off",
      // Prefer const assertions
      "prefer-const": "error",
      // Object shorthand
      "object-shorthand": "error",
      // No fallthrough in switch cases
      "no-fallthrough": "off",
      // Disable no-undef for TypeScript (TypeScript handles this)
      "no-undef": "off"
    }
  },
  {
    files: ["/**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // Allow console in tests
      "no-console": "off"
    }
  }
]
