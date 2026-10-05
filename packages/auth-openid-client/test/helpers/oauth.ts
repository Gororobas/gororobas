import { Effect } from "effect";
import { expect } from "vite-plus/test";

/** Asserts the effect fails with the given tagged error. */
export const expectTag = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
  tag: E["_tag"],
) =>
  Effect.exit(effect).pipe(
    Effect.map((exit) => {
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const tags = exit.cause.reasons.map((reason) =>
          reason._tag === "Fail" ? reason.error._tag : reason._tag,
        );

        expect(tags).toContain(tag);
      }
    }),
  );
