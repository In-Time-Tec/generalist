import { Connection } from "@batonfx/foldkit"
import { Layer } from "effect"
import { Socket } from "effect/unstable/socket"
import * as Runtime from "foldkit/runtime"
import { Message, Model, init, subscriptions, update, view } from "./main"

const WS_URL = "ws://localhost:4000/ws"

const resources = Connection.layerWebSocket({ url: WS_URL }).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))

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
