export default {
  singleQuote: false,
  trailingComma: "all",
  semi: false,
  ignorePatterns: [
    "**/dist/**",
    "**/build/**",
    "**/docs/**",
    "**/*.md",
    "**/node_modules/**",
    "**/coverage/**",
    "**/.git/**",
    "**/repos/**",
    "**/.agents/**",
    "experiments/**",
    "scratchpad/**",
  ],
  experimentalSortImports: {
    groups: [
      ["builtin", "external"],
      ["internal", "parent", "sibling", "index"],
    ],
  },
}
