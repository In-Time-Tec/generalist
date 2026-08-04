import { Effect, Schedule, Schema, Stream } from "effect"
import type { RunEvent } from "./run-event.js"
import { CompactionInspection, RawUsageFact, RunInspection, RunOutcome } from "./run.js"
import { Runtime } from "./runtime.js"
import { TreeCursor, type TreeCursor as TreeCursorType } from "./tree-cursor.js"
export { TreeCursor }

export interface TreeEvent {
  readonly rootRunId: string
  readonly runId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly modelCallId?: string
  readonly modelAttemptId?: string
  readonly toolCallId?: string
  readonly event: RunEvent
  readonly cursor: TreeCursorType
}

export interface TreePage {
  readonly events: ReadonlyArray<TreeEvent>
  readonly cursor: TreeCursorType
  readonly hasMore: boolean
}

export interface HistoryInput {
  readonly rootRunId: string
  readonly cursor?: TreeCursorType
  readonly limit: number
}

export interface EventsInput {
  readonly rootRunId: string
  readonly cursor?: TreeCursorType
}

export const TreeRunInspection = Schema.Struct({
  run: RunInspection,
  parentRunId: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  outcome: Schema.optionalKey(RunOutcome),
})
export type TreeRunInspection = typeof TreeRunInspection.Type

const InspectionBase = {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  runs: Schema.Array(TreeRunInspection),
  usage: Schema.Array(RawUsageFact),
  compactions: Schema.Array(CompactionInspection),
}

export const Inspection = Schema.Union([
  Schema.TaggedStruct("Active", { ...InspectionBase, activeRunIds: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("Terminal", InspectionBase),
])
export type Inspection = typeof Inspection.Type

export const encodeInspection = Schema.encodeEffect(Inspection)
export const decodeInspection = Schema.decodeEffect(Inspection)

export const history = (input: HistoryInput) => Runtime.use((runtime) => runtime.treeHistory(input))

export const inspect = (rootRunId: string) => Runtime.use((runtime) => runtime.inspectTree(rootRunId))

export const awaitTerminal = (
  rootRunId: string,
): Effect.Effect<Extract<Inspection, { readonly _tag: "Terminal" }>, import("./runtime.js").TreeEventsError, Runtime> =>
  Effect.suspend(() =>
    inspect(rootRunId).pipe(
      Effect.flatMap((current) =>
        current._tag === "Terminal"
          ? Effect.succeed(current)
          : events({ rootRunId, cursor: current.cursor }).pipe(
              Stream.filter(
                ({ event }) =>
                  event._tag === "RunAccepted" ||
                  event._tag === "ChildLinked" ||
                  event._tag === "RunCompleted" ||
                  event._tag === "RunFailed" ||
                  event._tag === "RunCancelled",
              ),
              Stream.runHead,
              Effect.flatMap(() => awaitTerminal(rootRunId)),
            ),
      ),
    ),
  )

export const events = (input: EventsInput): Stream.Stream<TreeEvent, import("./runtime.js").TreeEventsError, Runtime> =>
  Stream.unwrap(
    Runtime.use((runtime) =>
      Effect.sync(() => {
        let cursor = input.cursor
        const read = Effect.suspend(() =>
          runtime.treeHistory({ rootRunId: input.rootRunId, ...(cursor === undefined ? {} : { cursor }), limit: 256 }),
        ).pipe(
          Effect.tap((page) =>
            Effect.sync(() => {
              cursor = page.cursor
            }),
          ),
        )
        return Stream.fromEffect(read).pipe(
          Stream.flatMap((page) => Stream.fromIterable(page.events)),
          Stream.repeat(Schedule.spaced("50 millis")),
        )
      }),
    ),
  )
