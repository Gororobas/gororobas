/**
 * Moderation HTTP API endpoints.
 */
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { PendingReview } from "./domain.js"

export class ModerationApiGroup extends HttpApiGroup.make("moderation").add(
  HttpApiEndpoint.get("getModerationQueue", "/moderation/queue", {
    success: Schema.Array(PendingReview),
    error: UnauthorizedError,
  }),
) {}
