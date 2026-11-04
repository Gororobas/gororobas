import { AuthContract } from "@yielded/auth";
import * as Effect from "effect/Effect";

export const make = AuthContract.make;

export const client = Effect.promise(() => import("@yielded/auth")).pipe(
  Effect.map((modules) => modules.Client),
);
