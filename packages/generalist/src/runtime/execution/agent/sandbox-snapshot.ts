import { Option, Schema } from "effect"
import { SnapshotId } from "../../../sandbox/service.js"
import type { RunEvent } from "../../run/event.js"

const SandboxSnapshot = Schema.TaggedStruct("SandboxSnapshot", { snapshotId: SnapshotId })

/** Select the newest restorable Sandbox image from the authoritative retained journal. */
export const latestSandboxSnapshotId = (events: ReadonlyArray<RunEvent>): string | undefined => {
  const latest = events.findLast((event) => event._tag === "ToolProgress" && event.message === "SandboxSnapshot")
  if (latest?._tag !== "ToolProgress") return undefined
  return Option.getOrUndefined(Schema.decodeUnknownOption(SandboxSnapshot)(latest.data))?.snapshotId
}
