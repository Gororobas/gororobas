import * as AuthContract from "@yielded/auth/AuthContract";
import { Effect } from "effect";

export const make = AuthContract.make;
export const client = Effect.promise(() => import("@yielded/auth/Client"));
