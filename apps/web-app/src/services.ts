import { Layer } from "effect"

import * as ApiClient from "./api-client"
import { AuthenticationClient, sessionAccessLayer } from "./session-access"

export const ApplicationLayer = Layer.mergeAll(
  ApiClient.resources,
  AuthenticationClient.layerFetch.pipe(Layer.orDie),
  sessionAccessLayer,
)
