import { describe, expect, it } from "@effect/vitest"
import { Cause } from "effect"
import { AgentEvent, RunBudget } from "../../../../src/index.js"
import { make as makeAgentExecutionFailure } from "../../../../src/runtime/execution/agent/failure.js"

const messageFor = <E>(error: E): string => makeAgentExecutionFailure(Cause.fail(error)).message

/**
 * Several agent failures carry no `message` field, so squashing their cause yields an empty string.
 * A terminal run must still state what happened, otherwise every distinct defect reaches the user
 * as the same unactionable sentence and the real cause is unrecoverable from durable state.
 */
describe("terminal agent failure messages", () => {
  it.each([
    {
      name: "DuplicateToolCallId",
      error: AgentEvent.DuplicateToolCallId.make({ id: "toolu_01X", firstIndex: 0, duplicateIndex: 2 }),
      expected: "Model reused tool call id toolu_01X at index 2 after index 0",
    },
    {
      name: "RunEndedWithoutOutput",
      error: AgentEvent.RunEndedWithoutOutput.make({
        turn: 6,
        finishReason: "tool-calls",
        providerTextCharacters: 0,
        reasoningCharacters: 120,
      }),
      expected:
        "Turn 6 ended with no assistant text (finish reason tool-calls, 0 text and 120 reasoning characters streamed)",
    },
    {
      name: "MiddlewareViolation",
      error: AgentEvent.MiddlewareViolation.make({ turn: 6, detail: "ModelMiddleware dropped a tool-call part" }),
      expected: "Model middleware violated the loop contract at turn 6: ModelMiddleware dropped a tool-call part",
    },
    {
      name: "TurnLimitExceeded",
      error: AgentEvent.TurnLimitExceeded.make({
        turn: 81,
        limit: 80,
        pending: [{ tool_call_id: "toolu_1", tool_name: "typescript" }],
      }),
      expected: "Turn limit of 80 reached at turn 81 with typescript(toolu_1)",
    },
    {
      name: "ProgressOverflow",
      error: AgentEvent.ProgressOverflow.make({ turn: 6, toolCallId: "toolu_1", capacity: 64 }),
      expected: "Tool progress queue for call toolu_1 overflowed its capacity of 64 at turn 6",
    },
    {
      name: "ToolNameCollision",
      error: AgentEvent.ToolNameCollision.make({
        name: "typescript",
        origins: [{ _tag: "Static", agent: "rika-root" }],
      }),
      expected: "Tool name typescript is declared by Static",
    },
    {
      name: "Exhausted",
      error: RunBudget.Exhausted.make({ budget: "tokens", requested: 165703, remaining: 43421 }),
      expected: "Run budget exhausted for tokens: requested 165703, remaining 43421",
    },
  ])("states what happened for $name", ({ error, expected }) => {
    expect(messageFor(error)).toBe(expected)
  })

  it("renders every reason of a multi-reason cause instead of discarding them", () => {
    const cause = Cause.fromReasons<AgentEvent.DuplicateToolCallId | AgentEvent.ProgressOverflow>([
      Cause.makeFailReason(AgentEvent.DuplicateToolCallId.make({ id: "a", firstIndex: 0, duplicateIndex: 2 })),
      Cause.makeFailReason(AgentEvent.ProgressOverflow.make({ turn: 1, toolCallId: "b", capacity: 8 })),
    ])
    const message = makeAgentExecutionFailure(cause).message
    expect(message).toContain("Model reused tool call id a")
    expect(message).toContain("Tool progress queue for call b")
  })

  it("keeps the structured budget failure attached for callers that branch on it", () => {
    const error = RunBudget.Exhausted.make({ budget: "tokens", requested: 2, remaining: 1 })
    expect(makeAgentExecutionFailure(Cause.fail(error)).failure).toStrictEqual(error)
  })

  it("never reports a bare defect as the generic phrase", () => {
    const message = makeAgentExecutionFailure(Cause.die(new Error(""))).message
    expect(message).not.toBe("Agent execution failed")
    expect(message.length).toBeGreaterThan("Agent execution failed".length)
  })
})
