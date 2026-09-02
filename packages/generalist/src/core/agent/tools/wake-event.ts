import { Cause, Clock, DateTime, Duration, Effect, Function, Option, Schema } from "effect"
import { ToolContext } from "../../tools/tool-context.js"
import { ActionableTaggedError, errorHint } from "../../error-hint.js"

const DedupeKey = Schema.String.check(Schema.isNonEmpty())

/** A typed environmental fact that can resume an awaiting Agent tool call. */
export const WakeEvent = Schema.Union([
  Schema.TaggedStruct("Timer", {
    dedupeKey: DedupeKey,
    scheduleId: Schema.String,
    scheduledAt: Schema.String,
    payload: Schema.Json,
  }),
  Schema.TaggedStruct("Webhook", {
    dedupeKey: DedupeKey,
    source: Schema.String,
    payload: Schema.Json,
    headers: Schema.Record(Schema.String, Schema.String),
  }),
  Schema.TaggedStruct("ChildCompleted", {
    dedupeKey: DedupeKey,
    childRunId: Schema.String,
    terminalEventId: Schema.String,
  }),
  Schema.TaggedStruct("FileChanged", {
    dedupeKey: DedupeKey,
    path: Schema.String,
    kind: Schema.Literals(["create", "update", "remove"]),
  }),
  Schema.TaggedStruct("ApprovalResolved", {
    dedupeKey: DedupeKey,
    approvalId: Schema.String,
    decision: Schema.Union([
      Schema.TaggedStruct("Approved", {}),
      Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    ]),
  }),
])
export type WakeEvent = typeof WakeEvent.Type

/** Serializable selector persisted with an `Agent.awaitEvent` obligation. */
export const WakeEventFilter = Schema.Union([
  Schema.TaggedStruct("Timer", { scheduleId: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("Webhook", { source: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("ChildCompleted", { childRunId: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("FileChanged", {
    path: Schema.optionalKey(Schema.String),
    kind: Schema.optionalKey(Schema.Literals(["create", "update", "remove"])),
  }),
  Schema.TaggedStruct("ApprovalResolved", { approvalId: Schema.optionalKey(Schema.String) }),
])
export type WakeEventFilter = typeof WakeEventFilter.Type

/** Result injected as the terminal result of the awaiting tool call. */
export const AwaitEventResult = Schema.Union([
  Schema.TaggedStruct("Event", { event: WakeEvent }),
  Schema.TaggedStruct("TimedOut", { deadline: Schema.String }),
])
export type AwaitEventResult = typeof AwaitEventResult.Type

/** Durable metadata carried by a tool suspension created by `Agent.awaitEvent`. */
export const AwaitEvent = Schema.Struct({
  filter: WakeEventFilter,
  deadline: Schema.String,
})
export type AwaitEvent = typeof AwaitEvent.Type

/** The requested event timeout is not finite and positive. */
export class AwaitEventInvalid extends ActionableTaggedError<AwaitEventInvalid>()("generalist/core/AwaitEventInvalid", {
  reason: Schema.Literal("invalid-timeout"),
  hint: errorHint("Use a finite timeout greater than zero."),
}) {}

const AwaitEventSuspended = Schema.TaggedStruct("generalist/core/AwaitEventSuspended", {
  token: Schema.String,
  awaitEvent: AwaitEvent,
})
type AwaitEventSuspended = typeof AwaitEventSuspended.Type

/** @internal Identify the control-flow failure intercepted by tool execution. */
export const isAwaitEventSuspended = Schema.is(AwaitEventSuspended)

/** @internal Find the sole await-event control defect without swallowing other failures or interruption. */
export const suspendedFromCause = (cause: Cause.Cause<unknown>): AwaitEventSuspended | undefined => {
  if (cause.reasons.length !== 1) return undefined
  const reason = cause.reasons[0]
  return reason !== undefined && Cause.isDieReason(reason) && isAwaitEventSuspended(reason.defect)
    ? reason.defect
    : undefined
}

/** @internal Convert an intercepted await into the durable tool outcome. */
export const suspendedOutcome = (suspension: AwaitEventSuspended) => ({
  _tag: "Suspend" as const,
  token: suspension.token,
  awaitEvent: suspension.awaitEvent,
})

const optionalEquals = (expected: string | undefined, actual: string): boolean =>
  expected === undefined || expected === actual

/** Test one persisted filter against one validated wake event. */
export const matches: {
  (event: WakeEvent): (filter: WakeEventFilter) => boolean
  (filter: WakeEventFilter, event: WakeEvent): boolean
} = Function.dual(2, (filter: WakeEventFilter, event: WakeEvent): boolean => {
  if (filter._tag !== event._tag) return false
  switch (filter._tag) {
    case "Timer":
      return event._tag === "Timer" && optionalEquals(filter.scheduleId, event.scheduleId)
    case "Webhook":
      return event._tag === "Webhook" && optionalEquals(filter.source, event.source)
    case "ChildCompleted":
      return event._tag === "ChildCompleted" && optionalEquals(filter.childRunId, event.childRunId)
    case "FileChanged":
      return (
        event._tag === "FileChanged" &&
        optionalEquals(filter.path, event.path) &&
        (filter.kind === undefined || filter.kind === event.kind)
      )
    case "ApprovalResolved":
      return event._tag === "ApprovalResolved" && optionalEquals(filter.approvalId, event.approvalId)
  }
})

export interface AwaitEventOptions {
  readonly timeout: Duration.Input
}

/**
 * Suspend the current durable tool call until a matching environmental event or timeout.
 *
 * This is a terminal tool-handler Effect: durable resume injects `AwaitEventResult` as that tool
 * call's result rather than re-running JavaScript after this Effect.
 */
export const awaitEvent: {
  (
    options: AwaitEventOptions,
  ): (filter: WakeEventFilter) => Effect.Effect<AwaitEventResult, AwaitEventInvalid, ToolContext>
  (filter: WakeEventFilter, options: AwaitEventOptions): Effect.Effect<AwaitEventResult, AwaitEventInvalid, ToolContext>
} = Function.dual(2, (filter: WakeEventFilter, options: AwaitEventOptions) =>
  Effect.gen(function* () {
    const context = yield* ToolContext
    const duration = Duration.fromInput(options.timeout)
    if (Option.isNone(duration) || !Duration.isFinite(duration.value) || !Duration.isPositive(duration.value)) {
      return yield* AwaitEventInvalid.make({ reason: "invalid-timeout" })
    }
    const now = yield* Clock.currentTimeMillis
    const deadline = DateTime.formatIso(DateTime.makeUnsafe(now + Duration.toMillis(duration.value)))
    const token = context.operationKey ?? `${context.runId ?? context.sessionId}:${context.toolCallId ?? "await-event"}`
    return yield* Effect.die(
      AwaitEventSuspended.make({
        token,
        awaitEvent: { filter, deadline },
      }),
    )
  }),
)
