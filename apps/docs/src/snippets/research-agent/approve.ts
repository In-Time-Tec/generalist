import { Console, Effect } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const response = yield* HttpClient.post("http://localhost:4000/runs/research-run-1/respond", {
    body: HttpBody.jsonUnsafe({ waitId: "search-1", resolution: { _tag: "Approved" } }),
  })
  yield* Console.log(`approval response: ${response.status}`)
}).pipe(Effect.provide(FetchHttpClient.layer))

await Effect.runPromise(program)
