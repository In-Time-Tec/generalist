import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { Wire } from "../src/index"

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
})

const toolkit = Toolkit.make(echoTool)

const overlappingTool = Tool.make("overlapping", {
  parameters: Schema.Struct({}),
  success: Schema.FiniteFromString,
  failure: Schema.Finite,
  failureMode: "return",
})

const overlappingToolkit = Toolkit.make(overlappingTool)

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
  const invalidSequences = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1]

  it.each(invalidSequences)("rejects invalid client frame sequence %s", (afterSeq) => {
    expect(
      Option.isNone(Schema.decodeUnknownOption(Wire.ClientFrame)({ _tag: "Attach", sessionId: "session", afterSeq })),
    ).toBe(true)
  })

  it.each(invalidSequences)("rejects invalid server frame sequence %s", (seq) => {
    expect(Option.isNone(Schema.decodeUnknownOption(Wire.ServerFrame(toolkit))({ _tag: "Ended", seq }))).toBe(true)
    expect(Option.isNone(Schema.decodeUnknownOption(Wire.LooseServerFrame)({ _tag: "Ended", seq }))).toBe(true)
  })

  it.each([0, Number.MAX_SAFE_INTEGER])("accepts valid sequence boundary %s", (seq) => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(Wire.ClientFrame)({ _tag: "Attach", sessionId: "session", afterSeq: seq }),
      ),
    ).toEqual({ _tag: "Attach", sessionId: "session", afterSeq: seq })
    expect(Option.getOrUndefined(Schema.decodeUnknownOption(Wire.LooseServerFrame)({ _tag: "Ended", seq }))).toEqual({
      _tag: "Ended",
      seq,
    })
  })

  it("accepts the pre-history sentinel only for snapshot replay boundaries", () => {
    const snapshot = { _tag: "Snapshot" as const, seq: -1, transcript: Prompt.empty }

    expect(Option.getOrUndefined(Schema.decodeUnknownOption(Wire.LooseServerFrame)(snapshot))).toEqual(snapshot)
    expect(Option.isNone(Schema.decodeUnknownOption(Wire.LooseServerFrame)({ _tag: "Ended", seq: -1 }))).toBe(true)
  })

  it.effect("encodes frames lazily and fails with typed wire errors", () =>
    Effect.gen(function* () {
      const codec = Wire.codec(toolkit)
      const invalidServer = { _tag: "Ended" as const, seq: -1 }
      const invalidClient = { _tag: "Attach" as const, sessionId: "session", afterSeq: 1.5 }
      const serverEffect = codec.encodeServer(invalidServer)
      const clientEffect = codec.encodeClient(invalidClient)

      const serverError = yield* Effect.flip(serverEffect)
      const clientError = yield* Effect.flip(clientEffect)

      expect(serverError._tag).toBe("@batonfx/transport/WireEncodeError")
      expect(clientError._tag).toBe("@batonfx/transport/WireEncodeError")
    }),
  )

  it.effect("preserves existing valid client and server JSON", () =>
    Effect.gen(function* () {
      const codec = Wire.codec(toolkit)

      expect(yield* codec.encodeClient({ _tag: "Attach", sessionId: "session", afterSeq: 0 })).toBe(
        '{"_tag":"Attach","sessionId":"session","afterSeq":0}',
      )
      expect(yield* codec.encodeServer({ _tag: "Ended", seq: Number.MAX_SAFE_INTEGER })).toBe(
        `{"_tag":"Ended","seq":${Number.MAX_SAFE_INTEGER}}`,
      )
    }),
  )

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

  it.effect("strict failed tool results use the declared failure encoding when decoded schemas overlap", () =>
    Effect.gen(function* () {
      const schema = Wire.ServerFrame(overlappingToolkit)
      const call = Response.makePart("tool-call", {
        id: "overlap-1",
        name: "overlapping",
        params: {},
        providerExecuted: false,
      })
      const result = Response.toolResultPart({
        id: "overlap-1",
        name: "overlapping",
        isFailure: true,
        result: 409,
        encodedResult: 409,
        providerExecuted: false,
        preliminary: false,
      })
      const frame: Wire.ServerFrameType = {
        _tag: "Event",
        seq: 0,
        event: { _tag: "ToolExecutionCompleted", turn: 0, call, result },
      }

      const encoded = yield* Schema.encodeUnknownEffect(schema)(frame)
      const decoded = yield* Schema.decodeUnknownEffect(schema)(encoded)

      expect(encoded).toMatchObject({ event: { result: { isFailure: true, result: 409 } } })
      expect(decoded).toMatchObject({
        event: { result: { isFailure: true, result: 409, encodedResult: 409 } },
      })
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
        ToolExecutor.FrameworkFailure.make({ stage: "placement", tool: "echo", message: "worker unavailable" }),
      ]

      for (const error of failures) {
        const jsonSchema = Schema.fromJsonString(schema)
        const encoded = yield* Schema.encodeUnknownEffect(jsonSchema)({ _tag: "Failed", seq: 10, error })
        const decoded = yield* Schema.decodeUnknownEffect(jsonSchema)(encoded)
        expect(decoded._tag).toBe("Failed")

        const statusEncoded = yield* Schema.encodeUnknownEffect(schema)({
          _tag: "SessionStatus",
          seq: 11,
          status: { _tag: "Failed", error },
        })
        const statusDecoded = yield* Schema.decodeUnknownEffect(schema)(statusEncoded)
        expect(statusDecoded).toMatchObject({ _tag: "SessionStatus", status: { _tag: "Failed" } })
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

  it("strict frames reject missing tool names and invalid fixed-tool payloads", () => {
    const schema = Wire.ServerFrame(toolkit)
    const invalidEvents = [
      {
        _tag: "ToolExecutionStarted",
        turn: 0,
        call: { type: "tool-call", id: "call-1", params: { text: "hello" } },
      },
      {
        _tag: "ToolExecutionStarted",
        turn: 0,
        call: { type: "tool-call", id: "call-1", name: "echo", params: { text: 1 } },
      },
      {
        _tag: "ToolExecutionCompleted",
        turn: 0,
        call: toolCall,
        result: { ...toolResult, result: 1, encodedResult: 1 },
      },
      {
        _tag: "ToolExecutionCompleted",
        turn: 0,
        call: toolCall,
        result: { ...toolResult, isFailure: true, result: 1, encodedResult: 1 },
      },
    ]

    for (const event of invalidEvents) {
      expect(Option.isNone(Schema.decodeUnknownOption(schema)({ _tag: "Event", seq: 0, event }))).toBe(true)
    }
  })

  it("loose frames retain common event and frame validation", () => {
    const malformed = [
      { _tag: "Event", seq: 0, event: { _tag: "ToolExecutionStarted", turn: 0 } },
      {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionStarted",
          turn: 0,
          call: { type: "tool-call", id: "call-1", params: {} },
        },
      },
      {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: { type: "tool-call", id: "call-1", name: "runtime", params: {} },
          result: { type: "tool-result", id: "call-1", name: "runtime", result: {} },
        },
      },
      { _tag: "Event", seq: -1, event: { _tag: "TurnStarted", turn: 0 } },
      { _tag: "Unknown", seq: 0 },
    ]

    for (const frame of malformed) {
      expect(Option.isNone(Schema.decodeUnknownOption(Wire.LooseServerFrame)(frame))).toBe(true)
    }
  })

  it.effect("selects the runtime-dynamic codec for tools absent from the startup toolkit", () =>
    Effect.gen(function* () {
      const frame: Wire.LooseServerFrameType = {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionStarted",
          turn: 0,
          call: {
            type: "tool-call",
            id: "activate-1",
            name: "activate_skill",
            params: { name: "review" },
            providerExecuted: false,
          },
        },
      }
      const fixedFailure = yield* Wire.codec(Toolkit.empty).encodeServer(frame).pipe(Effect.flip)
      const dynamicJson = yield* Wire.codec({ capability: "runtime-dynamic" }).encodeServer(frame)
      const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Wire.LooseServerFrame))(dynamicJson)

      expect(fixedFailure._tag).toBe("@batonfx/transport/WireEncodeError")
      expect(decoded).toEqual(frame)
    }),
  )

  it.effect("keeps toolkit shorthand fixed when the toolkit has a capability property", () =>
    Effect.gen(function* () {
      const toolkitWithProperty = Object.assign(toolkit, { capability: "runtime-dynamic" as const })
      const frame: Wire.LooseServerFrameType = {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionStarted",
          turn: 0,
          call: { type: "tool-call", id: "runtime-1", name: "runtime", params: {} },
        },
      }
      const shorthandError = yield* Wire.codec(toolkitWithProperty).encodeServer(frame).pipe(Effect.flip)
      const explicitError = yield* Wire.codec({ capability: "fixed", toolkit: toolkitWithProperty })
        .encodeServer(frame)
        .pipe(Effect.flip)

      expect(shorthandError._tag).toBe("@batonfx/transport/WireEncodeError")
      expect(explicitError._tag).toBe("@batonfx/transport/WireEncodeError")
    }),
  )

  it.effect("keeps shorthand and explicit fixed codecs strict for declared failures", () =>
    Effect.gen(function* () {
      const frame: Wire.LooseServerFrameType = {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: toolCall,
          result: { ...toolResult, isFailure: true, result: 1, encodedResult: 1 },
        },
      }
      const shorthandError = yield* Wire.codec(toolkit).encodeServer(frame).pipe(Effect.flip)
      const explicitError = yield* Wire.codec({ capability: "fixed", toolkit }).encodeServer(frame).pipe(Effect.flip)

      expect(shorthandError._tag).toBe("@batonfx/transport/WireEncodeError")
      expect(explicitError._tag).toBe("@batonfx/transport/WireEncodeError")
    }),
  )

  it.effect("keeps runtime-dynamic JSON encoding failures typed", () =>
    Effect.gen(function* () {
      const frame: Wire.LooseServerFrameType = {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ToolExecutionStarted",
          turn: 0,
          call: { type: "tool-call", id: "runtime-1", name: "runtime", params: 1n },
        },
      }
      const error = yield* Wire.codec({ capability: "runtime-dynamic" }).encodeServer(frame).pipe(Effect.flip)

      expect(error._tag).toBe("@batonfx/transport/WireEncodeError")
    }),
  )

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
