import { definePlugin, defineRule } from "vite-plus/lint/plugins";

export const noNativeError = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: { description: "Require tagged errors instead of constructing the native Error." },
    messages: {
      nativeError:
        "Use a tagged error (Schema.TaggedError or Data.TaggedError) instead of the native Error constructor.",
    },
  },
  create(context) {
    const inspect = (node: Parameters<typeof context.sourceCode.getScope>[0]) => {
      if (node.type !== "NewExpression" && node.type !== "CallExpression") return;

      const callee = node.callee;

      const identifier =
        callee.type === "Identifier" && callee.name === "Error"
          ? callee
          : callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              ["globalThis", "window", "self", "global"].includes(callee.object.name) &&
              ((!callee.computed &&
                callee.property.type === "Identifier" &&
                callee.property.name === "Error") ||
                (callee.computed &&
                  callee.property.type === "Literal" &&
                  callee.property.value === "Error"))
            ? callee.object
            : undefined;

      if (!identifier) return;

      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(identifier);

      while (scope) {
        const variable = scope.set.get(identifier.name);

        if (variable) {
          if (variable.defs.length > 0) return;

          break;
        }

        scope = scope.upper;
      }

      context.report({ node, messageId: "nativeError" });
    };

    return { NewExpression: inspect, CallExpression: inspect };
  },
});

export const noUntypedThrow = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: { description: "Disallow throw statements from Effect-owned application code." },
    messages: {
      noUntypedThrow:
        "Do not throw from Effect-owned code. Fail with a tagged error in the Effect error channel.",
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({ node, messageId: "noUntypedThrow" });
      },
    };
  },
});

export default definePlugin({
  meta: { name: "yielded-auth-effect" },
  rules: { "no-native-error": noNativeError, "no-untyped-throw": noUntypedThrow },
});
