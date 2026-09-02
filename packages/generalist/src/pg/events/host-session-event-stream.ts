import { Effect, Schedule, Stream, SynchronizedRef } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { Cursor } from "../../runtime/cursor.js"
import type { HostSessionEvent, SessionNotFound } from "../../runtime/session/host.js"
import type { EventHub } from "../../runtime/sql-driver.js"
import type { RuntimeUnavailable } from "../../runtime/errors.js"
import { NOTIFY_CHANNEL } from "../schema.js"

export const hostSessionEventStream = (input: {
  readonly hub: EventHub
  readonly pg: PgClient.PgClient
  readonly sessionId: string
  readonly cursor: Cursor
  readonly capacity: number
  readonly loadReplay: Parameters<EventHub["subscribeHostSession"]>[0]["loadReplay"]
  readonly loadAfter: (
    cursor: Cursor,
  ) => Effect.Effect<ReadonlyArray<HostSessionEvent>, SessionNotFound | RuntimeUnavailable>
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const cursor = yield* SynchronizedRef.make<Cursor>(input.cursor)
      const catchUp = SynchronizedRef.modifyEffect(cursor, (current) =>
        input.hub
          .catchUpHostSession({
            sessionId: input.sessionId,
            cursor: current,
            loadAfter: input.loadAfter(current),
          })
          .pipe(Effect.map((last) => [last, last] as const)),
      ).pipe(Effect.ignore)
      return input.hub.subscribeHostSession({
        sessionId: input.sessionId,
        cursor: input.cursor,
        loadReplay: input.loadReplay.pipe(Effect.tap(({ lastCursor }) => SynchronizedRef.set(cursor, lastCursor))),
        capacity: input.capacity,
        onSubscribed: Effect.gen(function* () {
          yield* Effect.forkScoped(catchUp.pipe(Effect.repeat(Schedule.spaced("1 second")), Effect.ignore))
          yield* input.pg.listen(NOTIFY_CHANNEL).pipe(
            Stream.runForEach(() => catchUp),
            Effect.ignore,
          )
        }),
      })
    }),
  )
