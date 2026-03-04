import { GororobasApi, Policies, ProfileNotFoundError } from "@gororobas/domain"
import { Effect, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

import { ProfilesRepository } from "./repository.js"

export const ProfilesApiLive = HttpApiBuilder.group(GororobasApi, "profiles", (handlers) =>
  handlers
    .handle("getProfileByHandle", ({ path }) =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const profile = yield* repo.findByHandle(path.handle).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ProfileNotFoundError({ handle: path.handle })),
              onSome: Effect.succeed,
            }),
          ),
        )

        yield* Policies.profiles.canRead(profile)

        return profile
      }).pipe(
        Effect.catchTags({
          SqlError: () => new HttpApiError.InternalServerError(),
          ParseError: () => new HttpApiError.InternalServerError(),
        }),
      ),
    )
    .handle("handleAvailability", ({ urlParams }) =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository

        return yield* repo
          .isHandleInUse(urlParams.handle)
          .pipe(Effect.catchTag("NoSuchElementException", () => Effect.succeed(false)))
      }).pipe(
        Effect.catchTags({
          SqlError: () => new HttpApiError.InternalServerError(),
          ParseError: () => new HttpApiError.InternalServerError(),
        }),
      ),
    ),
)
