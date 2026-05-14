/**
 * Custom ESLint rule to ban sql<Type>`...` pattern.
 * Using type parameters with sql template literals provides no runtime validation.
 * Use SqlSchema.findOne/findAll/single/void with Schema for type-safe queries.
 */
export const noSqlTypeParameterRule = {
  create(context) {
    const unwrapTypeInstantiation = (tag) =>
      tag.type === "TSInstantiationExpression" ? tag.expression : tag

    const hasTypeArguments = (node) =>
      Boolean(
        node.typeArguments ||
          node.typeParameters ||
          (node.tag.type === "TSInstantiationExpression" && node.tag.typeArguments),
      )

    const isSqlTag = (tag) => {
      const unwrappedTag = unwrapTypeInstantiation(tag)

      return (
        (unwrappedTag.type === "Identifier" && unwrappedTag.name === "sql") ||
        (unwrappedTag.type === "MemberExpression" &&
          unwrappedTag.property.type === "Identifier" &&
          unwrappedTag.property.name === "sql")
      )
    }

    return {
      TaggedTemplateExpression(node) {
        // oxlint parses sql<Type>`...` as type arguments either on the tagged
        // template node or on a TSInstantiationExpression wrapping the tag.
        if (hasTypeArguments(node) && isSqlTag(node.tag)) {
          context.report({
            messageId: "noSqlTypeParam",
            node,
          })
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
