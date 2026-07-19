import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Response } from "effect/unstable/ai"
import { AgentEvent } from "@batonfx/core"
import { coordination } from "../src/session-coordination.js"

describe("session coordination", () => {
  it("transitions idle runs and rejects overlapping work by default", () => {
    const initial = coordination.make(10)
    const [reserved, running] = coordination.reserveRun(initial, false)
    const [busy, unchanged] = coordination.submitRun(running, "second", false, 1)

    expect(reserved._tag).toBe("Reserved")
    expect(running.status).toEqual({ _tag: "Running", turn: 0 })
    expect(running.runId).toBe(1)
    expect(busy._tag).toBe("Busy")
    expect(unchanged).toBe(running)
  })

  it("bounds queued work and drains it FIFO after terminal ownership", () => {
    const [, running] = coordination.reserveRun(coordination.make(0), false)
    const [first, queued] = coordination.submitRun(running, "first queued", true, 1)
    const [full, unchanged] = coordination.submitRun(queued, "overflow", true, 1)
    const [, idle] = coordination.finalizeRun(queued, running.runId, { _tag: "Idle" }, 20)
    const [next, successor] = coordination.reserveNextRun(idle, running.runId)

    expect(first._tag).toBe("Enqueued")
    expect(full._tag).toBe("Full")
    expect(unchanged).toBe(queued)
    expect(Option.getOrThrow(next)[1].prompt).toBe("first queued")
    expect(successor.status).toEqual({ _tag: "Running", turn: 0 })
    expect(successor.runId).toBe(2)
    expect(successor.pendingRuns).toEqual([])
  })

  it("prioritizes approval resume over queued prompts", () => {
    const [, running] = coordination.reserveRun(coordination.make(0), false)
    const [, queued] = coordination.submitRun(running, "ordinary", true, 2)
    const suspension = {
      _tag: "Suspended" as const,
      suspension: AgentEvent.AgentSuspended.make({
        reason: "approval" as const,
        token: "token",
        tool_call_id: "call",
        tool_name: "tool",
        tool_params: {},
        tool_call_batch: [
          Response.makePart("tool-call", { id: "call", name: "tool", params: {}, providerExecuted: false }),
        ],
      }),
    }
    const [, suspended] = coordination.finalizeRun(queued, running.runId, suspension, 10)
    const [ordinary, stillSuspended] = coordination.reserveRun(suspended, false)
    const [approval, resumed] = coordination.reserveRun(suspended, true)

    expect(ordinary._tag).toBe("Busy")
    expect(stillSuspended).toBe(suspended)
    expect(approval._tag).toBe("Reserved")
    expect(resumed.pendingRuns.map((pending) => pending.prompt)).toEqual(["ordinary"])
  })

  it("records pre-fiber interruption and reports queued work on close", () => {
    const [, running] = coordination.reserveRun(coordination.make(0), false)
    const [, queued] = coordination.submitRun(running, "accepted", true, 2)
    const [interrupt, requested] = coordination.interruptRun(queued)
    const ownership = coordination.close(requested)

    expect(interrupt._tag).toBe("Requested")
    expect(requested.interruptRequested).toBe(true)
    expect(Option.isNone(ownership.runFiber)).toBe(true)
    expect(ownership.droppedRuns).toBe(1)
  })
})
