/* oxlint-disable effecttsgo/strict-effect-provide -- test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option, pipe, Ref, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Memo, ModelMiddleware, Permissions } from "../../src/index.js"
import { TestModel } from "../../src/testing/index.js"

const TOOL = "memo_store_failure_search"

const Search = pipe(
  Tool.make(TOOL, {
    parameters: Schema.Struct({ query: Schema.String }),
    success: Schema.String,
  }),
  Memo.pure({ ttl: "1 hour" }),
)

const failingStore = (mode: "get" | "put", reads: Ref.Ref<number>, writes: Ref.Ref<number>): Layer.Layer<Memo.Store> =>
  Layer.succeed(
    Memo.Store,
    Memo.Store.of({
      modelsEnabled: false,
      get: (key) =>
        Ref.updateAndGet(reads, (count) => count + 1).pipe(
          Effect.flatMap(() =>
            mode === "get"
              ? Effect.fail(Memo.MemoError.make({ operation: "get", key, message: "store unavailable" }))
              : Effect.succeed(Option.none()),
          ),
        ),
      put: (key) =>
        Ref.updateAndGet(writes, (count) => count + 1).pipe(
          Effect.flatMap(() =>
            mode === "put"
              ? Effect.fail(Memo.MemoError.make({ operation: "put", key, message: "store unavailable" }))
              : Effect.void,
          ),
        ),
    }),
  )

const probe = (mode: "get" | "put") =>
  Effect.gen(function* () {
    const dispatches = yield* Ref.make(0)
    const reads = yield* Ref.make(0)
    const writes = yield* Ref.make(0)
    const fixture = yield* TestModel.make([
      TestModel.toolCall(TOOL, { query: "effect" }, { id: "call-1" }),
      TestModel.text("done"),
    ])
    const toolkit = Toolkit.make(Search)
    const agent = Agent.make({ name: `memo-store-failure-${mode}`, toolkit, model: fixture.selection })
    const exit = yield* Agent.stream(agent, "call the tool").pipe(
      Stream.runCollect,
      Effect.provide(
        Layer.mergeAll(
          fixture.registryLayer,
          toolkit.toLayer({
            [TOOL]: () => Ref.update(dispatches, (count) => count + 1).pipe(Effect.as("result")),
          }),
          Memo.layerDependencies({ tenant: "failure-test", capabilityScope: "search:read", versions: {} }),
          failingStore(mode, reads, writes),
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
      ),
      Effect.exit,
    )
    const events = Exit.isSuccess(exit) ? Array.from(exit.value) : []
    const completed = events.find((event) => event._tag === "Completed")
    const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
    return {
      status: Exit.isSuccess(exit) ? ("success" as const) : ("failure" as const),
      failure: Exit.isFailure(exit) ? String(exit.cause.reasons[0]) : null,
      dispatches: yield* Ref.get(dispatches),
      reads: yield* Ref.get(reads),
      writes: yield* Ref.get(writes),
      output: completed?._tag === "Completed" ? completed.output : undefined,
      toolCompleted,
    }
  })

it.effect("treats a failed memo store read as a miss and dispatches live", () =>
  Effect.gen(function* () {
    const result = yield* probe("get")
    expect(result.status).toBe("success")
    expect(result.failure).toBeNull()
    expect(result.dispatches).toBe(1)
    expect(result.reads).toBe(1)
    expect(result.writes).toBe(1)
    expect(result.output).toBe("done")
    expect(result.toolCompleted).toMatchObject({ result: { result: "result", isFailure: false } })
    expect(result.toolCompleted).not.toHaveProperty("result.memoized")
  }),
)

it.effect("returns the live result when the memo store write fails", () =>
  Effect.gen(function* () {
    const result = yield* probe("put")
    expect(result.status).toBe("success")
    expect(result.failure).toBeNull()
    expect(result.dispatches).toBe(1)
    expect(result.reads).toBe(1)
    expect(result.writes).toBe(1)
    expect(result.output).toBe("done")
    expect(result.toolCompleted).toMatchObject({ result: { result: "result", isFailure: false } })
    expect(result.toolCompleted).not.toHaveProperty("result.memoized")
  }),
)
