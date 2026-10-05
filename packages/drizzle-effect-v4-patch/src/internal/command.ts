import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";

import { configure } from "./patch.ts";

export const command = (assets: URL) => {
  const root = Command.make("yielded-drizzle-effect").pipe(
    Command.withDescription("Configure a temporary Drizzle compatibility patch for Bun projects"),
    Command.withSharedFlags({
      directory: Flag.String("dir").pipe(
        Flag.withDescription("Bun project or workspace directory"),
        Flag.withDefault("."),
      ),
    }),
  );

  return root.pipe(
    Command.withSubcommands(
      (["patch", "unpatch"] as const).map((action) =>
        Command.make(
          action,
          {},
          Effect.fn(function* () {
            const { directory } = yield* root;
            const result = yield* configure(directory, assets, action);

            yield* Console.log(result);
          }),
        ).pipe(
          Command.withDescription(
            action === "patch"
              ? "Save the verified Drizzle patch and run bun install"
              : "Remove this tool's patch and run bun install",
          ),
        ),
      ),
    ),
  );
};
