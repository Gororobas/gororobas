export const preferArrSortRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow native .sort() and require Effect Array.sort with an explicit Order.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "sort"
        ) {
          return
        }

        if (
          callee.object.type === "Identifier" &&
          (callee.object.name === "Arr" || callee.object.name === "EffectArray")
        ) {
          return
        }

        context.report({
          node,
          message:
            "Avoid native `.sort()`. Use `EffectArray.sort(items, order)` from `effect/Array` with an explicit `Order` for predictable, immutable sorting. (EF-38)",
        })
      },
    }
  },
}
