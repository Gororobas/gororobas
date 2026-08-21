import { Schema } from "effect"

import { Handle } from "./primitives.js"

export class HandleTakenError extends Schema.TaggedError<HandleTakenError>()(
  "HandleTakenError",
  {
    handle: Handle,
    entity: Schema.Literals(["profile", "vegetable", "publication"]),
  },
  { httpApiStatus: 409 },
) {}
