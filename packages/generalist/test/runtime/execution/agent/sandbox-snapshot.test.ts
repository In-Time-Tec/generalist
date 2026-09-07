import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { latestSandboxSnapshotId } from "../../../../src/runtime/execution/agent/sandbox-snapshot.js"
import { RunEvent } from "../../../../src/runtime/run/event.js"
import { assistantRef } from "../fixtures.js"

const base = (sequence: number) => ({
  specVersion: "1",
  eventId: `snapshot-run:${sequence}`,
  runId: "snapshot-run",
  rootRunId: "snapshot-run",
  sequence,
  executableRef: assistantRef.ref,
  depth: 0,
  occurredAt: "2026-09-07T00:00:00.000Z",
})
const snapshot = (sequence: number, snapshotId: string) =>
  Schema.decodeUnknownSync(RunEvent)({
    ...base(sequence),
    _tag: "ToolProgress",
    turn: 0,
    toolCallId: "cell",
    message: "SandboxSnapshot",
    data: { _tag: "SandboxSnapshot", snapshotId },
  })
const rewind = (sequence: number, toSequence: number) =>
  Schema.decodeUnknownSync(RunEvent)({
    ...base(sequence),
    _tag: "RunRewound",
    toSequence,
    branchRunId: `archive-${sequence}`,
  })

it("selects the rewind prefix without deleting later retained snapshots", () => {
  const history = [snapshot(1, "first"), snapshot(2, "second"), rewind(3, 1)]
  expect(latestSandboxSnapshotId(history)).toBe("first")
  expect(history).toHaveLength(3)
  expect(latestSandboxSnapshotId([...history, rewind(4, 2)])).toBe("second")
})

it("prefers a new snapshot on the selected branch", () => {
  expect(
    latestSandboxSnapshotId([snapshot(1, "first"), snapshot(2, "abandoned"), rewind(3, 1), snapshot(4, "new-branch")]),
  ).toBe("new-branch")
})

it("has no inherited image when the selected prefix precedes all snapshots", () => {
  expect(latestSandboxSnapshotId([snapshot(1, "abandoned"), rewind(2, 0)])).toBeUndefined()
})
