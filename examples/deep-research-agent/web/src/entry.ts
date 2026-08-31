import { Connection } from "generalist/foldkit"
import { Layer } from "effect"
import { Socket } from "effect/unstable/socket"
import { makeApplication, run } from "foldkit/runtime"
import { Model, init, subscriptions, update, view } from "./main"

const WS_URL = "ws://localhost:4000/ws"

const resources = Connection.layerWebSocket({ url: WS_URL }).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))

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
