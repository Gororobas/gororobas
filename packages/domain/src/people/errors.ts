/**
 * Person-related errors.
 */
import { Schema } from "effect"

import { PersonId } from "../common/ids.js"
import { AccountDeletionErrorReason } from "./domain.js"
import { Handle } from "../common/primitives.js"

export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    id: Schema.optional(PersonId),
    handle: Schema.optional(Handle),
  },
) { }

/** Can't delete an organization when the sol */
export class AccountDeletionError extends Schema.TaggedError<AccountDeletionError>()(
  "AccountDeletionError",
  {
    reason: AccountDeletionErrorReason,
  },
) { }
