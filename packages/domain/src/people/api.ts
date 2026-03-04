/**
 * People HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

import { PlatformAccessLevel } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { PersonId } from "../common/ids.js"
import { ProfileRowUpdate } from "../profiles/domain.js"
import { AccountDeletionConfirmation, AccountDeletionResult } from "./domain.js"
import { AccountDeletionError, PersonNotFoundError } from "./errors.js"

export class PeopleApiGroup extends HttpApiGroup.make("people")
  .add(
    HttpApiEndpoint.post("setAccessLevel", "/people/:id/access-level")
      .addSuccess(Schema.Void)
      .addError(PersonNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PersonId }))
      .setPayload(Schema.Struct({ accessLevel: PlatformAccessLevel })),
  )
  .add(
    HttpApiEndpoint.del("deletePerson", "/people/me")
      .addSuccess(AccountDeletionResult)
      .addError(AccountDeletionError)
      .setPayload(Schema.Struct({ confirm: Schema.optional(AccountDeletionConfirmation) })),
  )
  .add(
    HttpApiEndpoint.patch("updateProfile", "/people/me/profile")
      .addSuccess(Schema.Void)
      .addError(PersonNotFoundError, { status: 404 })
      .addError(HandleTakenError, { status: 409 })
      .setPayload(ProfileRowUpdate),
  ) {}
