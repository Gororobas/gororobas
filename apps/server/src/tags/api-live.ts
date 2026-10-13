import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { findAll } from "./queries.js"

export const TagsApiLive = HttpApiBuilder.group(GororobasApi, "tags", (handlers) =>
  handlers
    .handle("getAllTags", () =>
      findAll().pipe(withApiInfrastructureErrors({ group: "tags", endpoint: "getAllTags" })),
    )
    .handle("createTag", () => Effect.die("stub"))
    .handle("editTag", () => Effect.die("stub")),
)
