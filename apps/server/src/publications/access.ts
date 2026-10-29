import {
  isCensored,
  PersonId,
  Policies,
  PublicationNotFoundError,
  type ModeratedPublicationRow,
} from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"

import type { PeopleRepository } from "../people/repository.js"

/**
 * Censored publications are hidden from every reader but their authors, as if they didn't exist.
 *
 * Otherwise fetches the owner of the publication. If it's a person and they're a NEWCOMER,
 * Policies.publications.canView will ensure publications aren't truly public.
 **/
export const makeAssertCanViewPublication =
  (people: PeopleRepository["Service"]) =>
  (
    publication: Pick<
      ModeratedPublicationRow,
      "id" | "moderationStatus" | "ownerProfileId" | "visibility"
    >,
  ) =>
    Effect.gen(function* () {
      if (isCensored(publication.moderationStatus)) {
        return yield* Policies.publications.canViewCensored(publication).pipe(
          Effect.catchTag("UnauthorizedError", () =>
            Effect.fail(new PublicationNotFoundError({ id: publication.id })),
          ),
          Effect.asVoid,
        )
      }

      const ownerId = yield* Schema.decodeEffect(PersonId)(publication.ownerProfileId)
      const owner = yield* people.findById(ownerId)
      yield* Policies.publications.canView(publication, Option.getOrUndefined(owner)?.accessLevel)
    })
