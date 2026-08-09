import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { NestedOperation, ToolContext } from "../src/index"

/** Build one context+operations environment in the test's own scope, never at a nested boundary. */
const withEnvironment = <A, E>(
  environment: Layer.Layer<NestedOperation.NestedOperations | ToolContext.ToolContext>,
  effect: Effect.Effect<A, E, NestedOperation.NestedOperations | ToolContext.ToolContext>,
): Effect.Effect<A, E> =>
  Effect.scoped(Effect.flatMap(Layer.build(environment), (context) => effect.pipe(Effect.provideContext(context))))

const toolContext = (operationKey: string): ToolContext.Interface => ({
  signal: new AbortController().signal,
  emit: () => Effect.void,
  sessionId: "session",
  runId: "run-1",
  toolCallId: "call-1",
  operationKey,
})

const contextLayer = (operationKey: string) => ToolContext.layerTest(toolContext(operationKey))

const request = <A>(kind: string, payload: unknown): NestedOperation.Request<A> => ({
  kind,
  payload,
  replayPolicy: "never",
})

describe("NestedOperation identity", () => {
  it("derives one payload digest per kind and payload", () => {
    expect(NestedOperation.payloadDigest("write", { path: "a" })).toBe(
      NestedOperation.payloadDigest("write", { path: "a" }),
    )
    expect(NestedOperation.payloadDigest("write", { path: "a" })).not.toBe(
      NestedOperation.payloadDigest("write", { path: "b" }),
    )
    expect(NestedOperation.payloadDigest("write", { path: "a" })).not.toBe(
      NestedOperation.payloadDigest("read", { path: "a" }),
    )
  })

  it("digests structurally equal payloads written in a different key order alike", () => {
    expect(NestedOperation.payloadDigest("write", { a: 1, b: 2 })).toBe(
      NestedOperation.payloadDigest("write", { b: 2, a: 1 }),
    )
  })

  it("names one nested operation by its outer operation and ordinal", () => {
    expect(NestedOperation.operationId({ operationKey: "op", ordinal: 3 })).toBe("op#3")
  })
})

describe("NestedOperation.layerDirect", () => {
  it.effect("assigns ordinals in call order rather than from caller input", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<Array<string>>([])
      yield* NestedOperation.run(
        request("write", { n: 1 }),
        Ref.update(seen, (all) => [...all, "first"]),
      )
      yield* NestedOperation.run(
        request("write", { n: 2 }),
        Ref.update(seen, (all) => [...all, "second"]),
      )
      expect(yield* Ref.get(seen)).toEqual(["first", "second"])
    }).pipe((effect) => withEnvironment(Layer.mergeAll(NestedOperation.layerDirect, contextLayer("op-order")), effect)),
  )

  it.effect("runs the handler exactly once and returns its value", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)
      const value = yield* NestedOperation.run(
        request("write", { path: "a" }),
        Ref.updateAndGet(calls, (n) => n + 1),
      )
      expect(value).toBe(1)
      expect(yield* Ref.get(calls)).toBe(1)
    }).pipe((effect) => withEnvironment(Layer.mergeAll(NestedOperation.layerDirect, contextLayer("op-once")), effect)),
  )

  it.effect("keeps sibling operation keys on independent ordinal sequences", () =>
    Effect.gen(function* () {
      const operations = yield* NestedOperation.NestedOperations
      const first = yield* operations
        .run(request("write", { n: 1 }), Effect.succeed("a"))
        .pipe(Effect.provideService(ToolContext.ToolContext, toolContext("op-a")))
      const second = yield* operations
        .run(request("write", { n: 1 }), Effect.succeed("b"))
        .pipe(Effect.provideService(ToolContext.ToolContext, toolContext("op-b")))
      expect([first, second]).toEqual(["a", "b"])
    }).pipe((effect) =>
      withEnvironment(Layer.mergeAll(NestedOperation.layerDirect, contextLayer("op-unused")), effect),
    ),
  )

  it.effect("surfaces a handler failure as the handler's own typed error", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        NestedOperation.run(request<never>("write", { path: "a" }), Effect.fail("boom" as const)),
      )
      expect(failure).toBe("boom")
    }).pipe((effect) => withEnvironment(Layer.mergeAll(NestedOperation.layerDirect, contextLayer("op-fail")), effect)),
  )
})

describe("NestedOperation.catchSuspension", () => {
  it.effect("translates an approval suspension into the executor's Suspend outcome", () =>
    Effect.gen(function* () {
      const outcome = yield* NestedOperation.catchSuspension(
        Effect.fail(
          NestedOperation.NestedOperationSuspended.make({
            token: "approval-1",
            operationKey: "op",
            ordinal: 0,
            capability: "write",
          }),
        ),
      )
      expect(outcome).toEqual({ _tag: "Suspend", token: "approval-1" })
    }),
  )

  it.effect("leaves every other failure alone", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(NestedOperation.catchSuspension(Effect.fail("boom" as const)))
      expect(failure).toBe("boom")
    }),
  )
})
