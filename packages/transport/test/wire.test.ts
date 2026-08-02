import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Option, Schema, SchemaTransformation } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent, ModelTelemetry, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { Wire } from "../src/index"

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
})

const toolkit = Toolkit.make(echoTool)

class WirePrefix extends Context.Service<WirePrefix, string>()("@batonfx/transport/test/WirePrefix") {}
const requiresPrefix = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transformOrFail({
      decode: (value) =>
        Effect.gen(function* () {
          const prefix = yield* WirePrefix
          return value + prefix
        }),
      encode: (value) => Effect.succeed(value),
    }),
  ),
)

const decodeFixedOption = (activeToolkit: Toolkit.Any, frame: unknown) => {
  const exit = Effect.runSyncExit(Wire.codec(activeToolkit).decodeServer(JSON.stringify(frame)))
  return Exit.isSuccess(exit) ? Option.some(exit.value) : Option.none()
}

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

const eventFrames = (): ReadonlyArray<Wire.ServerFrameType<typeof toolkit>> => [
  { _tag: "Event", seq: 0, event: { _tag: "TurnStarted", turn: 0, metadata: { source: "test" } } },
  {
    _tag: "Event",
    seq: 1,
    event: {
      _tag: "ModelPart",
      turn: 0,
      modelCallId: "model-call-0",
      modelAttemptId: "model-attempt-0",
      attempt: 0,
      part: textDelta,
    },
  },
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
  {
    _tag: "Event",
    seq: 8,
    event: {
      _tag: "StructuredOutput",
      turn: 1,
      modelCallId: "model-call-1",
      modelAttemptId: "model-attempt-1",
      attempt: 0,
      value: { ok: true },
      content: [textPart],
    },
  },
  { _tag: "Event", seq: 9, event: { _tag: "Completed", turns: 1, text: "hello", transcript, usage } },
  ...telemetryFrames(),
]

const withDeliveryId = <Event extends ModelTelemetry.EventPayload>(
  event: Event,
  deliveryId: string,
): Event & { readonly deliveryId: string } => ({ ...event, deliveryId })

const telemetryFrames = (): ReadonlyArray<Wire.ServerFrameType<typeof toolkit>> => {
  const frames = [
    {
      _tag: "Event",
      seq: 10,
      event: {
        _tag: "ModelCallStarted",
        turn: 0,
        modelCallId: "model-call-0",
        purpose: "conversation",
        provider: "test-provider",
        model: "test-model",
        startedAt: 1,
      },
    },
    {
      _tag: "Event",
      seq: 11,
      event: {
        _tag: "ModelAttemptStarted",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-0",
        attempt: 0,
        startedAt: 2,
      },
    },
    {
      _tag: "Event",
      seq: 12,
      event: {
        _tag: "ModelAttemptFirstOutput",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-0",
        attempt: 0,
        kind: "text",
        at: 3,
      },
    },
    {
      _tag: "Event",
      seq: 13,
      event: {
        _tag: "ModelAttemptFailed",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-0",
        attempt: 0,
        failedAt: 4,
        category: "rate-limit",
        classification: "transient",
      },
    },
    {
      _tag: "Event",
      seq: 14,
      event: {
        _tag: "ModelRetryScheduled",
        turn: 0,
        modelCallId: "model-call-0",
        attempt: 0,
        reason: "provider-resilience",
        category: "rate-limit",
        delayMillis: 250,
        at: 5,
      },
    },
    {
      _tag: "Event",
      seq: 15,
      event: {
        _tag: "ModelAttemptCompleted",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-1",
        attempt: 1,
        completedAt: 6,
        usage,
        usageAt: 6,
        finishReason: "stop",
        requestId: "req-1",
        responseModel: "returned-model",
        serviceTier: "default",
        cost: { amount: 0.25, currency: "USD" },
      },
    },
    {
      _tag: "Event",
      seq: 16,
      event: {
        _tag: "ModelCallCompleted",
        turn: 0,
        modelCallId: "model-call-0",
        purpose: "conversation",
        attempts: 2,
        completedAt: 7,
        usage,
        finishReason: "stop",
      },
    },
    {
      _tag: "Event",
      seq: 17,
      event: {
        _tag: "ModelCallFailed",
        turn: 0,
        modelCallId: "model-call-1",
        purpose: "structured-output",
        attempts: 1,
        failedAt: 8,
        category: "authentication",
        classification: "terminal",
      },
    },
    {
      _tag: "Event",
      seq: 18,
      event: {
        _tag: "CompactionStarted",
        turn: 1,
        compactionId: "compaction-0",
        trigger: "threshold",
        startedAt: 9,
        contextTokensBefore: 120,
        entriesBefore: 4,
      },
    },
    {
      _tag: "Event",
      seq: 19,
      event: {
        _tag: "CompactionCompleted",
        turn: 1,
        compactionId: "compaction-0",
        kind: "summarize",
        completedAt: 10,
      },
    },
    {
      _tag: "Event",
      seq: 20,
      event: { _tag: "CompactionFailed", turn: 1, compactionId: "compaction-1", failedAt: 11 },
    },
  ] satisfies ReadonlyArray<{
    readonly _tag: "Event"
    readonly seq: number
    readonly event: ModelTelemetry.EventPayload
  }>
  return Array.from(frames, (frame, index) => ({
    ...frame,
    event: withDeliveryId(frame.event, `run:${index}`),
  }))
}

describe("Wire", () => {
  it("keeps loose frames out of fixed codec inputs", () => {
    const fixed = Wire.codec(toolkit)
    const loose = {} as Wire.LooseServerFrameType
    // @ts-expect-error Fixed codecs accept only frames typed for their concrete toolkit.
    fixed.encodeServer(loose)
  })

  const invalidSequences = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1]

  it.each(invalidSequences)("rejects invalid client frame sequence %s", (afterSeq) => {
    expect(
      Option.isNone(Schema.decodeUnknownOption(Wire.ClientFrame)({ _tag: "Attach", sessionId: "session", afterSeq })),
    ).toBe(true)
  })

  it.each(invalidSequences)("rejects invalid server frame sequence %s", (seq) => {
    expect(Option.isNone(decodeFixedOption(toolkit, { _tag: "Ended", seq }))).toBe(true)
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

      expect(serverError._tag).toBe("@batonfx/transport/WireEncodeFailed")
      expect(clientError._tag).toBe("@batonfx/transport/WireEncodeFailed")
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
      const codec = Wire.codec(toolkit)
      for (const frame of eventFrames()) {
        const encoded = yield* codec.encodeServer(frame)
        const decoded = yield* codec.decodeServer(encoded)
        expect(decoded._tag).toBe(frame._tag)
        expect(decoded.seq).toBe(frame.seq)
      }
    }),
  )

  it.effect("model telemetry events round-trip losslessly on strict and loose frames", () =>
    Effect.gen(function* () {
      const fixedCodec = Wire.codec(toolkit)
      for (const frame of telemetryFrames()) {
        const encoded = yield* fixedCodec.encodeServer(frame)
        const decoded = yield* fixedCodec.decodeServer(encoded)
        expect(decoded).toEqual(frame)
        const looseEncoded = yield* Schema.encodeUnknownEffect(Schema.fromJsonString(Wire.LooseServerFrame))(frame)
        const looseDecoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Wire.LooseServerFrame))(
          looseEncoded,
        )
        expect(looseDecoded).toEqual(frame)
      }
    }),
  )

  it.effect("model telemetry events keep absent optional metadata absent across the wire", () =>
    Effect.gen(function* () {
      const codec = Wire.codec(toolkit)
      const frame: Wire.ServerFrameType<typeof toolkit> = {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ModelAttemptCompleted",
          deliveryId: "run:0",
          turn: 0,
          modelCallId: "model-call-0",
          modelAttemptId: "model-attempt-0",
          attempt: 0,
          completedAt: 1,
          usage,
          usageAt: 1,
          finishReason: "stop",
        },
      }
      const encoded = yield* codec.encodeServer(frame)
      const decoded = yield* codec.decodeServer(encoded)
      expect(decoded).toEqual(frame)
      expect(decoded._tag === "Event" && "requestId" in decoded.event).toBe(false)
      expect(decoded._tag === "Event" && "cost" in decoded.event).toBe(false)
    }),
  )

  it.effect("strict failed tool results use the declared failure encoding when decoded schemas overlap", () =>
    Effect.gen(function* () {
      const codec = Wire.codec(overlappingToolkit)
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
      const frame: Wire.ServerFrameType<typeof overlappingToolkit> = {
        _tag: "Event",
        seq: 0,
        event: { _tag: "ToolExecutionCompleted", turn: 0, call, result },
      }

      const encoded = yield* codec.encodeServer(frame)
      const decoded = yield* codec.decodeServer(encoded)

      expect(JSON.parse(encoded)).toMatchObject({ event: { result: { isFailure: true, result: 409 } } })
      expect(decoded).toMatchObject({
        event: { result: { isFailure: true, result: 409, encodedResult: 409 } },
      })
    }),
  )

  it.effect("encodes non-suspension run failures and suspension terminals separately", () =>
    Effect.gen(function* () {
      const codec = Wire.codec(toolkit)
      const failures: ReadonlyArray<Wire.RunFailure> = [
        AgentEvent.AgentError.make({ message: "boom", turn: 0 }),
        AgentEvent.ResumeMismatch.make({
          reason: "checkpoint-not-found",
          received: AgentEvent.AgentSuspended.make({
            token: "stale",
            reason: "approval",
            tool_call_id: "call-1",
            tool_name: "echo",
            tool_params: { text: "hello" },
            tool_call_batch: [
              Response.makePart("tool-call", {
                id: "call-1",
                name: "echo",
                params: { text: "hello" },
                providerExecuted: false,
              }),
            ],
          }),
        }),
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
        const encoded = yield* codec.encodeServer({ _tag: "Failed", seq: 10, error })
        const decoded = yield* codec.decodeServer(encoded)
        expect(decoded._tag).toBe("Failed")

        const statusEncoded = yield* codec.encodeServer({
          _tag: "SessionStatus",
          seq: 11,
          status: { _tag: "Failed", error },
        })
        const statusDecoded = yield* codec.decodeServer(statusEncoded)
        expect(statusDecoded).toMatchObject({ _tag: "SessionStatus", status: { _tag: "Failed" } })
      }

      const suspension = AgentEvent.AgentSuspended.make({
        token: "approval-1",
        reason: "approval",
        tool_call_id: "call-1",
        tool_name: "echo",
        tool_params: { text: "hello" },
        tool_call_batch: [
          Response.makePart("tool-call", {
            id: "call-1",
            name: "echo",
            params: { text: "hello" },
            providerExecuted: false,
          }),
        ],
      })
      const suspendedEncoded = yield* codec.encodeServer({ _tag: "Suspended", seq: 11, suspension })
      const suspended = yield* codec.decodeServer(suspendedEncoded)
      expect(suspended._tag).toBe("Suspended")
      expect(
        Exit.isFailure(
          Effect.runSyncExit(codec.decodeServer(JSON.stringify({ _tag: "Failed", seq: 12, error: suspension }))),
        ),
      ).toBe(true)
    }),
  )

  it("loose frames decode unknown tool names that strict frames reject", () => {
    const unknownToolFrame = {
      _tag: "Event",
      seq: 0,
      event: {
        _tag: "ModelPart",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-0",
        attempt: 0,
        part: { type: "tool-call", id: "unknown-1", name: "missing", params: { x: 1 }, providerExecuted: false },
      },
    }

    expect(Option.isNone(decodeFixedOption(toolkit, unknownToolFrame))).toBe(true)
    const decoded = Schema.decodeUnknownSync(Wire.LooseServerFrame)(unknownToolFrame)
    expect(
      decoded._tag === "Event" &&
        decoded.event._tag === "ModelPart" &&
        typeof decoded.event.part === "object" &&
        decoded.event.part !== null &&
        "type" in decoded.event.part &&
        decoded.event.part.type,
    ).toBe("tool-call")
  })

  it("strict frames reject missing tool names and invalid fixed-tool payloads", () => {
    const codec = Wire.codec(toolkit)
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
      expect(
        Exit.isFailure(Effect.runSyncExit(codec.decodeServer(JSON.stringify({ _tag: "Event", seq: 0, event })))),
      ).toBe(true)
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
      const fixedFailure = yield* Wire.codec(Toolkit.empty)
        .encodeServer(frame as never)
        .pipe(Effect.flip)
      const dynamicJson = yield* Wire.codec({ capability: "runtime-dynamic" }).encodeServer(frame)
      const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Wire.LooseServerFrame))(dynamicJson)

      expect(fixedFailure._tag).toBe("@batonfx/transport/WireEncodeFailed")
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
      const shorthandError = yield* Wire.codec(toolkitWithProperty)
        .encodeServer(frame as never)
        .pipe(Effect.flip)
      const explicitError = yield* Wire.codec({ capability: "fixed", toolkit: toolkitWithProperty })
        .encodeServer(frame as never)
        .pipe(Effect.flip)

      expect(shorthandError._tag).toBe("@batonfx/transport/WireEncodeFailed")
      expect(explicitError._tag).toBe("@batonfx/transport/WireEncodeFailed")
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
      const shorthandError = yield* Wire.codec(toolkit)
        .encodeServer(frame as never)
        .pipe(Effect.flip)
      const explicitError = yield* Wire.codec({ capability: "fixed", toolkit })
        .encodeServer(frame as never)
        .pipe(Effect.flip)

      expect(shorthandError._tag).toBe("@batonfx/transport/WireEncodeFailed")
      expect(explicitError._tag).toBe("@batonfx/transport/WireEncodeFailed")
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

      expect(error._tag).toBe("@batonfx/transport/WireEncodeFailed")
    }),
  )

  it("accepts stripped transcripts on completed events", () => {
    const codec = Wire.codec(toolkit)
    const decoded = Effect.runSync(
      codec.decodeServer(
        JSON.stringify({
          _tag: "Event",
          seq: 0,
          event: { _tag: "Completed", turns: 1, text: "done" },
        }),
      ),
    )
    expect(decoded._tag === "Event" && decoded.event._tag === "Completed" && decoded.event.transcript).toBeUndefined()
  })

  it("keeps standard validation strict in runtime-dynamic mode", () => {
    const codec = Wire.codec({ capability: "runtime-dynamic" })
    const probes = [
      {
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ModelPart",
          turn: 0,
          modelCallId: "model-call-0",
          modelAttemptId: "model-attempt-0",
          attempt: 0,
          part: { type: "not-a-response-part" },
        },
      },
      { _tag: "Failed", seq: 0, error: { _tag: "NotAFrameworkError" } },
      { _tag: "Suspended", seq: 0, suspension: { _tag: "NotASuspension" } },
      { _tag: "SessionStatus", seq: 0, status: { _tag: "Failed", error: { _tag: "NotAFrameworkError" } } },
    ]

    for (const probe of probes) {
      expect(Exit.isFailure(Effect.runSyncExit(codec.decodeServer(JSON.stringify(probe))))).toBe(true)
    }
  })

  it("exposes strict public schemas backed by branch dispatch", () => {
    const unknownToolEvent = {
      _tag: "ModelPart",
      turn: 0,
      modelCallId: "model-call-0",
      modelAttemptId: "model-attempt-0",
      attempt: 0,
      part: { type: "tool-call", id: "call-0", name: "unknown", params: {} },
    }
    const dynamicEvent = Effect.runSyncExit(Schema.decodeUnknownEffect(Wire.EventSchema(toolkit))(unknownToolEvent))
    expect(Schema.is(Wire.EventSchema(toolkit))(unknownToolEvent)).toBe(false)
    const inheritedToolEvents = [
      {
        ...unknownToolEvent,
        part: { type: "tool-call", id: "call-inherited", name: "toString", params: {} },
      },
      {
        ...unknownToolEvent,
        part: { type: "tool-result", id: "result-inherited", name: "toString", result: {}, isFailure: false },
      },
    ]
    for (const event of inheritedToolEvents) expect(Schema.is(Wire.EventSchema(toolkit))(event)).toBe(false)
    const invalidFixedEvents = [
      {
        _tag: "ToolExecutionStarted",
        turn: 0,
        call: { type: "tool-call", id: "call-0", name: "echo", params: { text: 1 } },
      },
      {
        _tag: "ApprovalRequested",
        turn: 0,
        call: { type: "tool-call", id: "call-0", name: "echo", params: { text: 1 } },
      },
      {
        _tag: "ToolExecutionCompleted",
        turn: 0,
        call: toolCall,
        result: { ...toolResult, result: 1 },
      },
      {
        _tag: "ModelPart",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "model-attempt-0",
        attempt: 0,
        part: { ...toolCall, params: { text: 1 } },
      },
    ]
    for (const event of invalidFixedEvents) expect(Schema.is(Wire.EventSchema(toolkit))(event)).toBe(false)
    expect(Exit.isFailure(dynamicEvent)).toBe(true)
    const dynamicToolEvent = Effect.runSyncExit(Schema.decodeUnknownEffect(Wire.LooseEventSchema)(unknownToolEvent))
    expect(Schema.is(Wire.LooseEventSchema)({ _tag: "Bogus" })).toBe(false)
    expect(Exit.isSuccess(dynamicToolEvent)).toBe(true)
    const malformedFrame = Effect.runSyncExit(
      Schema.decodeUnknownEffect(Wire.LooseServerFrame)({
        _tag: "Event",
        seq: -1,
        event: { _tag: "TurnStarted", turn: 0 },
      }),
    )
    expect(Exit.isFailure(malformedFrame)).toBe(true)
  })

  it.effect("preserves tool schema services in the fixed codec requirement", () =>
    Effect.gen(function* () {
      const serviceTool = Tool.make("service-tool", {
        parameters: Schema.Struct({ value: requiresPrefix }),
        success: Schema.String,
        failure: Schema.String,
        failureMode: "return",
      })
      const serviceCodec = Wire.codec(Toolkit.make(serviceTool))
      const json = JSON.stringify({
        _tag: "Event",
        seq: 0,
        event: {
          _tag: "ModelPart",
          turn: 0,
          modelCallId: "model-call-0",
          modelAttemptId: "model-attempt-0",
          attempt: 0,
          part: {
            type: "tool-call",
            id: "call-0",
            name: "service-tool",
            params: { value: "value" },
            providerExecuted: false,
          },
        },
      })
      const needsPrefix: Effect.Effect<unknown, unknown, WirePrefix> = serviceCodec.decodeServer(json)
      const withoutPrefix = yield* needsPrefix.pipe(Effect.provide(Layer.succeed(WirePrefix, WirePrefix.of(""))))
      expect(withoutPrefix).toMatchObject({ event: { part: { params: { value: "value" } } } })
      const provided = needsPrefix.pipe(Effect.provide(Layer.succeed(WirePrefix, WirePrefix.of("!"))))
      const decoded = yield* provided
      expect(decoded).toMatchObject({ event: { part: { params: { value: "value!" } } } })
    }),
  )

  it.effect("dispatches transformed fixed-tool parameters through the concrete schema", () =>
    Effect.gen(function* () {
      const transformed = Tool.make("transformed", {
        parameters: Schema.Struct({ count: Schema.FiniteFromString }),
        success: Schema.String,
        failure: Schema.String,
        failureMode: "return",
      })
      const transformedCodec = Wire.codec(Toolkit.make(transformed))
      const frame = {
        _tag: "Event" as const,
        seq: 0,
        event: {
          _tag: "ModelPart" as const,
          turn: 0,
          modelCallId: "model-call-0",
          modelAttemptId: "model-attempt-0",
          attempt: 0,
          part: Response.makePart("tool-call", {
            id: "call-0",
            name: "transformed",
            params: { count: 3 },
            providerExecuted: false,
          }),
        },
      }
      const encoded = yield* transformedCodec.encodeServer(frame)
      expect(JSON.parse(encoded).event.part.params).toEqual({ count: "3" })
      const decoded = yield* transformedCodec.decodeServer(encoded)
      expect(decoded).toMatchObject({ event: { part: { params: { count: 3 } } } })
    }),
  )
})
