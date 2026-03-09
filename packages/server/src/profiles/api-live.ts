import { GororobasApi, Policies, ProfileNotFoundError } from "@gororobas/domain"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { ProfilesRepository } from "./repository.js"

export const ProfilesApiLive = HttpApiBuilder.group(GororobasApi, "profiles", (handlers) =>
  handlers
    .handle("getProfileByHandle", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const profile = yield* repo.findByHandle(params.handle).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ProfileNotFoundError({ handle: params.handle })),
              onSome: Effect.succeed,
            }),
          ),
        )

        yield* Policies.profiles.canRead(profile)

        return profile
      }).pipe(
        withApiInfrastructureErrors({
          endpoint: "getProfileByHandle",
          group: "profiles",
        }),
      ),
    )
    .handle("handleAvailability", ({ query }) =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository

        return yield* repo
          .isHandleInUse(query.handle)
          .pipe(Effect.catchTag("NoSuchElementError", () => Effect.succeed(false)))
      }).pipe(
        withApiInfrastructureErrors({
          endpoint: "handleAvailability",
          group: "profiles",
        }),
      ),
    ),
)
