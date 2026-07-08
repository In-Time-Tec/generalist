import { Connection } from "@batonfx/foldkit"
import { Layer } from "effect"
import { Socket } from "effect/unstable/socket"
import * as Runtime from "foldkit/runtime"
import { Model, init, subscriptions, update } from "./model"
import { view } from "./view"

const resources = Connection.layerWebSocket({ url: "ws://localhost:4000/ws" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
)

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  resources,
  container: document.getElementById("root"),
})

Runtime.run(application)
