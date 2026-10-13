import { Effect, Schema } from 'effect'
import { LanguageModel } from 'effect/ai'

import { CardSpec } from '../demo/card.ts'

// Ask any provider's model for structured output that matches the
// schema. Its JSON Schema only admits recipe options that already
// have compiled CSS.
export const generateCard = (request: string) =>
  LanguageModel.generateObject({
    objectName: 'Card',
    prompt: `Design one dashboard card for: ${request}`,
    schema: CardSpec,
  }).pipe(Effect.map(response => response.value))

// Output from anywhere else (a stream, a cache, a tool call) is
// decoded the same way.
export const decodeCard = Schema.decodeUnknownEffect(CardSpec)
