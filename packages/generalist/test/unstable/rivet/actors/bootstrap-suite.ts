import { expect, layer } from "@effect/vitest"
import { Effect, ManagedRuntime, Result } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { actor, setup } from "rivetkit"
import { createClient } from "rivetkit/client"
import { Engine, layer as engineLayer } from "./engine.js"

layer(FetchHttpClient.layer)("native Engine ownership", (it) => {
  it.effect("starts the installed SDK and executes an actor without Generalist host wiring", () =>
    Effect.gen(function* () {
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => ManagedRuntime.make(engineLayer)),
        (acquired) => Effect.promise(() => acquired.dispose()),
      )
      const engine = yield* Effect.promise(() => runtime.runPromise(Engine))
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() =>
          setup({
            ...engine,
            noWelcome: true,
            test: { enabled: true },
            use: { probe: actor({ actions: { ping: () => "pong" } }) },
          }),
        ),
        (acquired) => Effect.promise(() => acquired.shutdown()),
      )
      yield* Effect.promise(() => registry.startAndWait())
      const config = registry.parseConfig()
      const client = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createClient<typeof registry>({
            endpoint: config.endpoint,
            namespace: config.namespace,
            token: config.token,
            poolName: config.envoy.poolName,
            disableMetadataLookup: false,
          }),
        ),
        (acquired) => Effect.promise(() => acquired.dispose()),
      )
      const handle = client.probe.getOrCreate(["sdk-bootstrap"])
      expect(yield* Effect.promise(() => handle.ping())).toBe("pong")
      return engine.endpoint
    }).pipe(
      Effect.scoped,
      Effect.flatMap((endpoint) =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient
          expect(Result.isFailure(yield* Effect.result(client.get(`${endpoint}/health`)))).toBe(true)
        }),
      ),
    ),
  )
})
