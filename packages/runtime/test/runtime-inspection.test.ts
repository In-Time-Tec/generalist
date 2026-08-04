import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { RunEvent, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, memoryLayer, openWait, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime inspection contracts", (it) => {
  it.effect("exposes canonical snapshot, finite history, list, and structured wait resolution", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:inspection",
        idempotencyKey: "inspection:1",
        prompt: textPrompt("inspect"),
      })
      yield* store.wait({
        ...(yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait("wait:inspection"),
      })
      expect((yield* runtime.inspect(receipt.runId)).wait).toEqual(openWait("wait:inspection"))
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:inspection",
        resolution: { _tag: "ToolResult", result: "accepted", encodedResult: "accepted" },
      })
      const snapshot = yield* runtime.snapshot(receipt.runId)
      expect(snapshot.cursor).toBe(snapshot.run.lastSequence)
      expect(snapshot.run.wait?.resolution?._tag).toBe("ToolResult")
      const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 2 })
      expect(history).toHaveLength(2)
      const listed = yield* runtime.list({ status: "running", limit: 10 })
      expect(listed.map((run) => run.runId)).toContain(receipt.runId)
    }),
  )

  it.effect("rejects an unknown or malformed producer event", () =>
    Effect.sync(() => {
      const malformed = {
        _tag: "RunWaiting",
        specVersion: "1",
        eventId: "run:0",
        runId: "run",
        sequence: 0,
        agent: { id: "agent", version: "1", digest: "digest" },
        rootRunId: "run",
        occurredAt: "2026-08-03T00:00:00.000Z",
        wait: { waitId: "wait" },
      }
      expect(Schema.is(RunEvent.RunEvent)(malformed)).toBe(false)
    }),
  )
})
