import { Runtime } from "foldkit"

import { Message, Model, init, resources, subscriptions, update, view } from "./main"

if (window.location.pathname === "/search/profiles") {
  const profileSearch = await import("./profile-search")

  const application = Runtime.makeApplication({
    Model: profileSearch.Model,
    init: profileSearch.init,
    update: profileSearch.update,
    view: profileSearch.view,
    resources: profileSearch.resources,
    subscriptions: profileSearch.subscriptions,
    container: document.getElementById("root"),
    devTools: { Message: profileSearch.Message },
  })

  Runtime.run(application)
} else if (window.location.pathname === "/search/publications") {
  const publicationSearch = await import("./publication-search")

  const application = Runtime.makeApplication({
    Model: publicationSearch.Model,
    init: publicationSearch.init,
    update: publicationSearch.update,
    view: publicationSearch.view,
    resources: publicationSearch.resources,
    subscriptions: publicationSearch.subscriptions,
    container: document.getElementById("root"),
    devTools: { Message: publicationSearch.Message },
  })

  Runtime.run(application)
} else {
  const application = Runtime.makeApplication({
    Model,
    init,
    update,
    view,
    resources,
    subscriptions,
    container: document.getElementById("root"),
    devTools: {
      Message,
    },
  })

  Runtime.run(application)
}
