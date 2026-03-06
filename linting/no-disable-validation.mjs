/**
 * Custom ESLint rule to ban { disableValidation: true } in Schema.make() calls.
 * Disabling validation defeats the purpose of using Schema and can hide bugs.
 */
export const noDisableValidationRule = {
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
