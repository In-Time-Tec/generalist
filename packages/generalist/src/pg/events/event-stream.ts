import { Effect, Schedule, Stream, SynchronizedRef } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { Cursor } from "../../runtime/cursor.js"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../../runtime/errors.js"
import { RunEvent } from "../../runtime/run/event.js"
import type { EventHub } from "../../runtime/sql-driver.js"
import { NOTIFY_CHANNEL } from "../schema.js"

type EventsError = CursorExpired | RunNotFound | RuntimeUnavailable | SubscriberLagged

export const eventStream = (input: {
  readonly hub: EventHub
  readonly pg: PgClient.PgClient
  readonly runId: string
  readonly cursor: Cursor
  readonly capacity: number
  readonly loadReplay: Effect.Effect<
    { readonly replay: ReadonlyArray<RunEvent>; readonly lastSequence: number },
    RunNotFound | RuntimeUnavailable
  >
  readonly loadAfter: (cursor: Cursor) => Effect.Effect<ReadonlyArray<RunEvent>, RunNotFound | RuntimeUnavailable>
}): Stream.Stream<RunEvent, EventsError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const cursor = yield* SynchronizedRef.make<Cursor>(input.cursor)
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
