import { Function, Option, Schema } from "effect"
import { Cursor } from "../runtime/cursor.js"
import type { HostSessionEvent } from "../runtime/session/host.js"
import { RunEvent } from "../runtime/run/event.js"

type TaggedRunEvent<Tag extends RunEvent["_tag"]> = RunEvent & { readonly _tag: Tag }

const extractEvents = <Tag extends RunEvent["_tag"]>(...tags: ReadonlyArray<Tag>) =>
  RunEvent.pipe(Schema.refine((event): event is TaggedRunEvent<Tag> => tags.some((tag) => tag === event._tag)))

const RunStarted = Schema.TaggedStruct("RunStarted", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("RunAccepted"),
})
export type RunStarted = typeof RunStarted.Type

const Turn = Schema.TaggedStruct("Turn", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("TurnStarted", "TurnCompleted"),
})
export type Turn = typeof Turn.Type

const ToolCall = Schema.TaggedStruct("ToolCall", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("ToolExecutionStarted", "ToolProgress", "ToolExecutionCompleted", "ToolExecutionWaiting"),
})
export type ToolCall = typeof ToolCall.Type

const ApprovalRequested = Schema.TaggedStruct("ApprovalRequested", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("ApprovalRequested"),
})
export type ApprovalRequested = typeof ApprovalRequested.Type

const Compacted = Schema.TaggedStruct("Compacted", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("CompactionApplied"),
})
export type Compacted = typeof Compacted.Type

const Completed = Schema.TaggedStruct("Completed", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: extractEvents("RunCompleted", "RunFailed", "RunCancelled"),
})
export type Completed = typeof Completed.Type

/** One product-facing event at its exclusive Session cursor. */
export const HostEvent = Schema.Union([RunStarted, Turn, ToolCall, ApprovalRequested, Compacted, Completed])
export type HostEvent = typeof HostEvent.Type

/** Project one durable Runtime event into the product-facing Host stream. */
export const project: {
  (entry: HostSessionEvent): (sessionId: string) => Option.Option<HostEvent>
  (sessionId: string, entry: HostSessionEvent): Option.Option<HostEvent>
} = Function.dual(2, (sessionId: string, entry: HostSessionEvent): Option.Option<HostEvent> => {
  const base = { sessionId, cursor: entry.cursor, runId: entry.event.runId }
  switch (entry.event._tag) {
    case "RunAccepted":
      return Option.some({ ...base, _tag: "RunStarted", event: entry.event })
    case "TurnStarted":
    case "TurnCompleted":
      return Option.some({ ...base, _tag: "Turn", event: entry.event })
    case "ToolExecutionStarted":
    case "ToolProgress":
    case "ToolExecutionCompleted":
    case "ToolExecutionWaiting":
      return Option.some({ ...base, _tag: "ToolCall", event: entry.event })
    case "ApprovalRequested":
      return Option.some({ ...base, _tag: "ApprovalRequested", event: entry.event })
    case "CompactionApplied":
      return Option.some({ ...base, _tag: "Compacted", event: entry.event })
    case "RunCompleted":
    case "RunFailed":
    case "RunCancelled":
      return Option.some({ ...base, _tag: "Completed", event: entry.event })
    default:
      return Option.none()
  }
})
