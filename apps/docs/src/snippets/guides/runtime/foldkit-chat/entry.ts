import { Connection } from "generalist/unstable/foldkit"
import { Layer } from "effect"
import { Socket } from "effect/unstable/socket"
import { makeApplication, run } from "foldkit/runtime"
import { Model, init, subscriptions, update } from "./model"
import { view } from "./view"

const resources = Connection.layerWebSocket({ url: "ws://localhost:4000/ws" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
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
