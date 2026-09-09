import { expect, layer } from "@effect/vitest"
import { Clock, DateTime, Effect } from "effect"
import { TestClock } from "effect/testing"
import { Runtime, RunStore } from "../../../../../src/runtime/index.js"
import { digest } from "../../../../../src/runtime/run/steering.js"
import { assistantAddress, completedResult, objectLayer, suspension, textPrompt } from "../../../execution/fixtures.js"
import { objectWorkerId } from "../../../execution/object.js"

let fixtureId = 0
const setup = Effect.gen(function* () {
  const fixtureKey = String(fixtureId++)
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const parent = yield* runtime.send({
    to: assistantAddress,
    sessionId: `wait:${fixtureKey}`,
    idempotencyKey: `parent:${fixtureKey}`,
    prompt: textPrompt("parent"),
  })
  const child = yield* runtime.spawn({
    parentRunId: parent.runId,
    invocationId: "child",
    selection: "researcher",
    prompt: textPrompt("child"),
  })
  const sibling = yield* runtime.spawn({
    parentRunId: parent.runId,
    invocationId: "sibling",
    selection: "researcher",
    prompt: textPrompt("sibling"),
  })
  const wait = (waitId: string, commandId = waitId, runs = [child.runId], messages = true) =>
    Effect.gen(function* () {
      const claim = yield* store.claimExecution({
        runId: parent.runId,
        commandId: `${parent.runId}:claim:${waitId}`,
        ownerId: objectWorkerId,
      })
      yield* store.suspend({
        ...claim,
        waits: [
          {
            waitId,
            status: "open",
            openedAt: "1970-01-01T00:00:00.000Z",
            reason: {
              _tag: "AwaitEvent",
              filter: { _tag: "Run", runs, messages, commandId },
              deadline: DateTime.formatIso(DateTime.makeUnsafe((yield* Clock.currentTimeMillis) + 1000)),
            },
          },
        ],
        suspension: suspension({ waitId }),
      })
      return (yield* store.loadExecution(parent.runId)).resolutions.find((entry) => entry.waitId === waitId)
    })
  const message = (messageId: string) => {
    const input = {
      runId: parent.runId,
      commandId: `${parent.runId}:${messageId}`,
      idempotencyKey: messageId,
      prompt: textPrompt(messageId),
      policy: "steer" as const,
      from: { runId: child.runId },
    }
    return store.admitSteering({ ...input, digest: digest(input) })
  }
  const completeRun = (runId: string, suffix: string) =>
    Effect.gen(function* () {
      const claim = yield* store.claimExecution({
        runId,
        commandId: `${runId}:claim:${suffix}`,
        ownerId: objectWorkerId,
      })
      yield* store.complete({ ...claim, commandId: `${runId}:complete:${suffix}`, result: completedResult("answer") })
    })
  const complete = completeRun(child.runId, "child")
  return { runtime, store, parent, child, sibling, wait, message, complete, completeRun }
})

layer(objectLayer)("Run-or-message wait", (it) => {
  for (const early of [true, false]) {
    it.effect(`consumes a question exactly once with arrival ${early ? "before" : "after"} registration`, () =>
      Effect.gen(function* () {
        const f = yield* setup
        if (early) yield* f.message("question")
        yield* f.wait("first", "question-wait")
        if (!early) yield* f.message("question")
        const first = (yield* f.store.loadExecution(f.parent.runId)).resolutions.find(
          (entry) => entry.waitId === "first",
        )
        expect(first).toMatchObject({ resolution: { result: { _tag: "Message", cursor: 0 } } })
        expect(
          (yield* f.runtime.history({ runId: f.parent.runId, limit: 100 })).filter(
            (event) => event._tag === "SteeringConsumed",
          ),
        ).toHaveLength(1)
        yield* f.message("question")
        const retry = yield* f.wait("retry", "question-wait")
        expect(retry?.resolution).toEqual(first?.resolution)
        yield* f.wait("second")
        expect((yield* f.runtime.inspect(f.parent.runId)).waits).toMatchObject([{ waitId: "second", status: "open" }])
        expect((yield* f.runtime.inspect(f.child.runId)).status).not.toBe("cancelled")
        yield* f.complete
        expect(
          (yield* f.store.loadExecution(f.parent.runId)).resolutions.find((entry) => entry.waitId === "second"),
        ).toMatchObject({ resolution: { result: { _tag: "RunSettled", runId: f.child.runId } } })
      }),
    )
    it.effect(`settles a selected Run with completion ${early ? "before" : "after"} registration`, () =>
      Effect.gen(function* () {
        const f = yield* setup
        if (early) yield* f.complete
        yield* f.wait("result")
        if (!early) yield* f.complete
        expect((yield* f.store.loadExecution(f.parent.runId)).resolutions).toMatchObject([
          { resolution: { result: { _tag: "RunSettled", runId: f.child.runId } } },
        ])
      }),
    )
  }
  it.effect("times out only the wait and retains the late child result", () =>
    Effect.gen(function* () {
      const f = yield* setup
      yield* f.wait("timeout")
      yield* TestClock.adjust("1 second")
      const [due] = yield* f.store.dueAwaitEvents({ now: yield* Clock.currentTimeMillis, limit: 10 })
      expect(due).toBeDefined()
      yield* f.store.timeoutAwaitEvent({ ...due!, commandId: "timeout" })
      const timedOut = (yield* f.store.loadExecution(f.parent.runId)).resolutions.find(
        (entry) => entry.waitId === "timeout",
      )
      expect(timedOut).toMatchObject({ resolution: { result: { _tag: "Timeout" } } })
      yield* f.wait("timeout-retry", "timeout")
      expect(
        (yield* f.store.loadExecution(f.parent.runId)).resolutions.find((entry) => entry.waitId === "timeout-retry")
          ?.resolution,
      ).toEqual(timedOut?.resolution)
      expect((yield* f.store.loadExecution(f.parent.runId)).resolutions).toHaveLength(2)
      expect((yield* f.runtime.inspect(f.child.runId)).status).not.toBe("cancelled")
      yield* f.complete
      expect((yield* f.wait("late"))?.resolution).toMatchObject({ result: { _tag: "RunSettled" } })
    }),
  )
  it.effect("cancelling the waiting Run closes only its open wait without a wake", () =>
    Effect.gen(function* () {
      const f = yield* setup
      yield* f.wait("cancel")
      yield* f.runtime.cancel({ runId: f.parent.runId, commandId: "cancel-wait", reason: "stop" })
      expect((yield* f.runtime.inspect(f.parent.runId)).waits).toEqual([])
      expect((yield* f.runtime.inspect(f.parent.runId)).status).toBe("cancelled")
      expect(yield* f.message("late-cancelled").pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunTerminal",
      })
      expect((yield* f.runtime.inspect(f.parent.runId)).waits).toEqual([])
    }),
  )
  it.effect("selects the earliest settled Run independent of selector order", () =>
    Effect.gen(function* () {
      const f = yield* setup
      yield* f.completeRun(f.sibling.runId, "first")
      yield* f.wait("ordered", "ordered", [f.child.runId, f.sibling.runId], false)
      expect((yield* f.store.loadExecution(f.parent.runId)).resolutions).toMatchObject([
        { resolution: { result: { _tag: "RunSettled", runId: f.sibling.runId } } },
      ])
    }),
  )
  it.effect("rejects a changed selector after the original command has completed", () =>
    Effect.gen(function* () {
      const f = yield* setup
      yield* f.message("question")
      yield* f.wait("first", "question-wait")
      const error = yield* f.wait("changed", "question-wait", [f.sibling.runId]).pipe(Effect.flip)
      expect(error).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
      expect((yield* f.store.loadExecution(f.parent.runId)).resolutions).toHaveLength(1)
    }),
  )
})
