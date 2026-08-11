import { Effect, Ref, Stream } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { Cursor } from "../../cursor.js"
import type { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../../errors.js"
import type { RunEvent } from "../../run-event.js"
import type { EventHub } from "../subscribers.js"
import { NOTIFY_CHANNEL } from "./schema.js"

type EventsError = CursorExpired | RunNotFound | RuntimeUnavailable | SubscriberLagged

export const makeEventStream = (input: {
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
      const cursor = yield* Ref.make<Cursor>(input.cursor)
      return input.hub.subscribe({
        runId: input.runId,
        cursor: input.cursor,
        loadReplay: input.loadReplay.pipe(Effect.tap(({ lastSequence }) => Ref.set(cursor, lastSequence))),
        capacity: input.capacity,
        onSubscribed: input.pg.listen(NOTIFY_CHANNEL).pipe(
          Stream.runForEach((payload) => {
            if (payload !== input.runId) return Effect.void
            return Ref.get(cursor).pipe(
              Effect.flatMap(input.loadAfter),
              Effect.flatMap((events) =>
                Effect.forEach(
                  events,
                  (event) =>
                    input.hub.publish(input.runId, event).pipe(Effect.andThen(Ref.set(cursor, event.sequence))),
                  { discard: true },
                ),
              ),
              Effect.ignore,
            )
          }),
          Effect.ignore,
        ),
      })
    }),
  )
