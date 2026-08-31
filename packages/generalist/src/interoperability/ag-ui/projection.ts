import { EventSchemas, EventType, type AGUIEvent } from "@ag-ui/core"
import { Effect, Function, Schema } from "effect"
import { RunEvent, type CompletedModelResponse } from "../../runtime/run/event.js"
import { EventInvalid, ValueNotSerializable } from "./errors.js"

type BoundaryValue = typeof Schema.Unknown.Type

const encodeJsonValue = (value: BoundaryValue): string =>
  Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(Schema.decodeUnknownSync(Schema.Unknown)(value))

const emit = (event: BoundaryValue): Effect.Effect<AGUIEvent, EventInvalid> => {
  const parsed = EventSchemas.safeParse(event)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(EventInvalid.make({ source: "ag-ui", detail: parsed.error.message }))
}

const emitAll = (events: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid> =>
  Effect.forEach(events, emit)

const stringify = (value: BoundaryValue, field: string): Effect.Effect<string, ValueNotSerializable> =>
  Effect.try({
    try: () => {
      if (Schema.is(Schema.String)(value)) return value
      return encodeJsonValue(value)
    },
    catch: () => ValueNotSerializable.make({ field }),
  })

type ModelResponseEvent = Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }>
type SemanticPart = CompletedModelResponse["content"][number]
type RunErrorEvent = Extract<RunEvent, { readonly _tag: "RunFailed" | "RunCancelled" | "OperationUnknown" }>
type WaitingEvent = Extract<RunEvent, { readonly _tag: "RunWaiting" }>

const waitMetadata = (event: WaitingEvent) =>
  event.wait.reason._tag === "Approval"
    ? { status: event.wait.status, approval: event.wait.reason.request }
    : { status: event.wait.status }

const projectRunError = (event: RunErrorEvent): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid> => {
  if (event._tag === "RunFailed") {
    return emitAll([{ type: EventType.RUN_ERROR, message: event.error.message, code: "RUN_FAILED" }])
  }
  if (event._tag === "RunCancelled") {
    return emitAll([{ type: EventType.RUN_ERROR, message: event.reason ?? "Run cancelled", code: "RUN_CANCELLED" }])
  }
  return emitAll([
    {
      type: EventType.RUN_ERROR,
      message: `Operation ${event.operationId} requires resolution`,
      code: "OPERATION_UNKNOWN",
    },
  ])
}

const messageId = (event: ModelResponseEvent, part: SemanticPart, index: number): string =>
  `${event.eventId}:${part.type}:${index}`

const projectSemanticPart = (
  event: ModelResponseEvent,
  part: SemanticPart,
  index: number,
): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable> => {
  switch (part.type) {
    case "text": {
      const id = messageId(event, part, index)
      return emitAll([
        { type: EventType.TEXT_MESSAGE_START, messageId: id, role: "assistant" },
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: part.text },
        { type: EventType.TEXT_MESSAGE_END, messageId: id },
      ])
    }
    case "reasoning": {
      const id = messageId(event, part, index)
      return emitAll([
        { type: EventType.REASONING_START, messageId: id },
        { type: EventType.REASONING_MESSAGE_START, messageId: id, role: "reasoning" },
        { type: EventType.REASONING_MESSAGE_CONTENT, messageId: id, delta: part.text },
        { type: EventType.REASONING_MESSAGE_END, messageId: id },
        { type: EventType.REASONING_END, messageId: id },
      ])
    }
    case "tool-call":
      return stringify(part.params, "tool arguments").pipe(
        Effect.flatMap((args) =>
          emitAll([
            { type: EventType.TOOL_CALL_START, toolCallId: part.id, toolCallName: part.name },
            { type: EventType.TOOL_CALL_ARGS, toolCallId: part.id, delta: args },
            { type: EventType.TOOL_CALL_END, toolCallId: part.id },
          ]),
        ),
      )
    case "tool-result":
      return stringify(part.encodedResult, "tool result").pipe(
        Effect.flatMap((content) =>
          emitAll([
            {
              type: EventType.TOOL_CALL_RESULT,
              messageId: `${event.eventId}:tool-result:${index}`,
              toolCallId: part.id,
              content,
            },
          ]),
        ),
      )
    default:
      return Effect.succeed([])
  }
}

export const projectModelResponse: {
  (
    event: ModelResponseEvent,
    content: CompletedModelResponse["content"],
  ): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
  (
    content: CompletedModelResponse["content"],
  ): (event: ModelResponseEvent) => Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
} = Function.dual(2, (event: ModelResponseEvent, content: CompletedModelResponse["content"]) =>
  Effect.forEach(content, (part, index) => projectSemanticPart(event, part, index)).pipe(
    Effect.map((batches) => batches.flat()),
  ),
)

/** @experimental */
export const project: {
  (value: BoundaryValue, threadId: string): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
  (
    threadId: string,
  ): (value: BoundaryValue) => Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
} = Function.dual(
  2,
  (
    value: BoundaryValue,
    threadId: string,
  ): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable> => {
    if (!Schema.is(RunEvent)(value)) {
      return Effect.fail(EventInvalid.make({ source: "runtime", detail: "RunEvent schema rejected the value" }))
    }
    const event = value
    return Effect.suspend(() => {
      switch (event._tag) {
        case "ModelResponseCommitted":
        case "ModelResponseInterrupted":
          return Effect.succeed([])
        case "RunAccepted":
        case "RunResumed":
          return emitAll([
            {
              type: EventType.RUN_STARTED,
              threadId,
              runId: event.runId,
              parentRunId: event.parentRunId,
            },
          ])
        case "TurnStarted":
          return emitAll([{ type: EventType.STEP_STARTED, stepName: `turn:${event.turn}` }])
        case "TurnCompleted":
          return emitAll([{ type: EventType.STEP_FINISHED, stepName: `turn:${event.turn}` }])
        case "ToolExecutionCompleted":
          return stringify(event.result.encodedResult, "tool result").pipe(
            Effect.flatMap((content) =>
              emitAll([
                {
                  type: EventType.TOOL_CALL_RESULT,
                  messageId: `${event.eventId}:result`,
                  toolCallId: event.call.id,
                  content,
                },
              ]),
            ),
          )
        case "ToolProgress":
          return emitAll([
            {
              type: EventType.CUSTOM,
              name: "generalist.tool.progress",
              value: {
                toolCallId: event.toolCallId,
                message: event.message,
                data: event.data,
              },
            },
          ])
        case "RunWaiting": {
          const wait = event.wait
          const metadata = waitMetadata(event)
          return emitAll([
            {
              type: EventType.RUN_FINISHED,
              threadId,
              runId: event.runId,
              outcome: {
                type: "interrupt",
                interrupts: [
                  {
                    id: wait.waitId,
                    reason: wait.reason._tag,
                    metadata,
                  },
                ],
              },
            },
          ])
        }
        case "RunCompleted":
          return emitAll([
            {
              type: EventType.RUN_FINISHED,
              threadId,
              runId: event.runId,
              result: event.result,
              outcome: { type: "success" },
            },
          ])
        case "RunFailed":
        case "RunCancelled":
        case "OperationUnknown":
          return projectRunError(event)
        case "StructuredOutput":
          return emitAll([{ type: EventType.CUSTOM, name: "generalist.structured-output", value: event.value }])
        default:
          return Effect.succeed([])
      }
    })
  },
)

/** @experimental */
export const stateSnapshot = (snapshot: BoundaryValue): Effect.Effect<AGUIEvent, EventInvalid> =>
  emit({ type: EventType.STATE_SNAPSHOT, snapshot: Schema.decodeUnknownSync(Schema.Unknown)(snapshot) })
