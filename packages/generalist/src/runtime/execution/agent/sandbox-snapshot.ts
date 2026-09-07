import { Option, Schema } from "effect"
import { SnapshotId } from "../../../sandbox/service.js"
import type { RunEvent } from "../../run/event.js"

const SandboxSnapshot = Schema.TaggedStruct("SandboxSnapshot", { snapshotId: SnapshotId })

/** Select the newest restorable Sandbox image from the authoritative retained journal. */
export const latestSandboxSnapshotId = (events: ReadonlyArray<RunEvent>): string | undefined => {
  let cutoff = Number.POSITIVE_INFINITY
  for (const event of events.toReversed()) {
    if (event.sequence > cutoff) continue
    if (event._tag === "RunRewound") {
      cutoff = event.toSequence
      continue
    }
    if (event._tag !== "ToolProgress" || event.message !== "SandboxSnapshot") continue
    return Option.getOrUndefined(Schema.decodeUnknownOption(SandboxSnapshot)(event.data))?.snapshotId
  }
  return undefined
}
