import { GororobasApi, PersonProfileRow } from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { completeOnboarding, currentAuthSubjectPersonId } from "./onboarding.js"

export const PeopleApiLive = HttpApiBuilder.group(GororobasApi, "people", (handlers) =>
  handlers
    .handle("deletePerson", () => Effect.die("stub"))
    .handle("setAccessLevel", () => Effect.die("stub"))
    .handle("updateProfile", () => Effect.die("stub"))
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
