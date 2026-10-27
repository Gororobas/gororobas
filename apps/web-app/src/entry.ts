import "./ui/theme/base-styles"
import { Sheet } from "@pleat/core"
import { Effect, Option } from "effect"
import { Program, Runtime } from "foldkit"

import { ApplicationBlock } from "./app/block"
import { ApplicationLayer } from "./services"

Sheet.mount()

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    // Login fragments contain bearer proofs; keep them out of the message history.
    onUrlChange: (url) =>
      // oxlint-disable-next-line foldkit/no-child-message-construction-in-root -- The root's own routing Message, built here to drop the fragment before it is recorded.
      ApplicationBlock.Message.ChangedUrl({ url: { ...url, hash: Option.none() } }),
  },
  devTools: { dispatch: true },
})

Runtime.run(program.provide(ApplicationLayer))

// Development modules are intentionally never cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  Effect.runFork(
    Effect.tryPromise(() => navigator.serviceWorker.register("/service-worker.js")).pipe(
      Effect.catch(() => Effect.logWarning("Offline app shell could not be installed")),
    ),
  )
}
