import { AuthContract } from "@yielded/auth";
import { Effect } from "effect";

export const make = AuthContract.make;

export const client = Effect.promise(() => import("@yielded/auth")).pipe(
  Effect.map((modules) => modules.Client),
);
