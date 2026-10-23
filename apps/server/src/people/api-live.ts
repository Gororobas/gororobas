import { assertAuthenticated, GororobasApi, PersonProfileRow } from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { ProfileService } from "../profiles/service.js"
import { completeOnboarding, currentAuthSubjectPersonId } from "./onboarding.js"
import { PeopleService } from "./service.js"

export const PeopleApiLive = HttpApiBuilder.group(GororobasApi, "people", (handlers) =>
  handlers
    .handle("deletePerson", ({ payload }) =>
      PeopleService.use((service) => service.deleteCurrentPerson(payload.confirm)).pipe(
        withApiInfrastructureErrors({ endpoint: "deletePerson", group: "people" }),
      ),
    )
    .handle("setAccessLevel", ({ params, payload }) =>
      PeopleService.use((service) => service.setAccessLevel(params.id, payload.accessLevel)).pipe(
        withApiInfrastructureErrors({ endpoint: "setAccessLevel", group: "people" }),
      ),
    )
    .handle("updateProfile", ({ payload }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        yield* (yield* ProfileService).updateProfile(session.personId, payload)
      }).pipe(withApiInfrastructureErrors({ endpoint: "updateProfile", group: "people" })),
    )
    .handle("getMyProfile", () =>
      Effect.gen(function* () {
        const id = yield* currentAuthSubjectPersonId
        const profile = yield* (yield* ProfilesRepository).findById(id)
        return Option.getOrNull(Option.filter(profile, Schema.is(PersonProfileRow)))
      }).pipe(withApiInfrastructureErrors({ endpoint: "getMyProfile", group: "people" })),
    )
    .handle("completeOnboarding", ({ payload }) =>
      Effect.gen(function* () {
        return yield* completeOnboarding(yield* currentAuthSubjectPersonId, payload)
      }).pipe(withApiInfrastructureErrors({ endpoint: "completeOnboarding", group: "people" })),
    ),
)
