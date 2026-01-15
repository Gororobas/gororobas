import { Context, Effect } from 'effect'
import type { ParsedStep } from './parser/types'

export class BackgroundContext extends Context.Tag('BackgroundContext')<
	BackgroundContext,
	Record<any, any>
>() {}

/** Generic accessor for typed background context */
export const getBackgroundContext = <
	T extends Record<any, any>,
>(): Effect.Effect<T, never, BackgroundContext> =>
	Effect.map(BackgroundContext, (ctx) => ctx as T)

export class ScenarioContext extends Context.Tag('ScenarioContext')<
	ScenarioContext,
	{
		readonly name: string
		readonly steps: readonly ParsedStep[]
	}
>() {}
