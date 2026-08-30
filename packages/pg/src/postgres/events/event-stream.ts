import { Effect, Schedule, Stream, SynchronizedRef } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { Cursor, Errors, RunEvent } from "tenetkit/runtime"
import type { EventHub } from "tenetkit/runtime/sql-driver"
import { NOTIFY_CHANNEL } from "../schema.js"

type EventsError = Errors.CursorExpired | Errors.RunNotFound | Errors.RuntimeUnavailable | Errors.SubscriberLagged

export const eventStream = (input: {
  readonly hub: EventHub
  readonly pg: PgClient.PgClient
  readonly runId: string
  readonly cursor: Cursor.Cursor
  readonly capacity: number
  readonly loadReplay: Effect.Effect<
    { readonly replay: ReadonlyArray<RunEvent.RunEvent>; readonly lastSequence: number },
    Errors.RunNotFound | Errors.RuntimeUnavailable
  >
  readonly loadAfter: (
    cursor: Cursor.Cursor,
  ) => Effect.Effect<ReadonlyArray<RunEvent.RunEvent>, Errors.RunNotFound | Errors.RuntimeUnavailable>
}): Stream.Stream<RunEvent.RunEvent, EventsError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const cursor = yield* SynchronizedRef.make<Cursor.Cursor>(input.cursor)
      const catchUp = SynchronizedRef.modifyEffect(cursor, (current) =>
        input.hub
          .catchUp({
            runId: input.runId,
            cursor: current,
            loadAfter: input.loadAfter(current),
          })
          .pipe(Effect.map((last) => [last, last] as const)),
      ).pipe(Effect.ignore)
      return input.hub.subscribe({
        runId: input.runId,
        cursor: input.cursor,
        loadReplay: input.loadReplay.pipe(Effect.tap(({ lastSequence }) => SynchronizedRef.set(cursor, lastSequence))),
        capacity: input.capacity,
        onSubscribed: Effect.gen(function* () {
          yield* Effect.forkScoped(catchUp.pipe(Effect.repeat(Schedule.spaced("1 second")), Effect.ignore))
          yield* input.pg.listen(NOTIFY_CHANNEL).pipe(
            Stream.runForEach((payload) => (payload !== input.runId ? Effect.void : catchUp)),
            Effect.ignore,
          )
        }),
      })
    }),
  )
