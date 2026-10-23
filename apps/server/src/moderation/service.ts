import {
  NewcomerAwaitingApproval,
  Policies,
  RevisionAwaitingEvaluation,
  type PendingReview,
} from "@gororobas/domain"
import { Array as EffectArray, Context, DateTime, Effect, Order } from "effect"

import { listNewcomersAwaitingApproval, listRevisionsAwaitingEvaluation } from "./queries.js"

const byWaitingTime = Order.mapInput(DateTime.Order, (review: PendingReview) => review.waitingSince)

export class ModerationService extends Context.Service<ModerationService>()("ModerationService", {
  make: Effect.succeed({
    /** Pending reviews the current moderator can resolve, oldest first. */
    listQueue: Effect.gen(function* () {
      yield* Policies.moderation.canViewQueue

      const canApproveNewcomers = yield* Policies.helpers.check(
        Policies.people.canModifyAccessLevel({ from: "NEWCOMER", to: "COMMUNITY" }),
      )
      const canEvaluateRevisions = yield* Policies.helpers.check(Policies.revisions.canEvaluate)

      const newcomers = canApproveNewcomers
        ? (yield* listNewcomersAwaitingApproval()).map((row) => NewcomerAwaitingApproval.make(row))
        : []

      const revisions = canEvaluateRevisions
        ? (yield* listRevisionsAwaitingEvaluation()).map(({ articleStatus, ...row }) =>
            RevisionAwaitingEvaluation.make({
              ...row,
              proposesNewArticle: articleStatus === "PENDING_APPROVAL",
            }),
          )
        : []

      return EffectArray.sort([...newcomers, ...revisions], byWaitingTime)
    }),
  }),
}) {}
