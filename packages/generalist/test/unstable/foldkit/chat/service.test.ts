import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { HostEvent } from "generalist/host"
import { ExecutableManifest, RunEvent } from "generalist/runtime"
import { Chat, Connection } from "../../../../src/unstable/foldkit/index.js"

const executableRef = ExecutableManifest.makeTest("assistant", "1").ref
const runtimeEvent = <Fields extends object>(sequence: number, fields: Fields): RunEvent.RunEvent =>
  Schema.decodeUnknownSync(RunEvent.RunEvent)({
    specVersion: "1",
    eventId: `run-1:${sequence}`,
    runId: "run-1",
    sequence,
    executableRef,
    rootRunId: "run-1",
    depth: 0,
    occurredAt: "2026-09-02T00:00:00.000Z",
    ...fields,
  })

const hostEvent = (cursor: number, tag: HostEvent["_tag"], event: RunEvent.RunEvent): HostEvent =>
  Schema.decodeUnknownSync(HostEvent)({
    _tag: tag,
    sessionId: "session-1",
    cursor,
    runId: "run-1",
    event,
  })

const updateWith = (model: Chat.Model, event: Connection.Incoming) =>
  Chat.update(model, Chat.ReceivedConnection({ event }))

const searchCall = Response.makePart("tool-call", {
  id: "tool-1",
  name: "search",
  params: { query: "Generalist" },
  providerExecuted: false,
})

describe("Chat HostEvent projection", () => {
  it("tracks Session cursors and Runtime-owned tool state", () => {
    let model = Chat.initialModel("session-1")
    ;[model] = updateWith(model, hostEvent(3, "Turn", runtimeEvent(0, { _tag: "TurnStarted", turn: 0 })))
    ;[model] = updateWith(
      model,
      hostEvent(7, "ToolCall", runtimeEvent(1, { _tag: "ToolExecutionStarted", turn: 0, call: searchCall })),
    )

    expect(model.lastSeq).toBe(7)
    expect(model.run).toEqual({ _tag: "Running", turn: 0 })
    expect(model.entries[0]).toMatchObject({
      _tag: "ToolEntry",
      callId: "tool-1",
      phase: "executing",
      outcome: { _tag: "Pending" },
    })
  })

  it("projects approvals and terminal results", () => {
    let model = Chat.initialModel("session-1")
    let output: Option.Option<Chat.Output>
    ;[model, , output] = updateWith(
      model,
      hostEvent(
        5,
        "ApprovalRequested",
        runtimeEvent(1, {
          _tag: "ApprovalRequested",
          turn: 0,
          call: searchCall,
          request: {
            approvalId: "approval-1",
            operation: "tool-1",
            capability: "search",
            input: { query: "Generalist" },
          },
        }),
      ),
    )
    expect(model.run).toMatchObject({ _tag: "AwaitingApproval", token: "approval-1", toolName: "search" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "ApprovalRequired" })
    ;[model, , output] = updateWith(
      model,
      hostEvent(
        9,
        "Completed",
        runtimeEvent(2, {
          _tag: "RunCompleted",
          result: { text: "done", turns: 1, session: { sessionId: "session-1", leafId: "entry-1" } },
        }),
      ),
    )
    expect(model.lastSeq).toBe(9)
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunCompleted", text: "done" })
  })
})
