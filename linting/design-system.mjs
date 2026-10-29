const utilityClassPrefix =
  /^(?:-?(?:p|px|py|pt|pb|ps|pe|m|mx|my|mt|mb|ms|me|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h|size|flex|grid|block|inline|hidden|items|justify|self|place|text|font|leading|rounded|border|bg|shadow|opacity|overflow|z|absolute|relative|fixed|sticky|top|bottom|left|right|inset|translate|rotate|scale|cursor|select|whitespace|truncate|break|object|sr|ring)-)/

const isLiteralString = (node) => node?.type === "Literal" && typeof node.value === "string"

const classNameValue = (node) => {
  if (node.type !== "Property" || node.computed) return undefined
  if (node.key.type !== "Identifier" || node.key.name !== "className") return undefined
  return node.value
}

const noUtilityClassNames = {
  meta: {
    type: "problem",
    docs: { description: "Use Pleat Style recipes instead of open-ended utility class names." },
    schema: [],
  },
  create(context) {
    const inspect = (node) => {
      if (!isLiteralString(node)) return
      const utility = node.value.split(/\s+/).find((token) => utilityClassPrefix.test(token))
      if (utility === undefined) return
      context.report({
        node,
        message: `Replace the utility class "${utility}" with a Pleat Style.`,
      })
    }
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "h" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "Class"
        ) {
          inspect(node.arguments[0])
        }
      },
      Property(node) {
        const value = classNameValue(node)
        if (value !== undefined) inspect(value)
      },
    }
  },
}

const copyElements = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "strong",
  "em",
  "small",
  "label",
  "blockquote",
  "time",
])

const requireAppTextForCopyElements = {
  meta: {
    type: "problem",
    docs: { description: "Render copy-bearing elements through AppText." },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.object.type !== "Identifier" ||
          node.callee.object.name !== "h" ||
          node.callee.property.type !== "Identifier" ||
          !copyElements.has(node.callee.property.name)
        ) {
          return
        }
        context.report({ node, message: "Use AppText.view for copy-bearing HTML elements." })
      },
    }
  },
}

const noBoxShadows = {
  meta: {
    type: "problem",
    docs: { description: "Keep elevation flat; shadows are not part of the design system." },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : node.key.value
        if (key === "boxShadow" || key === "box-shadow") {
          context.report({
            node,
            message: "Remove box shadows; use borders and surface tones for separation.",
          })
        }
      },
    }
  },
}

const isAllowedSemanticLineHeight = (value) =>
  isLiteralString(value) && ["inherit", "tight", "normal", "relaxed"].includes(value.value)

const isPleatTokenReference = (node, key) => {
  if (node.type === "MemberExpression" || node.type === "Identifier") return true
  if (node.type === "Literal") {
    return (
      node.value === "inherit" ||
      (key === "lineHeight" && ["tight", "normal", "relaxed"].includes(node.value))
    )
  }
  if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") {
    return (
      isPleatTokenReference(node.consequent ?? node.left, key) &&
      isPleatTokenReference(node.alternate ?? node.right, key)
    )
  }
  return false
}

const requirePleatTypographyTokens = {
  meta: {
    type: "problem",
    docs: { description: "Use Pleat font size, weight, and line-height tokens." },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        // Theme definitions are the source of the token scales this rule enforces.
        if (context.filename.includes("/src/ui/theme/")) return
        if (node.key.type !== "Identifier") return
        const key = node.key.name
        if (node.value.type === "ObjectExpression") return
        if (key === "lineHeight" && isAllowedSemanticLineHeight(node.value)) return
        if (!["fontSize", "fontWeight", "lineHeight"].includes(key)) return
        if (isPleatTokenReference(node.value, key)) return
        context.report({ node, message: `Use a Pleat typography token for ${key}.` })
      },
    }
  },
}

// Theme files define the scales these rules enforce; config files outside src/ aren't UI.
const isThemeFile = (context) =>
  context.filename.includes("/src/ui/theme/") || !context.filename.includes("/src/")

const propertyName = (node) => {
  if (node.type !== "Property" || node.computed) return undefined
  if (node.key.type === "Identifier") return node.key.name
  if (node.key.type === "Literal" && typeof node.key.value === "string") return node.key.value
  return undefined
}

/** Every string and template piece in a value, so conditionals and templates are checked too. */
const literalTexts = (node) => {
  if (node === null || node === undefined) return []
  if (node.type === "Literal" && typeof node.value === "string") return [node.value]
  if (node.type === "TemplateLiteral") return node.quasis.map((quasi) => quasi.value.raw)
  if (node.type === "ConditionalExpression") {
    return [...literalTexts(node.consequent), ...literalTexts(node.alternate)]
  }
  if (node.type === "LogicalExpression") {
    return [...literalTexts(node.left), ...literalTexts(node.right)]
  }
  return []
}

const spacingProperty =
  /^(padding|margin|gap|rowGap|columnGap|inset|top|right|bottom|left)(Inline|Block)?(Start|End)?$/
// Lengths in rem or px. Font-relative `em`, percentages, `env()` and `var()` stay allowed: they
// follow the text or the platform rather than the spacing scale.
const absoluteLength = /(^|[\s(,])-?\d*\.?\d+(rem|px)\b/

const requirePleatSpaceTokens = {
  meta: {
    type: "problem",
    docs: { description: "Use the `space` scale for padding, margin, gap and inset." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    return {
      Property(node) {
        const key = propertyName(node)
        if (key === undefined || !spacingProperty.test(key)) return
        const offending = literalTexts(node.value).find((text) =>
          absoluteLength.test(text.replace(/(var|env)\([^)]*\)/g, "")),
        )
        if (offending === undefined) return
        context.report({
          node,
          message: `Use a \`space\` token for ${key} instead of "${offending.trim()}".`,
        })
      },
    }
  },
}

const rawColor = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(white|black)\b/

const noRawColors = {
  meta: {
    type: "problem",
    docs: { description: "Colors come from the theme's tone roles, not literals." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    return {
      Property(node) {
        const key = propertyName(node)
        if (key === undefined || !/color|Color|^background$|^fill$|^stroke$/.test(key)) return
        const offending = literalTexts(node.value).find(
          (text) => rawColor.test(text) && !text.includes("url("),
        )
        if (offending === undefined) return
        context.report({
          node,
          message: `Use a theme color for ${key} instead of "${offending.trim()}".`,
        })
      },
    }
  },
}

const noColorMixStrings = {
  meta: {
    type: "problem",
    docs: { description: "Use Pleat's `Color` helpers instead of hand-written color-mix()." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    const inspect = (node, text) => {
      if (text.includes("color-mix(")) {
        context.report({
          node,
          message: "Use Color.alpha or Color.mix instead of a color-mix() string.",
        })
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") inspect(node, node.value)
      },
      TemplateLiteral(node) {
        inspect(node, node.quasis.map((quasi) => quasi.value.raw).join(""))
      },
    }
  },
}

const requireBorderWidthTokens = {
  meta: {
    type: "problem",
    docs: { description: "Use `borderWidth` tokens for borders and outlines." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    return {
      Property(node) {
        const key = propertyName(node)
        if (
          key === undefined ||
          !/^(border|outline)/.test(key) ||
          /Radius|Color|Style$/.test(key)
        ) {
          return
        }
        const offending = literalTexts(node.value).find((text) => /(^|\s)\d*\.?\d+px\b/.test(text))
        if (offending === undefined) return
        context.report({
          node,
          message: `Use a \`borderWidth\` token for ${key} instead of "${offending.trim()}".`,
        })
      },
    }
  },
}

const requireLayerTokens = {
  meta: {
    type: "problem",
    docs: { description: "Use `layer` tokens for z-index." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    return {
      Property(node) {
        if (propertyName(node) !== "zIndex") return
        const value = node.value
        const number =
          value.type === "Literal"
            ? Number(value.value)
            : value.type === "UnaryExpression" && value.argument.type === "Literal"
              ? -Number(value.argument.value)
              : undefined
        // -1 and 0 are relative to the element's own stacking context, not app-wide layers.
        if (number === undefined || number === 0 || number === -1) return
        context.report({ node, message: "Use a `layer` token for zIndex." })
      },
    }
  },
}

const requireBreakpoints = {
  meta: {
    type: "problem",
    docs: { description: "Use `breakpoint` conditions instead of hand-written widths." },
    schema: [],
  },
  create(context) {
    if (isThemeFile(context)) return {}
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type !== "MemberExpression" ||
          callee.object.type !== "Identifier" ||
          callee.object.name !== "When" ||
          callee.property.type !== "Identifier" ||
          !["minWidth", "maxWidth"].includes(callee.property.name)
        ) {
          return
        }
        context.report({ node, message: "Use `breakpoint.sm`, `.md` or `.lg` from the theme." })
      },
    }
  },
}

export default {
  meta: { name: "design-system" },
  rules: {
    "no-utility-class-names": noUtilityClassNames,
    "require-app-text-for-copy-elements": requireAppTextForCopyElements,
    "no-box-shadows": noBoxShadows,
    "require-pleat-typography-tokens": requirePleatTypographyTokens,
    "require-pleat-space-tokens": requirePleatSpaceTokens,
    "no-raw-colors": noRawColors,
    "no-color-mix-strings": noColorMixStrings,
    "require-border-width-tokens": requireBorderWidthTokens,
    "require-layer-tokens": requireLayerTokens,
    "require-breakpoints": requireBreakpoints,
  },
}
