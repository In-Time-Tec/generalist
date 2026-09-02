import { Config, Console, Effect, ManagedRuntime, Stream } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"
import { RunClient, Wire } from "generalist/unstable/transport"

const program = Effect.gen(function* () {
  const runId = yield* Config.string("RUN_ID")
  const events = yield* RunClient.streamSSE({ url: `http://localhost:4000/runs/${runId}/events` }).pipe(
    Stream.takeUntil((event) => Wire.isResolvedRunEvent(event) && event._tag === "RunWaiting"),
    Stream.runCollect,
  )
  const waiting = Array.from(events).find((event) => Wire.isResolvedRunEvent(event) && event._tag === "RunWaiting")
  if (waiting === undefined || !Wire.isResolvedRunEvent(waiting) || waiting._tag !== "RunWaiting") {
    return yield* Effect.die("expected the run to emit RunWaiting")
  }
  const response = yield* HttpClient.post(`http://localhost:4000/runs/${runId}/respond`, {
    body: HttpBody.jsonUnsafe({ waitId: waiting.wait.waitId, resolution: { _tag: "Approved" } }),
  })
  yield* Console.log(`approval response: ${response.status}`)
})

const runtime = ManagedRuntime.make(FetchHttpClient.layer)
await runtime.runPromise(program)
await runtime.dispose()
