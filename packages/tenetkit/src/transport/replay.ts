import { Effect } from "effect"
import { type Cursor, origin } from "../runtime/cursor.js"
import { Runtime, type EventsError, type Service, type ResolveModelResponseError } from "../runtime/service.js"
import type { RunEvent } from "../runtime/run/event.js"
import { observerCodec } from "./wire.js"

/** @experimental One observer-encoded durable RunEvent. */
export interface Frame {
  readonly sequence: Cursor
  readonly data: string
}

/** @experimental A bounded replay result whose cursor advances only through returned frames. */
export interface Page {
  readonly frames: ReadonlyArray<Frame>
  readonly cursor: Cursor
  readonly hasMore: boolean
}

/** @experimental Input for one bounded durable replay read. */
export interface PageInput {
  readonly runId: string
  readonly cursor?: Cursor
  readonly limit: number
}

const resolve = (
  runtime: Service,
  event: RunEvent,
): Effect.Effect<import("./wire.js").ResolvedRunEvent, ResolveModelResponseError> =>
  event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
    ? runtime.resolveModelResponse(event).pipe(Effect.map((response) => ({ ...event, response })))
    : Effect.succeed(event)

/** @experimental Load and observer-encode one bounded page strictly after an exclusive cursor. */
export const page = (
  input: PageInput,
): Effect.Effect<Page, EventsError | ResolveModelResponseError | import("./errors.js").WireEncodeFailed, Runtime> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    const cursor = input.cursor ?? origin
    const loaded = yield* runtime.history({ runId: input.runId, cursor, limit: input.limit + 1 })
    const events = loaded.slice(0, input.limit)
    const frames = yield* Effect.forEach(events, (event) =>
      resolve(runtime, event).pipe(
        Effect.flatMap(observerCodec.encode),
        Effect.map((data) => ({ sequence: event.sequence, data })),
      ),
    )
    return {
      frames,
      cursor: frames.at(-1)?.sequence ?? cursor,
      hasMore: loaded.length > events.length,
    }
  })
