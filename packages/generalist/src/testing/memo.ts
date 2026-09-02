import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, pipe, Ref, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Dependencies, type Store } from "../core/memo/service.js"
import { memoize, pure } from "../core/memo/tool.js"

export interface Options<E = never> {
  readonly layer: Layer.Layer<Store, E, never>
  readonly adjustClock: Effect.Effect<void>
}

const declared = pipe(
  Tool.make("memo_conformance", {
    parameters: Schema.Struct({ query: Schema.String }),
    success: Schema.String,
  }),
  pure({ ttl: "1 hour", dependsOn: ["index"] }),
)

const plain = Tool.make("memo_plain", {
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const invoke = (input: {
  readonly tool?: Tool.Any
  readonly counter: Ref.Ref<number>
  readonly run: string
  readonly operation: string
  readonly tenant?: string
  readonly version?: string
}) =>
  memoize({
    tool: input.tool ?? declared,
    params: { query: "effect" },
    run: input.run,
    operation: input.operation,
    execute: Ref.updateAndGet(input.counter, (count) => count + 1).pipe(
      Effect.map((count) => ({
        _tag: "Success" as const,
        result: `result-${count}`,
        encodedResult: `result-${count}`,
      })),
    ),
  }).pipe(
    Effect.provideService(
      Dependencies,
      Dependencies.of({
        tenant: input.tenant ?? "tenant-a",
        capabilityScope: "search:read",
        version: (name) => Effect.succeed(name === "index" ? (input.version ?? "v1") : ""),
      }),
    ),
  )

const provide = <A, E, LayerError>(options: Options<LayerError>, effect: Effect.Effect<A, E, Store>) =>
  Effect.scoped(
    Layer.build(options.layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
  )

export const memo = <E>(options: Options<E>): void => {
  describe("Generalist Memo conformance", () => {
    it.effect("misses once and hits without dispatch", () =>
      provide(
        options,
        Effect.gen(function* () {
          const counter = yield* Ref.make(0)
          const first = yield* invoke({ counter, run: "run-1", operation: "operation-1" })
          const second = yield* invoke({ counter, run: "run-2", operation: "operation-2" })
          expect(first).not.toHaveProperty("memoized")
          expect(second).toMatchObject({
            result: "result-1",
            memoized: { fromRun: "run-1", fromOperation: "operation-1" },
          })
          expect(yield* Ref.get(counter)).toBe(1)
        }),
      ),
    )

    it.effect("expires entries on the Effect clock", () =>
      provide(
        options,
        Effect.gen(function* () {
          const counter = yield* Ref.make(0)
          yield* invoke({ counter, run: "run-1", operation: "operation-1" })
          yield* options.adjustClock
          const expired = yield* invoke({ counter, run: "run-2", operation: "operation-2" })
          expect(expired).toMatchObject({ _tag: "Success", result: "result-2" })
          expect(yield* Ref.get(counter)).toBe(2)
        }),
      ),
    )

    it.effect("invalidates on dependency version and isolates tenants", () =>
      provide(
        options,
        Effect.gen(function* () {
          const counter = yield* Ref.make(0)
          yield* invoke({ counter, run: "run-1", operation: "operation-1" })
          yield* invoke({ counter, run: "run-2", operation: "operation-2", version: "v2" })
          yield* invoke({ counter, run: "run-3", operation: "operation-3", tenant: "tenant-b" })
          expect(yield* Ref.get(counter)).toBe(3)
        }),
      ),
    )

    it.effect("never caches undeclared tools", () =>
      provide(
        options,
        Effect.gen(function* () {
          const counter = yield* Ref.make(0)
          yield* invoke({ tool: plain, counter, run: "run-1", operation: "operation-1" })
          yield* invoke({ tool: plain, counter, run: "run-2", operation: "operation-2" })
          expect(yield* Ref.get(counter)).toBe(2)
        }),
      ),
    )
  })
}
