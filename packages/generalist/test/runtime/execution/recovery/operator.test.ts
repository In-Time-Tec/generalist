import { describe, expect, it, layer } from "@effect/vitest"
import { Effect } from "effect"
import { explain, verify, type Journal } from "../../../../src/runtime/execution/recovery/operator.js"
import { Runtime } from "../../../../src/runtime/service.js"
import { assistantAddress, memoryLayer } from "../fixtures.js"

const journal = (overrides: Partial<Journal> = {}): Journal => ({
  runId: "run:operator-recovery",
  status: "running",
  lastSequence: 3,
  waits: [],
  operations: [],
  actions: [],
  ...overrides,
})

describe("Recovery decisions", () => {
  it("returns Resume for a consistent journal without obligations", () => {
    expect(explain(journal())).toEqual({
      status: "running",
      decision: { _tag: "Resume" },
      lastSequence: 3,
      obligations: [],
    })
  })

  it("returns RetryOperation for an interrupted replay-safe operation", () => {
    expect(
      explain(
        journal({
          operations: [
            {
              operationId: "op:safe",
              status: "running",
              replay: "safe",
              attempt: 2,
            },
          ],
        }),
      ).decision,
    ).toEqual({ _tag: "RetryOperation", operationId: "op:safe", attempt: 2 })
  })

  it("returns AwaitApproval for an open approval token", () => {
    const token = "runtime-approval:run%3Aoperator-recovery:approval:write"
    expect(
      explain(
        journal({
          status: "waiting",
          waits: [
            {
              waitId: token,
              reason: {
                _tag: "Approval",
                request: {
                  approvalId: token,
                  operation: "write",
                  capability: "write",
                  input: { value: "once" },
                },
              },
              status: "open",
              openedAt: "2026-09-02T00:00:00.000Z",
            },
          ],
        }),
      ).decision,
    ).toEqual({ _tag: "AwaitApproval", token })
  })

  it("returns AwaitBudget with the authoritative suspension dimension", () => {
    expect(
      explain(
        journal({
          status: "waiting",
          suspension: { _tag: "BudgetExhausted", budget: "tokens" },
        }),
      ).decision,
    ).toEqual({ _tag: "AwaitBudget", budget: "tokens" })
  })

  it("returns Unknown before other obligations and Failed for an unrecoverable terminal error", () => {
    const unknown = explain(
      journal({
        status: "needs-resolution",
        operations: [
          {
            operationId: "op:unknown",
            status: "unknown",
            replay: "never",
            attempt: 1,
          },
          {
            operationId: "op:safe",
            status: "running",
            replay: "safe",
            attempt: 1,
          },
        ],
      }),
    )
    expect(unknown.decision).toMatchObject({ _tag: "Unknown", operationId: "op:unknown" })
    expect(unknown.obligations.map((decision) => decision._tag)).toEqual(["Unknown", "RetryOperation"])

    const error = { _tag: "Unrecoverable", message: "failed" }
    expect(explain(journal({ status: "failed", failure: error })).decision).toEqual({ _tag: "Failed", error })
  })

  it("reports projection drift without mutating the decision", () => {
    const result = verify(
      journal({
        status: "running",
        operations: [
          {
            operationId: "op:unknown",
            status: "unknown",
            replay: "never",
            attempt: 1,
          },
        ],
      }),
    )
    expect(result.decision._tag).toBe("Unknown")
    expect(result.drift).toEqual(["Unknown operation requires needs-resolution status, found running"])

    expect(verify(journal({ status: "needs-resolution" })).drift).toEqual([
      "needs-resolution status has no unknown operation",
    ])
  })
})

layer(memoryLayer)("Runtime operator legality", (test) => {
  test.effect("rejects wake and budget extension when the journal has only Resume", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:operator-illegal",
        idempotencyKey: "operator-illegal",
        prompt: "remain resumable",
      })

      const wake = yield* runtime.operator.wake(receipt.runId, "operator:test").pipe(Effect.flip)
      expect(wake).toMatchObject({
        _tag: "generalist/runtime/IllegalOperatorAction",
        runId: receipt.runId,
        decision: { _tag: "Resume" },
        action: "wake",
      })
      const extend = yield* runtime.operator
        .extendBudget(receipt.runId, { tokens: 1 }, "operator:test")
        .pipe(Effect.flip)
      expect(extend).toMatchObject({
        _tag: "generalist/runtime/IllegalOperatorAction",
        runId: receipt.runId,
        decision: { _tag: "Resume" },
        action: "extendBudget",
      })
    }),
  )
})
