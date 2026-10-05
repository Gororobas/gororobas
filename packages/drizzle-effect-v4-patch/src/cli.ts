#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect/cli";

import { version } from "../package.json";
import { command } from "./internal/command.ts";

Command.run(command(new URL("../patches/", import.meta.url)), { version }).pipe(
  Effect.tapError((error) =>
    error._tag === "PatchError" ? Console.error(error.message) : Effect.void,
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
