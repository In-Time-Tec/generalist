import { Effect } from "effect"
import { RuntimeUnavailable } from "../../errors.js"
import type { ExecutableManifest } from "../../executable/manifest.js"
import { decodePinned } from "../../executable/manifest-internal.js"
import type { EventRow } from "./rows.js"
import { decodeEvent } from "./codecs.js"

/** Authenticate the executable pin on each event read from the journal. */
export const decodePersistedEvents = (input: {
  readonly rows: ReadonlyArray<Pick<EventRow, "event_id" | "event_json">>
  readonly manifest: ExecutableManifest
}) =>
  Effect.forEach(input.rows, (row) =>
    Effect.try({
      try: () => {
        const event = decodeEvent(row.event_json)
        decodePinned({ ref: event.executableRef, manifest: input.manifest })
        return event
      },
      catch: (error) =>
        RuntimeUnavailable.make({ message: `invalid persisted Run event ${row.event_id}: ${String(error)}` }),
    }),
  )
