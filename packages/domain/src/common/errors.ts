import { Schema } from "effect"

import { Handle } from "./primitives.js"

export class HandleTakenError extends Schema.TaggedErrorClass<HandleTakenError>()(
  "HandleTakenError",
  {
    handle: Handle,
    entity: Schema.Literals(["profile", "vegetable", "post"]),
  },
  { httpApiStatus: 409 },
) {}
