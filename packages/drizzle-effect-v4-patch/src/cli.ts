#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Cause, Console, Effect } from "effect";
import { Command } from "effect/cli";

import { version } from "../package.json";
import { command } from "./internal/command.ts";

Command.run(command(new URL("../patches/", import.meta.url)), { version }).pipe(
  Effect.tapCause((cause) =>
    Effect.gen(function* () {
      for (const reason of cause.reasons) {
        if (Cause.isFailReason(reason) && reason.error._tag === "PatchError")
          yield* Console.error(reason.error.message);
      }
      if (Cause.hasDies(cause))
        yield* Console.error("Unexpected failure while configuring the Drizzle patch.");
    }).pipe(Effect.catchCause(() => Effect.void)),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
