import { Context, Effect } from "effect"

import type { ParsedStep } from "./parser/types.js"

export class BackgroundContext extends Context.Service<BackgroundContext, Record<any, any>>()(
  "BackgroundContext",
) {}

export function getBackgroundContext<T extends Record<any, any>>(): Effect.Effect<
  T,
  never,
  BackgroundContext
>
export function getBackgroundContext() {
  return BackgroundContext
}

export class ScenarioContext extends Context.Service<
  ScenarioContext,
  {
    readonly name: string
    readonly steps: ReadonlyArray<ParsedStep>
  }
>()("ScenarioContext") {}
