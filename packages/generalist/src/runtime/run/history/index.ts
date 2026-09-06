import { Effect } from "effect"
import { RuntimeUnavailable } from "../../errors.js"
import type { EventsError, Service } from "../../service.js"
import type { RunEvent } from "../event.js"

/** Collect a fixed snapshot journal in bounded requests; the resulting projection remains lossless. */
export const collect = Effect.fn("RunHistory.collect")(function* (
  runtime: Pick<Service, "history">,
  runId: string,
  through: number,
): Effect.fn.Return<ReadonlyArray<RunEvent>, EventsError> {
  const events: Array<RunEvent> = []
  let cursor = -1
  while (cursor < through) {
    const page = yield* runtime.history({ runId, cursor, limit: Math.min(1000, through - cursor) })
    const next = page.at(-1)?.sequence
    if (next === undefined || next <= cursor) {
      return yield* RuntimeUnavailable.make({ message: `Run ${runId} history did not advance after ${cursor}` })
    }
    for (const event of page) {
      if (event.sequence > cursor && event.sequence <= through) events.push(event)
    }
    cursor = next
  }
  return events
})
