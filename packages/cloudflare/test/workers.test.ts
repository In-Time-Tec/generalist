import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Option, Redacted } from "effect"
import { WorkerContext, make, makeConfigProvider } from "../src/workers/index.js"

describe("Worker", () => {
  it.effect("provides bindings and lifecycle context per request", () =>
    Effect.gen(function* () {
      const waits: Array<Promise<unknown>> = []
      const worker = make<{ readonly TOKEN: string }, never>((request) =>
        Effect.gen(function* () {
          const context = yield* WorkerContext
          context.executionContext.waitUntil(Promise.resolve())
          return new Response(`${request.method}:${context.bindings.TOKEN}`)
        }),
      )
      const response = yield* Effect.promise(() =>
        worker.fetch(
          new Request("https://example.test", { method: "POST" }),
          { TOKEN: "redacted" },
          { waitUntil: (promise) => void waits.push(promise), passThroughOnException: () => undefined },
        ),
      )

      expect(yield* Effect.promise(() => response.text())).toBe("POST:redacted")
      expect(waits).toHaveLength(1)
    }),
  )

  it.effect("exposes only selected bindings through Effect Config", () => {
    const provider = makeConfigProvider({ TOKEN: "secret", INTERNAL: "hidden" }, ["TOKEN"])
    return Effect.gen(function* () {
      const token = yield* Config.redacted("TOKEN")
      expect(Redacted.value(token)).toBe("secret")
      expect(Option.isNone(yield* Config.option(Config.string("INTERNAL")))).toBe(true)
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
  })
})
