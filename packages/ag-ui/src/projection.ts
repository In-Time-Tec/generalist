import { EventSchemas, EventType, type AGUIEvent } from "@ag-ui/core"
import { Effect, Function, Schema } from "effect"
import { RunEvent } from "@batonfx/runtime"
import { EventInvalid, ValueNotSerializable } from "./errors.js"

const encodeJsonValue = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

/** @experimental */
export interface ProjectionState {
  textId: string | undefined
  reasoningId: string | undefined
  readonly streamedTools: Set<string>
}

/** @experimental */
export const makeState = (): ProjectionState => ({
  textId: undefined,
  reasoningId: undefined,
  streamedTools: new Set(),
})

const emit = (event: unknown): Effect.Effect<AGUIEvent, EventInvalid> => {
  const parsed = EventSchemas.safeParse(event)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(EventInvalid.make({ source: "ag-ui", detail: parsed.error.message }))
}

const emitAll = (events: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid> =>
  Effect.forEach(events, emit)

const stringify = (value: unknown, field: string): Effect.Effect<string, ValueNotSerializable> =>
  Effect.try({
    try: () => {
      if (typeof value === "string") return value
      return encodeJsonValue(value)
    },
    catch: () => ValueNotSerializable.make({ field }),
  })

const closeOpen = (state: ProjectionState): ReadonlyArray<unknown> => {
  const events: Array<unknown> = []
  if (state.textId !== undefined) {
    events.push({ type: EventType.TEXT_MESSAGE_END, messageId: state.textId })
    state.textId = undefined
  }
  if (state.reasoningId !== undefined) {
    events.push({ type: EventType.REASONING_MESSAGE_END, messageId: state.reasoningId })
    events.push({ type: EventType.REASONING_END, messageId: state.reasoningId })
    state.reasoningId = undefined
  }
  return events
}

const projectModelPart = (
  state: ProjectionState,
  event: Extract<RunEvent.RunEvent, { readonly _tag: "ModelPart" }>,
): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable> => {
  const part = event.part
  switch (part.type) {
    case "text-start":
      state.textId = part.id
      return emitAll([{ type: EventType.TEXT_MESSAGE_START, messageId: part.id, role: "assistant" }])
    case "text-delta": {
      const events: Array<unknown> = []
      if (state.textId !== part.id) {
        events.push(...closeOpen(state), { type: EventType.TEXT_MESSAGE_START, messageId: part.id, role: "assistant" })
        state.textId = part.id
      }
      events.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: part.id, delta: part.delta })
      return emitAll(events)
    }
    case "text-end":
      state.textId = undefined
      return emitAll([{ type: EventType.TEXT_MESSAGE_END, messageId: part.id }])
    case "reasoning-start":
      state.reasoningId = part.id
      return emitAll([
        { type: EventType.REASONING_START, messageId: part.id },
        { type: EventType.REASONING_MESSAGE_START, messageId: part.id, role: "reasoning" },
      ])
    case "reasoning-delta": {
      const events: Array<unknown> = []
      if (state.reasoningId !== part.id) {
        events.push(...closeOpen(state))
        events.push(
          { type: EventType.REASONING_START, messageId: part.id },
          { type: EventType.REASONING_MESSAGE_START, messageId: part.id, role: "reasoning" },
        )
        state.reasoningId = part.id
      }
      events.push({ type: EventType.REASONING_MESSAGE_CONTENT, messageId: part.id, delta: part.delta })
      return emitAll(events)
    }
    case "reasoning-end":
      state.reasoningId = undefined
      return emitAll([
        { type: EventType.REASONING_MESSAGE_END, messageId: part.id },
        { type: EventType.REASONING_END, messageId: part.id },
      ])
    case "tool-params-start":
      state.streamedTools.add(part.id)
      return emitAll([{ type: EventType.TOOL_CALL_START, toolCallId: part.id, toolCallName: part.name }])
    case "tool-params-delta":
      return emitAll([{ type: EventType.TOOL_CALL_ARGS, toolCallId: part.id, delta: part.delta }])
    case "tool-params-end":
      return emitAll([{ type: EventType.TOOL_CALL_END, toolCallId: part.id }])
    case "tool-call":
      if (state.streamedTools.has(part.id)) return Effect.succeed([])
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
            { type: EventType.TOOL_CALL_RESULT, messageId: `${event.eventId}:result`, toolCallId: part.id, content },
          ]),
        ),
      )
    default:
      return Effect.succeed([])
  }
}

/** @experimental */
export const project: {
  (
    state: ProjectionState,
    value: unknown,
    threadId: string,
  ): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
  (
    value: unknown,
    threadId: string,
  ): (state: ProjectionState) => Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable>
} = Function.dual(
  3,
  (
    state: ProjectionState,
    value: unknown,
    threadId: string,
  ): Effect.Effect<ReadonlyArray<AGUIEvent>, EventInvalid | ValueNotSerializable> => {
    if (!Schema.is(RunEvent.RunEvent)(value)) {
      return Effect.fail(EventInvalid.make({ source: "runtime", detail: "RunEvent schema rejected the value" }))
    }
    const event = value
    return Effect.suspend(() => {
      if (event._tag === "ModelPart") return projectModelPart(state, event)
      switch (event._tag) {
        case "RunAccepted":
          return emitAll([
            {
              type: EventType.RUN_STARTED,
              threadId,
              runId: event.runId,
              ...(event.parentRunId === undefined ? {} : { parentRunId: event.parentRunId }),
            },
          ])
        case "RunResumed":
          return emitAll([
            {
              type: EventType.RUN_STARTED,
              threadId,
              runId: event.runId,
              ...(event.parentRunId === undefined ? {} : { parentRunId: event.parentRunId }),
            },
          ])
        case "TurnStarted":
          return emitAll([{ type: EventType.STEP_STARTED, stepName: `turn:${event.turn}` }])
        case "TurnCompleted":
          return emitAll([...closeOpen(state), { type: EventType.STEP_FINISHED, stepName: `turn:${event.turn}` }])
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
              name: "baton.tool.progress",
              value: {
                toolCallId: event.toolCallId,
                ...(event.message === undefined ? {} : { message: event.message }),
                ...(event.data === undefined ? {} : { data: event.data }),
              },
            },
          ])
        case "RunWaiting": {
          const wait = event.wait
          return emitAll([
            ...closeOpen(state),
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
                    metadata: {
                      status: wait.status,
                      ...(wait.reason._tag === "Approval" ? { approval: wait.reason.request } : {}),
                    },
                  },
                ],
              },
            },
          ])
        }
        case "RunCompleted":
          return emitAll([
            ...closeOpen(state),
            {
              type: EventType.RUN_FINISHED,
              threadId,
              runId: event.runId,
              result: event.result,
              outcome: { type: "success" },
            },
          ])
        case "RunFailed":
          return emitAll([
            ...closeOpen(state),
            { type: EventType.RUN_ERROR, message: event.error.message, code: "RUN_FAILED" },
          ])
        case "RunCancelled":
          return emitAll([
            ...closeOpen(state),
            { type: EventType.RUN_ERROR, message: event.reason ?? "Run cancelled", code: "RUN_CANCELLED" },
          ])
        case "OperationUnknown":
          return emitAll([
            {
              type: EventType.RUN_ERROR,
              message: `Operation ${event.operationId} requires resolution`,
              code: "OPERATION_UNKNOWN",
            },
          ])
        case "StructuredOutput":
          return emitAll([{ type: EventType.CUSTOM, name: "baton.structured-output", value: event.value }])
        default:
          return Effect.succeed([])
      }
    })
  },
)

/** @experimental */
export const stateSnapshot = (snapshot: unknown): Effect.Effect<AGUIEvent, EventInvalid> =>
  emit({ type: EventType.STATE_SNAPSHOT, snapshot })
