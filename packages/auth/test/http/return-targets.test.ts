import { it } from "@effect/vitest";
import { Email, OAuth } from "@yielded/auth";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as Unify from "effect/Unify";
import { expect } from "vite-plus/test";

// Shared-domain task: exact return authority is independent of cookie/CSRF admission.
const checkReturnTargets = <I, E, Rejected>(
  service: Omit<
    Context.Key<
      I,
      {
        readonly resolve: (input: string) => Effect.Effect<string, Rejected>;
      }
    >,
    typeof Unify.unifySymbol
  > & {
    readonly exactRoutes: (
      routes: ReadonlyArray<string>,
      options?: { readonly trustedOrigins: ReadonlyArray<string> },
    ) => Layer.Layer<I, E>;
  },
) => {
  it.effect(`${service.key} admits only exact routes on explicitly trusted origins`, () =>
    Effect.gen(function* () {
      const resolve = Effect.fnUntraced(
        function* (input: string) {
          const targets = yield* service;

          return yield* targets.resolve(input);
        },
        Effect.provide(
          service.exactRoutes(["/", "https://agent.example.com/browser-use/"], {
            trustedOrigins: ["https://agent.example.com"],
          }),
        ),
      );

      expect(yield* resolve("/")).toBe("/");
      expect(yield* resolve("https://agent.example.com/browser-use/")).toBe(
        "https://agent.example.com/browser-use/",
      );
      for (const target of [
        "https://evil.example.com/browser-use/",
        "https://agent.example.com/browser-use/child",
        "https://agent.example.com/browser-use/?next=https://evil.com",
        "//evil.com/",
        "https://agent.example.com/browser-use/#fragment",
      ]) {
        expect((yield* resolve(target).pipe(Effect.result))._tag).toBe("Failure");
      }
    }),
  );
  it.effect(`${service.key} refuses an untrusted configured return origin`, () =>
    Effect.gen(function* () {
      const result = yield* service.pipe(
        Effect.provide(
          service.exactRoutes(["https://evil.example.com/"], {
            trustedOrigins: ["https://agent.example.com"],
          }),
        ),
        Effect.result,
      );

      expect(result._tag).toBe("Failure");
    }),
  );
};

checkReturnTargets(Email.EmailReturnTargets);
checkReturnTargets(OAuth.OAuthReturnTargets);
