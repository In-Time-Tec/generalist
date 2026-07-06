import { Runtime } from "foldkit"

import { ChangedUrl, ClickedLink } from "./app/message"
import { Model, init, subscriptions, update, view } from "./main"

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: (request) => ClickedLink({ request }),
    onUrlChange: (url) => ChangedUrl({ url }),
  },
})

Runtime.run(application)
