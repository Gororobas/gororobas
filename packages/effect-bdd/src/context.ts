import { Context, Effect, Schema } from "effect"

import type { ParsedStep } from "./parser/types.js"

export class BackgroundContext extends Context.Service<
  BackgroundContext,
  // oxlint-disable-next-line effect/no-unsafe-dictionary-type -- Background steps can return heterogeneous context, including services; getBackgroundContext validates it with the caller-supplied schema.
  Record<string, unknown>
>()("BackgroundContext") {}

export const getBackgroundContext = <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
) => Effect.flatMap(BackgroundContext, Schema.decodeEffect(schema))

export class ScenarioContext extends Context.Service<
  ScenarioContext,
  {
    readonly name: string
    readonly steps: ReadonlyArray<ParsedStep>
  }
>()("ScenarioContext") {}
