const aliasedEffectModuleNames = ["Array", "String", "Date", "Crypto", "Number", "RegExp"]

export const requireEffectAliasForEsNamespacesRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: `Alias Effect's ${aliasedEffectModuleNames.join(", ")} to distinguish them from the native ES implementations.`,
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.type !== "Literal" || node.source.value !== "effect") return

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") continue

          const aliasRequiredModule = aliasedEffectModuleNames.find(
            (moduleName) => specifier.imported.name === moduleName,
          )
          if (!aliasRequiredModule || specifier.local.name === `Effect${aliasRequiredModule}`) continue

          context.report({
            node: specifier.local,
            message: `Alias Effect ${aliasRequiredModule} as Effect${aliasRequiredModule} to distinguish it from the native ES ${aliasRequiredModule}.`,
          })
        }
      },
    }
  },
}
