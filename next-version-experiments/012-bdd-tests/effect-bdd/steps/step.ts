import type { Effect, Schema } from 'effect'

export type StepTag = 'Given' | 'When' | 'Then' | 'And' | 'But'

export interface StepConfig<
	Params extends Record<string, unknown>,
	CtxIn,
	CtxOut,
	E,
	R,
> {
	params?: Schema.Schema<Params>
	handler: (ctx: CtxIn, params: Params) => Effect.Effect<CtxOut, E, R>
}

export interface Step<CtxIn, CtxOut, E, R> {
	readonly _tag: StepTag
	readonly pattern: string
	readonly config: StepConfig<Record<string, unknown>, CtxIn, CtxOut, E, R>
}

function createStepConstructor(tag: StepTag) {
	return <Params extends Record<string, unknown>, CtxIn, CtxOut, E, R>(
		pattern: string,
		config: StepConfig<Params, CtxIn, CtxOut, E, R>,
	): Step<CtxIn, CtxOut, E, R> => ({
		_tag: tag,
		pattern,
		config: config as StepConfig<Record<string, unknown>, CtxIn, CtxOut, E, R>,
	})
}

export const Given = createStepConstructor('Given')
export const When = createStepConstructor('When')
export const Then = createStepConstructor('Then')
export const And = createStepConstructor('And')
export const But = createStepConstructor('But')
