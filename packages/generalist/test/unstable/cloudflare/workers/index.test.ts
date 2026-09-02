import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Option, Redacted, Schema } from "effect"
import {
  WorkerContext,
  make,
  makeConfigProvider,
  type ExecutionContext,
} from "../../../../src/unstable/cloudflare/workers/index.js"

class PromiseRejected extends Schema.TaggedError<PromiseRejected>()(
  "generalist/unstable/cloudflare/test/PromiseRejected",
  {
    cause: Schema.Defect(),
  },
) {}

const executionContext: ExecutionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
}

describe("Worker", () => {
  it.effect("provides bindings and lifecycle context per request", () =>
    Effect.gen(function* () {
      const waits: Array<Promise<unknown>> = []
      const worker = make<{ readonly TOKEN: string }, never>((request) =>
        Effect.gen(function* () {
          const context = yield* WorkerContext
          context.executionContext.waitUntil(Promise.resolve())
          const bindings = yield* Schema.decodeUnknownEffect(Schema.Struct({ TOKEN: Schema.String }))(
            context.bindings,
          ).pipe(Effect.orDie)
          const token = bindings.TOKEN
          return new Response(`${request.method}:${token}`)
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

  it.effect("owns request scopes through finalization", () =>
    Effect.gen(function* () {
      let finalized = false
      const worker = make<Record<string, never>, never>(() =>
        Effect.acquireRelease(Effect.void, () => Effect.sync(() => void (finalized = true))).pipe(
          Effect.as(new Response("scoped")),
        ),
      )

      const response = yield* Effect.promise(() =>
        worker.fetch(new Request("https://example.test"), {}, executionContext),
      )
      expect(yield* Effect.promise(() => response.text())).toBe("scoped")
      expect(finalized).toBe(true)
    }),
  )

  it.effect("rejects typed failures, defects, and synchronous handler throws", () =>
    Effect.gen(function* () {
      const failure = { _tag: "ExpectedFailure" as const }
      const defect = new Error("effect defect")
      const synchronous = new Error("synchronous defect")
      const request = new Request("https://example.test")
      const rejection = <A>(evaluate: () => Promise<A>) =>
        Effect.tryPromise({ try: evaluate, catch: (cause) => PromiseRejected.make({ cause }) }).pipe(
          Effect.flip,
          Effect.map((error) => error.cause),
        )

      expect(
        yield* rejection(() =>
          make<Record<string, never>, typeof failure>(() => Effect.fail(failure)).fetch(request, {}, executionContext),
        ),
      ).toBe(failure)
      expect(
        yield* rejection(() =>
          make<Record<string, never>, never>(() => Effect.die(defect)).fetch(request, {}, executionContext),
        ),
      ).toBe(defect)
      expect(
        yield* rejection(() =>
          make<Record<string, never>, never>(() => {
            throw synchronous
          }).fetch(request, {}, executionContext),
        ),
      ).toBe(synchronous)
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
