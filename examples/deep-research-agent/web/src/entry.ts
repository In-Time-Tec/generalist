import { Connection } from "generalist/unstable/foldkit"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { makeApplication, run } from "foldkit/runtime"
import { Model, init, subscriptions, update, view } from "./main"

const SERVER_URL = "http://localhost:4000"

const resources = Connection.layerWebSocket({ baseUrl: SERVER_URL }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(FetchHttpClient.layer),
)

const application = makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  resources,
  container: document.getElementById("root"),
})

run(application)
