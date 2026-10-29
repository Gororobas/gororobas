import { Schema } from "effect"

/** Keeps the original failure available to diagnostics and Foldkit's model codec. */
export const ClientFailure = Schema.Struct({ cause: Schema.Defect() })
export type ClientFailure = typeof ClientFailure.Type
