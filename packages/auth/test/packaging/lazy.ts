import * as AuthContract from "@yielded/auth/AuthContract";
import * as Effect from "effect/Effect";

export const make = AuthContract.make;
export const client = Effect.promise(() => import("@yielded/auth/Client"));
