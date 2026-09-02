import { Effect, Function, Schema, Stream, Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import { buildContext, type Entry as SessionEntry } from "../core/context/session.js"
import { BudgetLimits } from "../core/durable/run-budget.js"
import { CompactionInspection, RawUsageFact, RunId, type RunSnapshot } from "../runtime/run.js"
import { CompletedModelResponse } from "../runtime/run/event.js"
import type { InspectError, EventsError, Service as RuntimeService, SessionEntryError } from "../runtime/service.js"

export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  result: Schema.optionalKey(Schema.Unknown),
  isFailure: Schema.optionalKey(Schema.Boolean),
})
export type ToolCall = typeof ToolCall.Type

export const Turn = Schema.Struct({
  prompt: Prompt.Prompt,
  response: CompletedModelResponse,
  toolCalls: Schema.Array(ToolCall),
  usage: Schema.Array(RawUsageFact),
  compaction: Schema.optionalKey(CompactionInspection),
})
export type Turn = typeof Turn.Type

/** Stable, serializable projection of one Runtime journal. */
export const Trajectory = Schema.Struct({
  runId: RunId,
  agent: Schema.String,
  input: Prompt.Prompt,
  output: Schema.Unknown,
  turns: Schema.Array(Turn),
  /** Agent budget allocation when the journal's executable manifest declares one. */
  budget: Schema.optionalKey(BudgetLimits),
  stopReason: Schema.String,
})
export type Trajectory = typeof Trajectory.Type

/** One JSON Lines record. Each exported stream currently contains exactly one trajectory record. */
export const JsonlRecord = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  trajectory: Trajectory,
})
export type JsonlRecord = typeof JsonlRecord.Type

export class ProjectionFailed extends Schema.TaggedError<ProjectionFailed>()("generalist/trajectory/ProjectionFailed", {
  runId: Schema.String,
  message: Schema.String,
  hint: Schema.String,
}) {}

export type FromJournalError = InspectError | EventsError | SessionEntryError | ProjectionFailed

/** Cross-driver Runtime journal reads required by `fromJournal`. */
export interface JournalReader {
  readonly snapshot: RuntimeService["snapshot"]
  readonly history: RuntimeService["history"]
  readonly sessionEntry: RuntimeService["sessionEntry"]
  readonly resolveModelResponse: RuntimeService["resolveModelResponse"]
}

const pathTo = Effect.fn("Trajectory.pathTo")(function* (
  runtime: JournalReader,
  sessionId: string,
  leafId: string | null,
): Effect.fn.Return<ReadonlyArray<SessionEntry>, SessionEntryError> {
  const reversed: Array<SessionEntry> = []
  let current = leafId
  while (current !== null) {
    const entry = yield* runtime.sessionEntry({ sessionId, entryId: current })
    reversed.push(entry)
    current = entry.parentId
  }
  return reversed.toReversed()
})

type ModelResponseEvent = Parameters<RuntimeService["resolveModelResponse"]>[0]

const toolCallsFor = (
  events: ReadonlyArray<import("../runtime/run/event.js").RunEvent>,
  turn: number,
): ReadonlyArray<ToolCall> => {
  const calls = new Map<string, ToolCall>()
  for (const event of events) {
    if (!("turn" in event) || event.turn !== turn) continue
    if (
      event._tag === "ToolExecutionStarted" ||
      event._tag === "ToolExecutionWaiting" ||
      event._tag === "ApprovalRequested"
    ) {
      calls.set(event.call.id, { id: event.call.id, name: event.call.name, params: event.call.params })
      continue
    }
    if (event._tag !== "ToolExecutionCompleted") continue
    calls.set(event.call.id, {
      id: event.call.id,
      name: event.call.name,
      params: event.call.params,
      result: event.result.result,
      isFailure: event.result.isFailure,
    })
  }
  return [...calls.values()]
}

const activeAgent = (snapshot: RunSnapshot) => {
  const active = snapshot.run.executableRef.active
  return snapshot.run.executableManifest.entries.find((entry) => entry._tag === "Agent" && entry.pin === active)
}

/** Project one point-in-time Runtime journal using only cross-driver Runtime read methods. */
export const fromJournal = Effect.fn("Trajectory.fromJournal")(function* (
  runtime: JournalReader,
  runId: string,
): Effect.fn.Return<Trajectory, FromJournalError> {
  const snapshot = yield* runtime.snapshot(runId)
  const events = yield* runtime.history({ runId, limit: snapshot.cursor + 1 })
  const modelEvents = events.filter(
    (event): event is ModelResponseEvent =>
      event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted",
  )
  const agent = activeAgent(snapshot)
  if (agent === undefined) {
    return yield* ProjectionFailed.make({
      runId,
      message: "The Run executable is not an Agent",
      hint: "Project Agent Runs only; Agent Program Runs do not carry the Agent trajectory contract.",
    })
  }
  if (modelEvents.length === 0) {
    return yield* ProjectionFailed.make({
      runId,
      message: "The Run journal has no model response",
      hint: "Wait for at least one model turn before projecting a trajectory.",
    })
  }

  const turns: Array<Turn> = []
  for (const event of modelEvents) {
    const response = yield* runtime.resolveModelResponse(event)
    const path = yield* pathTo(runtime, event.sessionId, event.sessionParentId)
    const projected: Types.Mutable<Turn> = {
      prompt: buildContext(path),
      response,
      toolCalls: toolCallsFor(events, event.turn),
      usage: snapshot.usage.filter((fact) => fact.turn === event.turn),
    }
    const compaction = snapshot.compactions.findLast((value) => value.turn === event.turn)
    if (compaction !== undefined) projected.compaction = compaction
    turns.push(projected)
  }

  const first = modelEvents[0]!
  const input = buildContext(yield* pathTo(runtime, first.sessionId, first.sessionParentId))
  const terminal = snapshot.outcome
  const output =
    terminal?._tag === "Succeeded" && !("_tag" in terminal.result)
      ? (terminal.result.output ?? terminal.result.text)
      : null
  const lastFinish = events.findLast((event) => event._tag === "TurnCompleted")
  const stopReason = terminal?._tag === "Succeeded" ? (lastFinish?.finishReason ?? "succeeded") : snapshot.run.status
  const trajectory: Types.Mutable<Trajectory> = {
    runId: snapshot.run.runId,
    agent: agent.manifest.name,
    input,
    output,
    turns,
    stopReason,
  }
  if (Object.keys(agent.manifest.budget).length > 0) trajectory.budget = agent.manifest.budget
  return trajectory
})

export interface ExportOptions {
  readonly format: "jsonl"
}

const textEncoder = new TextEncoder()

const exportJsonl: {
  (options: ExportOptions): (trajectory: Trajectory) => Stream.Stream<Uint8Array, Schema.SchemaError>
  (trajectory: Trajectory, options: ExportOptions): Stream.Stream<Uint8Array, Schema.SchemaError>
} = Function.dual(2, (trajectory: Trajectory, options: ExportOptions) => {
  if (options.format !== "jsonl") throw new TypeError("Unsupported trajectory export format")
  const record: JsonlRecord = { schemaVersion: "1", trajectory }
  return Stream.fromEffect(
    Schema.encodeEffect(Schema.fromJsonString(JsonlRecord))(record).pipe(
      Effect.map((line) => textEncoder.encode(`${line}\n`)),
    ),
  )
})

export { exportJsonl as export }

export const encode = (trajectory: Trajectory): Effect.Effect<typeof Trajectory.Encoded, Schema.SchemaError> =>
  Schema.encodeEffect(Trajectory)(trajectory)
