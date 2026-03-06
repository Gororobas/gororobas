/**
 * Custom ESLint rule to warn when Layer.provide is nested inside another Layer.provide.
 * Nested Layer.provide calls are confusing and should be refactored.
 */
export const noNestedLayerProvideRule = {
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
        if (isLayerProvide(node) === false) return

        // Check if any argument is also a Layer.provide call
        for (const arg of node.arguments) {
          if (isLayerProvide(arg) === true) {
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
