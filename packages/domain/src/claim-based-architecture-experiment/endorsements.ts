import { Schema } from "effect"

import { PersonId } from "../common/ids.js"
import { TimestampColumn } from "../common/primitives.js"
import { ClaimId } from "./sources.js"

/**
 * A person endorsing a claim someone or something else made, "aye, looks right to me":
 * "Cenoura, estrato alto: 7 pessoas endossam". Lighter than asserting: it isn't reviewed, changes no value and can be withdrawn
 * (deleted). Only people with community access endorse, once per claim, and never a censored
 * claim. It points at a claim rather than a value, so it follows the claim through provider
 * refreshes, which keep claim IDs (see `planProviderRefresh`), and leaves with it when it's gone.
 *
 * Asserting the same value in the edit form is the stronger statement: a person's claim, reviewed,
 * that ranks as theirs and stays if the machine's claim is censored.
 */
export const Endorsement = Schema.Struct({
  claimId: ClaimId,
  personId: PersonId,
  createdAt: TimestampColumn,
})

export type Endorsement = typeof Endorsement.Type
