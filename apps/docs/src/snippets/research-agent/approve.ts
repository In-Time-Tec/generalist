import { Config, Console, Effect, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const runId = yield* Config.string("RUN_ID")
  const response = yield* HttpClient.post(`http://localhost:4000/runs/${runId}/respond`, {
    body: HttpBody.jsonUnsafe({ waitId: "approval:search-1", resolution: { _tag: "Approved" } }),
  })
  yield* Console.log(`approval response: ${response.status}`)
})

const runtime = ManagedRuntime.make(FetchHttpClient.layer)
await runtime.runPromise(program)
await runtime.dispose()
