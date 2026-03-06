/**
 * Custom ESLint rule to ensure Schema.TaggedErrorClass classes end with "Error" suffix.
 * Consistent naming convention: ProfileNotFoundError, not ProfileNotFound.
 */
export const taggedErrorSuffixRule = {
  create(context) {
    return {
      ClassDeclaration(node) {
        if (!node.id || node.id.type !== "Identifier") return

        const heritage = node.superClass
        if (!heritage) return

        // Check if extends Schema.TaggedErrorClass
        // Pattern: Schema.TaggedErrorClass<...>()("...", ...)
        let isTaggedErrorClass = false

        if (
          heritage.type === "CallExpression" &&
          heritage.callee.type === "CallExpression" &&
          heritage.callee.callee.type === "MemberExpression" &&
          heritage.callee.callee.object.type === "Identifier" &&
          heritage.callee.callee.object.name === "Schema" &&
          heritage.callee.callee.property.type === "Identifier" &&
          heritage.callee.callee.property.name === "TaggedErrorClass"
        ) {
          isTaggedErrorClass = true
        }

        if (!isTaggedErrorClass) return

        const className = node.id.name
        if (className.endsWith("Error") === false) {
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
      description: "Require Schema.TaggedErrorClass class names to end with 'Error' suffix",
    },
    messages: {
      missingErrorSuffix:
        "Schema.TaggedErrorClass class '{{name}}' should end with 'Error' suffix (e.g., ProfileNotFoundError, not ProfileNotFound).",
    },
    schema: [],
    type: "problem",
  },
}
