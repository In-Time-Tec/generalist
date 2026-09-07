import { Config, Console, Effect, Layer, ManagedRuntime, Option, Redacted, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Server } from "generalist/server"

const program = Effect.gen(function* () {
  const sessionId = yield* Config.string("SESSION_ID")
  const client = yield* Server.client({ baseUrl: "http://localhost:4000" })
  const approval = yield* client.events.subscribe({ sessionId }).pipe(
    Stream.filter((event) => event._tag === "ApprovalRequested"),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.die("expected the session to emit ApprovalRequested"),
        onSome: Effect.succeed,
      }),
    ),
  )
  if (approval.event._tag !== "ApprovalRequested") {
    return yield* Effect.die("expected an ApprovalRequested Runtime event")
  }

  yield* client.approvals.resolve({
    runId: approval.runId,
    token: approval.event.request.approvalId,
    decision: { _tag: "Approved" },
    operator: "tutorial:human",
  })
  yield* Console.log(`approved ${approval.event.request.capability} for ${approval.runId}`)
})

const authenticatedLayer = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const base = yield* HttpClient.HttpClient
    const token = yield* Config.redacted("GENERALIST_SERVER_TOKEN")
    return base.pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(token))))
  }),
).pipe(Layer.provide(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(authenticatedLayer)
await runtime.runPromise(program)
await runtime.dispose()
