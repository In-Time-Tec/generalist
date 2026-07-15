import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent, TurnPolicy } from "@batonfx/core"
import { Wire } from "../src/index"

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
})

const toolkit = Toolkit.make(echoTool)

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
})

const textDelta = Response.makePart("text-delta", { id: "text", delta: "hello" })

const textPart = Response.makePart("text", { text: "hello" })

const toolCall = Response.makePart("tool-call", {
  id: "call-1",
  name: "echo",
  params: { text: "hello" },
  providerExecuted: false,
})

const toolResult = Response.toolResultPart({
  id: "call-1",
  name: "echo",
  isFailure: false,
  result: "hello",
  encodedResult: "hello",
  providerExecuted: false,
  preliminary: false,
})

const transcript = Prompt.fromMessages([
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "hello" })] }),
])

const eventFrames = (): ReadonlyArray<Wire.ServerFrameType> => [
  { _tag: "Event", seq: 0, event: { _tag: "TurnStarted", turn: 0, metadata: { source: "test" } } },
  { _tag: "Event", seq: 1, event: { _tag: "ModelPart", turn: 0, part: textDelta } },
  { _tag: "Event", seq: 2, event: { _tag: "ToolExecutionStarted", turn: 0, call: toolCall } },
  {
    _tag: "Event",
    seq: 3,
    event: { _tag: "ToolProgress", turn: 0, toolCallId: "call-1", message: "half", data: { pct: 50 } },
  },
  { _tag: "Event", seq: 4, event: { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult } },
  { _tag: "Event", seq: 5, event: { _tag: "ApprovalRequested", turn: 0, call: toolCall } },
  {
    _tag: "Event",
    seq: 6,
    event: { _tag: "TurnCompleted", turn: 0, transcript, usage, finishReason: "stop" },
  },
  { _tag: "Event", seq: 7, event: { _tag: "SteeringDrained", turn: 0, queue: "steering", count: 2 } },
  { _tag: "Event", seq: 8, event: { _tag: "StructuredOutput", turn: 1, value: { ok: true }, content: [textPart] } },
  { _tag: "Event", seq: 9, event: { _tag: "Completed", turns: 1, text: "hello", transcript, usage } },
]

describe("Wire", () => {
  it.effect("strict server frames round-trip every current AgentEvent tag", () =>
    Effect.gen(function* () {
      const schema = Wire.ServerFrame(toolkit)
      for (const frame of eventFrames()) {
        const encoded = yield* Schema.encodeUnknownEffect(schema)(frame)
        const decoded = yield* Schema.decodeUnknownEffect(schema)(encoded)
        expect(decoded._tag).toBe(frame._tag)
        expect(decoded.seq).toBe(frame.seq)
      }
    }),
  )

  it.effect("encodes non-suspension run failures and suspension terminals separately", () =>
    Effect.gen(function* () {
      const schema = Wire.ServerFrame(toolkit)
      const failures: ReadonlyArray<Wire.RunFailure> = [
        AgentEvent.AgentError.make({ message: "boom", turn: 0 }),
        TurnPolicy.TurnPolicyError.make({ message: "policy unavailable", cause: { service: "budget" } }),
        AgentEvent.TurnPolicyStopped.make({
          turn: 2,
          reason: { _tag: "GoalSatisfied" },
          pending: [{ tool_call_id: "call-1", tool_name: "echo" }],
        }),
        AgentEvent.TurnLimitExceeded.make({
          turn: 3,
          limit: 2,
          pending: [{ tool_call_id: "call-1", tool_name: "echo" }],
        }),
        AgentEvent.MiddlewareViolation.make({ turn: 1, detail: "dropped tool-call" }),
      ]

      for (const error of failures) {
        const jsonSchema = Schema.fromJsonString(schema)
        const encoded = yield* Schema.encodeUnknownEffect(jsonSchema)({ _tag: "Failed", seq: 10, error })
        const decoded = yield* Schema.decodeUnknownEffect(jsonSchema)(encoded)
        expect(decoded._tag).toBe("Failed")
      }

      const suspension = AgentEvent.AgentSuspended.make({
        token: "approval-1",
        reason: "approval",
        tool_call_id: "call-1",
        tool_name: "echo",
        tool_params: { text: "hello" },
      })
      const suspended = yield* Schema.decodeUnknownEffect(schema)({ _tag: "Suspended", seq: 11, suspension })
      expect(suspended._tag).toBe("Suspended")
      expect(Option.isNone(Schema.decodeUnknownOption(schema)({ _tag: "Failed", seq: 12, error: suspension }))).toBe(
        true,
      )
    }),
  )

  it("loose frames decode unknown tool names that strict frames reject", () => {
    const unknownToolFrame = {
      _tag: "Event",
      seq: 0,
      event: {
        _tag: "ModelPart",
        turn: 0,
        part: { type: "tool-call", id: "unknown-1", name: "missing", params: { x: 1 }, providerExecuted: false },
      },
    }

    expect(Option.isNone(Schema.decodeUnknownOption(Wire.ServerFrame(toolkit))(unknownToolFrame))).toBe(true)
    const decoded = Schema.decodeUnknownSync(Wire.LooseServerFrame)(unknownToolFrame)
    expect(decoded._tag === "Event" && decoded.event._tag === "ModelPart" && decoded.event.part.type).toBe("tool-call")
  })

  it("accepts stripped transcripts on completed events", () => {
    const schema = Wire.ServerFrame(toolkit)
    const decoded = Schema.decodeUnknownSync(schema)({
      _tag: "Event",
      seq: 0,
      event: { _tag: "Completed", turns: 1, text: "done" },
    })
    expect(decoded._tag === "Event" && decoded.event._tag === "Completed" && decoded.event.transcript).toBeUndefined()
  })
})
