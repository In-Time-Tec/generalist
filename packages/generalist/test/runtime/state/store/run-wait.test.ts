import { expect, layer } from "@effect/vitest"
import { Clock, DateTime, Effect } from "effect"
import { TestClock } from "effect/testing"
import { Runtime, RunStore } from "../../../../src/runtime/index.js"
import { digest } from "../../../../src/runtime/run/steering.js"
import { assistantAddress, completedResult, objectLayer, suspension, textPrompt } from "../../execution/fixtures.js"
import { objectWorkerId } from "../../execution/object.js"

let fixtureId = 0
const setup = Effect.gen(function* () {
  const id = String(fixtureId++)
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const parent = yield* runtime.send({
    to: assistantAddress,
    sessionId: `wait:${id}`,
    idempotencyKey: `parent:${id}`,
    prompt: textPrompt("parent"),
  })
  const child = yield* runtime.spawn({
    parentRunId: parent.runId,
    invocationId: "child",
    selection: "researcher",
    prompt: textPrompt("child"),
  })
  const wait = (waitId: string, commandId = waitId) =>
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
              filter: { _tag: "Run", runs: [child.runId], messages: true, commandId },
              deadline: DateTime.formatIso(DateTime.makeUnsafe((yield* Clock.currentTimeMillis) + 1000)),
            },
          },
        ],
        suspension: suspension({ waitId }),
      })
      return (yield* store.loadExecution(parent.runId)).resolutions.find((entry) => entry.waitId === waitId)
    })
  const message = (id: string) => {
    const input = {
      runId: parent.runId,
      commandId: `${parent.runId}:${id}`,
      idempotencyKey: id,
      prompt: textPrompt(id),
      policy: "steer" as const,
      from: { runId: child.runId },
    }
    return store.admitSteering({ ...input, digest: digest(input) })
  }
  const complete = Effect.gen(function* () {
    const claim = yield* store.claimExecution({
      runId: child.runId,
      commandId: `${child.runId}:claim`,
      ownerId: objectWorkerId,
    })
    yield* store.complete({ ...claim, commandId: `${child.runId}:complete`, result: completedResult("answer") })
  })
  return { runtime, store, parent, child, wait, message, complete }
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
      expect((yield* f.store.loadExecution(f.parent.runId)).resolutions).toMatchObject([
        { resolution: { result: { _tag: "Timeout" } } },
      ])
      expect((yield* f.runtime.inspect(f.child.runId)).status).not.toBe("cancelled")
      yield* f.complete
      expect((yield* f.wait("late"))?.resolution).toMatchObject({ result: { _tag: "RunSettled" } })
    }),
  )
})
