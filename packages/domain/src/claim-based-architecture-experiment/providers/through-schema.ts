import { Result, Schema } from "effect"

import type { ExtractionIssue } from "../extraction.js"

/**
 * Our schema decides what's valid; a provider's value is its encoded side. This is where
 * providers' loosely typed values (strings, numbers) become ours, or an `INVALID_VALUE` issue.
 */
export const throughSchema = <A, E>(
  schema: Schema.Codec<A, E>,
  // oxlint-disable-next-line effect/no-unknown-parameters -- Providers' values are typed by the provider, not by our schemas: this is where they're parsed.
  input: unknown,
): Result.Result<A, ExtractionIssue> =>
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- see `input`.
  Result.mapError(Schema.decodeUnknownResult(schema)(input), (error) => ({
    _tag: "INVALID_VALUE" as const,
    detail: error.message,
  }))
