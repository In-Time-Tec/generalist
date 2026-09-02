import { Schema } from "effect"
import { HostEvent } from "generalist/host"
import { Address, ExecutableManifest } from "generalist/runtime"

const executable = ExecutableManifest.makeTest("server", "1")

export const hostEvent = (cursor: number): HostEvent =>
  Schema.decodeSync(HostEvent)({
    _tag: "RunStarted",
    sessionId: "session-1",
    cursor,
    runId: "run-1",
    event: {
      _tag: "RunAccepted",
      specVersion: "1",
      eventId: `run-1:${cursor}`,
      runId: "run-1",
      sequence: cursor,
      executableRef: executable.ref,
      rootRunId: "run-1",
      depth: 0,
      occurredAt: "2026-09-02T00:00:00.000Z",
      messageId: `message-${cursor}`,
      address: Address.make("agent:server"),
    },
  })
