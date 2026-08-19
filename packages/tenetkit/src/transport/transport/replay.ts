import { Effect } from "effect"
import { Cursor, Runtime } from "tenetkit/runtime"
import type { RunEvent } from "tenetkit/runtime"
import { observerCodec } from "./wire.js"

/** @experimental One observer-encoded durable RunEvent. */
export interface Frame {
  readonly sequence: Cursor.Cursor
  readonly data: string
}

/** @experimental A bounded replay result whose cursor advances only through returned frames. */
export interface Page {
  readonly frames: ReadonlyArray<Frame>
  readonly cursor: Cursor.Cursor
  readonly hasMore: boolean
}

/** @experimental Input for one bounded durable replay read. */
export interface PageInput {
  readonly runId: string
  readonly cursor?: Cursor.Cursor
  readonly limit: number
}

const resolve = (
  runtime: Runtime.Interface,
  event: RunEvent.RunEvent,
): Effect.Effect<import("./wire.js").ResolvedRunEvent, Runtime.ResolveModelResponseError> =>
  event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
    ? runtime.resolveModelResponse(event).pipe(Effect.map((response) => ({ ...event, response })))
    : Effect.succeed(event)

/** @experimental Load and observer-encode one bounded page strictly after an exclusive cursor. */
export const page = (
  input: PageInput,
): Effect.Effect<
  Page,
  Runtime.EventsError | Runtime.ResolveModelResponseError | import("./errors.js").WireEncodeFailed,
  Runtime.Runtime
> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const cursor = input.cursor ?? Cursor.origin
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
