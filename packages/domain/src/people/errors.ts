/**
 * Person-related errors.
 */
import { Schema } from "effect"

import { PersonId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { AccountDeletionErrorReason } from "./domain.js"

export class PersonNotFoundError extends Schema.TaggedErrorClass<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    id: Schema.optional(PersonId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

/** Can't delete an organization when the sol */
export class AccountDeletionError extends Schema.TaggedErrorClass<AccountDeletionError>()(
  "AccountDeletionError",
  {
    reason: AccountDeletionErrorReason,
  },
) {}
