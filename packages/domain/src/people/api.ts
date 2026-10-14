import { Schema } from "effect"
/**
 * People HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { PlatformAccessLevel } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { PersonId } from "../common/ids.js"
import { PersonProfileRow, ProfileRowUpdate } from "../profiles/domain.js"
import { AccountDeletionConfirmation, AccountDeletionResult, OnboardingInput } from "./domain.js"
import {
  AccountDeletionError,
  PersonNotFoundError,
  ProfileAlreadyExistsError,
  SignInRequiredError,
} from "./errors.js"

export class PeopleApiGroup extends HttpApiGroup.make("people")
  .add(
    HttpApiEndpoint.post("setAccessLevel", "/people/:id/access-level", {
      success: Schema.Void,
      error: PersonNotFoundError,
      params: Schema.Struct({ id: PersonId }),
      payload: Schema.Struct({ accessLevel: PlatformAccessLevel }),
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePerson", "/people/me", {
      success: AccountDeletionResult,
      error: AccountDeletionError,
      payload: Schema.Struct({ confirm: Schema.optional(AccountDeletionConfirmation) }),
    }),
  )
  .add(
    /** `null` when the signed-in account hasn't completed onboarding yet. */
    HttpApiEndpoint.get("getMyProfile", "/people/me/profile", {
      success: Schema.NullOr(PersonProfileRow),
      error: SignInRequiredError,
    }),
  )
  .add(
    HttpApiEndpoint.post("completeOnboarding", "/people/me/profile", {
      success: PersonProfileRow,
      error: [SignInRequiredError, ProfileAlreadyExistsError],
      payload: OnboardingInput,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateProfile", "/people/me/profile", {
      success: Schema.Void,
      error: [PersonNotFoundError, HandleTakenError],
      payload: ProfileRowUpdate,
    }),
  ) {}
