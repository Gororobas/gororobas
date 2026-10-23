import { GororobasApi } from "@gororobas/domain"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { ModerationService } from "./service.js"

export const ModerationApiLive = HttpApiBuilder.group(GororobasApi, "moderation", (handlers) =>
  handlers.handle("getModerationQueue", () =>
    ModerationService.use((service) => service.listQueue).pipe(
      withApiInfrastructureErrors({ group: "moderation", endpoint: "getModerationQueue" }),
    ),
  ),
)
