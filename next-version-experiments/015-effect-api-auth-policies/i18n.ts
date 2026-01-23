import { Schema } from 'effect'

/** MacroMessageDescriptor from @lingui/core/macro */
export const I18nMessage = Schema.Union(
	Schema.Struct({
		id: Schema.String,
		message: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		id: Schema.optional(Schema.String),
		message: Schema.String,
	}),
	Schema.Struct({
		comment: Schema.optional(Schema.String),
		context: Schema.optional(Schema.String),
	}),
)
export type I18nMessage = typeof I18nMessage.Type
