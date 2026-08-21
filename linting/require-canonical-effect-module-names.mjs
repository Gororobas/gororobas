const canonicalEffectModuleNames = new Set(["Match", "Predicate", "Schema", "Option", "Record"])

export const requireCanonicalEffectModuleNamesRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Use canonical names for Effect Schema, Predicate, and Match imports.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.type !== "Literal" || node.source.value !== "effect") return

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== "ImportSpecifier" ||
            specifier.imported.type !== "Identifier" ||
            specifier.local.name === specifier.imported.name ||
            !canonicalEffectModuleNames.has(specifier.imported.name)
          ) {
            continue
          }

          context.report({
            node: specifier.local,
            message: `Use ${specifier.imported.name} directly instead of the abbreviated ${specifier.local.name}.`,
          })
        }
      },
    }
  },
}
