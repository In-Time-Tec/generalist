import { Function, Option, Schema } from "effect"
import { Cursor } from "../runtime/cursor.js"
import type { HostSessionEvent } from "../runtime/session/host.js"
import { RunEvent } from "../runtime/run/event.js"
import { Items as TaskItems } from "../tasks/item.js"
import { EditResult as ArtifactEditResult } from "../core/artifact.js"

type TaggedRunEvent<Tag extends RunEvent["_tag"]> = RunEvent & { readonly _tag: Tag }

/**
 * Fields of a Host event that carries one journaled Run event. The explicit annotations below keep declaration emit
 * as references to RunEvent instead of expanding the whole union into every Host event struct.
 */
type RunEventFields<Tag extends RunEvent["_tag"]> = {
  readonly sessionId: Schema.String
  readonly cursor: typeof Cursor
  readonly runId: Schema.String
  readonly event: Schema.refine<TaggedRunEvent<Tag>, typeof RunEvent>
}

const runEventFields = <Tag extends RunEvent["_tag"]>(...tags: ReadonlyArray<Tag>): RunEventFields<Tag> => ({
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  event: RunEvent.pipe(Schema.refine((event): event is TaggedRunEvent<Tag> => tags.some((tag) => tag === event._tag))),
})

const RunStarted: Schema.TaggedStruct<"RunStarted", RunEventFields<"RunAccepted">> = Schema.TaggedStruct(
  "RunStarted",
  runEventFields("RunAccepted"),
)
export type RunStarted = typeof RunStarted.Type

const Turn: Schema.TaggedStruct<"Turn", RunEventFields<"TurnStarted" | "TurnCompleted">> = Schema.TaggedStruct(
  "Turn",
  runEventFields("TurnStarted", "TurnCompleted"),
)
export type Turn = typeof Turn.Type

const ToolCall: Schema.TaggedStruct<
  "ToolCall",
  RunEventFields<"ToolExecutionStarted" | "ToolProgress" | "ToolExecutionCompleted" | "ToolExecutionWaiting">
> = Schema.TaggedStruct(
  "ToolCall",
  runEventFields("ToolExecutionStarted", "ToolProgress", "ToolExecutionCompleted", "ToolExecutionWaiting"),
)
export type ToolCall = typeof ToolCall.Type

/** The authoritative journaled task list changed. */
export const TasksUpdated = Schema.TaggedStruct("TasksUpdated", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  items: TaskItems,
})
export type TasksUpdated = typeof TasksUpdated.Type

/** One Agent-authored shared artifact edit committed by this Run. */
export const ArtifactUpdated = Schema.TaggedStruct("ArtifactUpdated", {
  sessionId: Schema.String,
  cursor: Cursor,
  runId: Schema.String,
  update: ArtifactEditResult,
})
export type ArtifactUpdated = typeof ArtifactUpdated.Type

const ApprovalRequested: Schema.TaggedStruct<
  "ApprovalRequested",
  RunEventFields<"ApprovalRequested">
> = Schema.TaggedStruct("ApprovalRequested", runEventFields("ApprovalRequested"))
export type ApprovalRequested = typeof ApprovalRequested.Type

const Compacted: Schema.TaggedStruct<"Compacted", RunEventFields<"CompactionApplied">> = Schema.TaggedStruct(
  "Compacted",
  runEventFields("CompactionApplied"),
)
export type Compacted = typeof Compacted.Type

const Completed: Schema.TaggedStruct<
  "Completed",
  RunEventFields<"RunCompleted" | "RunFailed" | "RunCancelled">
> = Schema.TaggedStruct("Completed", runEventFields("RunCompleted", "RunFailed", "RunCancelled"))
export type Completed = typeof Completed.Type

/** One product-facing event at its exclusive Session cursor. */
export const HostEvent: Schema.Union<
  readonly [
    typeof RunStarted,
    typeof Turn,
    typeof ToolCall,
    typeof TasksUpdated,
    typeof ArtifactUpdated,
    typeof ApprovalRequested,
    typeof Compacted,
    typeof Completed,
  ]
> = Schema.Union([RunStarted, Turn, ToolCall, TasksUpdated, ArtifactUpdated, ApprovalRequested, Compacted, Completed])
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
    case "ToolExecutionWaiting":
      return Option.some({ ...base, _tag: "ToolCall", event: entry.event })
    case "ToolExecutionCompleted":
      if (entry.event.tasksUpdated !== undefined) {
        return Option.some({ ...base, _tag: "TasksUpdated", items: entry.event.tasksUpdated })
      }
      return entry.event.artifactUpdated === undefined
        ? Option.some({ ...base, _tag: "ToolCall", event: entry.event })
        : Option.some({ ...base, _tag: "ArtifactUpdated", update: entry.event.artifactUpdated })
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
