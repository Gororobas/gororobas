import { RestoreSession } from "./command"
import { AuthenticationComposition } from "./composition"
import { Stage } from "./model"

export const init = AuthenticationComposition.makeInit(() => ({
  model: { stage: Stage.Restoring() },
  commands: [RestoreSession()],
}))
