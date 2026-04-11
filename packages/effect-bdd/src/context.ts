import { Context, Effect } from "effect"

import type { ParsedStep } from "./parser/types.js"

export class BackgroundContext extends Context.Service<BackgroundContext, Record<any, any>>()(
  "BackgroundContext",
) {}

export const getBackgroundContext = Effect.fnUntraced(function* <T extends Record<any, any>>() {
  return (yield* BackgroundContext) as T
})

export class ScenarioContext extends Context.Service<
  ScenarioContext,
  {
    readonly name: string
    readonly steps: ReadonlyArray<ParsedStep>
  }
>()("ScenarioContext") {}
