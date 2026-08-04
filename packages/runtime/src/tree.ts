import { Effect, Schedule, Stream } from "effect"
import type { RunEvent } from "./run-event.js"
import { Runtime } from "./runtime.js"
import { type TreeCursor as TreeCursorType } from "./tree-cursor.js"
export { TreeCursor } from "./tree-cursor.js"

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

export const history = (input: HistoryInput) => Runtime.use((runtime) => runtime.treeHistory(input))

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
