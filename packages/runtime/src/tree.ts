import { Effect, Stream } from "effect"
import type { Cursor } from "./cursor.js"
import type { EventsError } from "./runtime.js"
import type { RunEvent } from "./run-event.js"
import { Runtime } from "./runtime.js"

export interface TreeEvent {
  readonly path: ReadonlyArray<string>
  readonly event: RunEvent
  readonly cursor: Cursor
}

export interface EventsInput {
  readonly rootRunId: string
  readonly cursors?: ReadonlyMap<string, Cursor>
}

export const events = (input: EventsInput): Stream.Stream<TreeEvent, EventsError, Runtime> =>
  Stream.unwrap(
    Runtime.use((runtime) =>
      Effect.succeed(
        runtime
          .events({
            runId: input.rootRunId,
            ...(input.cursors?.has(input.rootRunId) ? { cursor: input.cursors.get(input.rootRunId)! } : {}),
          })
          .pipe(
            Stream.map(
              (event): TreeEvent => ({
                path: [input.rootRunId],
                event,
                cursor: event.sequence,
              }),
            ),
            Stream.flatMap((treeEvent) => {
              if (treeEvent.event._tag !== "ChildLinked") {
                return Stream.succeed(treeEvent)
              }
              const childRunId = treeEvent.event.childRunId
              const child = runtime
                .events({
                  runId: childRunId,
                  ...(input.cursors?.has(childRunId) ? { cursor: input.cursors.get(childRunId)! } : {}),
                })
                .pipe(
                  Stream.map(
                    (event): TreeEvent => ({
                      path: [input.rootRunId, childRunId],
                      event,
                      cursor: event.sequence,
                    }),
                  ),
                )
              return Stream.merge(Stream.succeed(treeEvent), child)
            }),
          ),
      ),
    ),
  )
