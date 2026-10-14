/**
 * Person-related errors.
 */
import { Schema } from "effect"

import { PersonId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { AccountDeletionErrorReason } from "./domain.js"

export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    id: Schema.optional(PersonId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

/** Can't delete an organization when the sol */
export class AccountDeletionError extends Schema.TaggedError<AccountDeletionError>()(
  "AccountDeletionError",
  {
    reason: AccountDeletionErrorReason,
  },
) {}

/** Onboarding needs a signed-in account; visitors have none. */
export class SignInRequiredError extends Schema.TaggedError<SignInRequiredError>()(
  "SignInRequiredError",
  {},
  { httpApiStatus: 401 },
) {}

export class ProfileAlreadyExistsError extends Schema.TaggedError<ProfileAlreadyExistsError>()(
  "ProfileAlreadyExistsError",
  { id: PersonId },
  { httpApiStatus: 409 },
) {}
