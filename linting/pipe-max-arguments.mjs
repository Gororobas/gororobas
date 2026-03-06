/**
 * Custom ESLint rule to warn when .pipe() has too many arguments.
 * Long pipes are hard to read and should be split into multiple .pipe() calls.
 */
export const pipeMaxArgumentsRule = {
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
