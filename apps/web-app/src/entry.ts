import { Option } from "effect"
import { Runtime } from "foldkit"

import { Message, Model, init, resources, subscriptions, update, view } from "./main"

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  resources,
  subscriptions,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    // Login fragments contain bearer proofs; keep them out of the message history.
    onUrlChange: (url) => Message.ChangedUrl({ url: { ...url, hash: Option.none() } }),
  },
  devTools: { Message },
})

Runtime.run(application)
