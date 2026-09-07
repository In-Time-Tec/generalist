import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { makeApplication, run } from "foldkit/runtime"
import { Model, init, subscriptions, update, view } from "./main"
import { layer as connectionLayer } from "./connection"

const SERVER_URL = new URL("/api", location.origin).toString()

const resources = connectionLayer({ baseUrl: SERVER_URL }).pipe(
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

const form = document.getElementById("server-login")
const input = document.getElementById("server-token")
const status = document.getElementById("login-status")
if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement) || status === null) {
  throw new Error("The server login form is missing")
}
const loginRuntime = ManagedRuntime.make(FetchHttpClient.layer)
let authenticating = false
form.addEventListener("submit", (event) => {
  event.preventDefault()
  if (authenticating) return
  authenticating = true
  const token = input.value
  input.value = ""
  status.textContent = "Authenticating…"
  const login = HttpClientRequest.post(`${SERVER_URL}/auth/session`).pipe(
    HttpClientRequest.bearerToken(token),
    HttpClient.execute,
    Effect.map((response) => response.status === 204),
    Effect.orElseSucceed(() => false),
  )
  void loginRuntime
    .runPromise(login)
    .then((authenticated) => {
      if (!authenticated) {
        authenticating = false
        status.textContent = "Authentication failed. Check the server token and try again."
        return
      }
      form.hidden = true
      return loginRuntime.dispose().then(() => run(application))
    })
    .catch(() => {
      authenticating = false
      status.textContent = "Could not connect. Reload the page and try again."
    })
})
