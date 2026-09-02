/* oxlint-disable effecttsgo/strict-effect-provide -- each test is a test-host Layer composition root. */
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "../../../../src/index"
import { TestModel } from "../../../../src/testing/index"

const reportedUsage = (inputTokens: number, outputTokens: number) =>
  Response.Usage.make({
    inputTokens: { uncached: inputTokens, total: inputTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
  })

describe("Agent.Inspector", () => {
  it.effect("publishes usage, active tools, turns, elapsed time, and the last event", () => {
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({ query: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    const model = TestModel.layer([
      TestModel.turn([TestModel.toolCall("lookup", { query: "status" }, { id: "lookup-1" })], {
        usage: reportedUsage(3, 2),
      }),
      TestModel.turn([TestModel.text("done")], { usage: reportedUsage(7, 4) }),
    ])

    return Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const handlers = toolkit.toLayer({
        lookup: () =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as("ok")),
      })
      const agent = Agent.make({ name: "inspected", toolkit })
      const program = Effect.gen(function* () {
        const inspector = yield* Agent.Inspector
        const handle = yield* Agent.allocateRun(agent, { prompt: "inspect this" })
        const fiber = yield* handle.events.pipe(Stream.runCollect, Effect.forkScoped)

        yield* Deferred.await(started)
        yield* TestClock.adjust("5 seconds")
        const duringTool = yield* inspector.snapshot(handle.runId)
        expect(duringTool).toMatchObject({
          runId: handle.runId,
          turn: 0,
          usage: { inputTokens: 3, outputTokens: 2 },
          activeTools: ["lookup"],
          elapsed: 5_000,
          lastEvent: { _tag: "ToolExecutionStarted", turn: 0 },
        })

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(fiber)
        const completed = yield* inspector.snapshot(handle.runId)
        expect(completed).toMatchObject({
          runId: handle.runId,
          turn: 1,
          usage: { inputTokens: 10, outputTokens: 6 },
          activeTools: [],
          elapsed: 5_000,
          lastEvent: { _tag: "Completed", turns: 2 },
        })
      }).pipe(Effect.scoped)

      yield* program.pipe(
        Effect.provide(
          Layer.mergeAll(
            model,
            handlers,
            Permissions.layerAllowAll,
            Approvals.layerAutoApprove,
            Agent.Inspector.layerMemory,
          ),
        ),
      )
    })
  })

  it.effect("fails with an actionable message for an unknown process-local Run", () =>
    Effect.gen(function* () {
      const inspector = yield* Agent.Inspector
      const error = yield* Effect.flip(inspector.snapshot("run-missing"))

      expect(error.runId).toBe("run-missing")
      expect(error.hint).toContain("Consume the Agent Run")
      expect(error.message).toContain(error.hint)
    }).pipe(Effect.provide(Agent.Inspector.layerMemory)),
  )
})
