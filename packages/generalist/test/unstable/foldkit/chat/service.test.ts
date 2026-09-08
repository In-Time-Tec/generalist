import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { HostEvent } from "generalist/host"
import { Address, ExecutableManifest, RunEvent } from "generalist/runtime"
import { Server } from "generalist/server"
import { Chat, Connection } from "../../../../src/unstable/foldkit/index.js"

const executable = ExecutableManifest.makeTest("assistant", "1")
const executableRef = executable.ref
const previewRun = {
  run: {
    runId: "run-1",
    status: "running" as const,
    executableRef,
    executableManifest: executable.manifest,
    depth: 0,
    treePolicy: { maxDepth: 1, maxSubagents: 1 },
    waits: [],
    lastSequence: -1,
    durability: "durable" as const,
    branches: [],
  },
  cursor: -1,
  turn: 0,
  usageFacts: [],
  budget: {},
  compactions: [],
  gates: [],
}
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

const updateWith = (model: Chat.Model, event: HostEvent, epoch = 0) =>
  Chat.update(model, Chat.ReceivedConnection({ event: Connection.HostDelivery({ epoch, event }) }))

const connectedModel = () =>
  Chat.update(
    Chat.initialModel("session-1"),
    Chat.ReceivedConnection({
      event: Connection.SessionSnapshot({
        epoch: 0,
        snapshot: {
          version: 1,
          session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
          cursor: -1,
          runs: [],
          conversation: { leafId: null, entries: [] },
        },
      }),
    }),
  )[0]

const connectedPreviewModel = () =>
  Chat.update(
    Chat.initialModel("session-1"),
    Chat.ReceivedConnection({
      event: Connection.SessionSnapshot({
        epoch: 0,
        snapshot: {
          version: 1,
          session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
          cursor: -1,
          runs: [previewRun],
          conversation: { leafId: null, entries: [] },
        },
      }),
    }),
  )[0]

const preview = (input: {
  readonly epoch: number
  readonly authority: number
  readonly generation?: number
  readonly sequence: number
  readonly offset: number
  readonly delta: string
}) =>
  Connection.PreviewDelivery({
    epoch: input.epoch,
    delivery: Server.PreviewDelivery.make({
      _tag: "PreviewDelivery",
      sessionId: "session-1",
      runId: "run-1",
      authorityAttemptFence: input.authority,
      event: {
        _tag: "ModelPreview",
        runId: "run-1",
        attemptFence: input.authority,
        turn: 0,
        modelCallId: `model-call:${input.authority}`,
        modelAttemptId: `model-attempt:${input.authority}`,
        attempt: 0,
        generation: input.generation ?? 1,
        sequence: input.sequence,
        changes: [{ channel: "text", offset: input.offset, delta: input.delta }],
      },
    }),
  })

const searchCall = Response.makePart("tool-call", {
  id: "tool-1",
  name: "search",
  params: { query: "Generalist" },
  providerExecuted: false,
})

describe("Chat HostEvent projection", () => {
  it("rejects obsolete previews after snapshot rebuild and bounds provisional ordering", () => {
    let model = connectedPreviewModel()
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 0, authority: 2, sequence: 0, offset: 0, delta: "old connection" }),
      }),
    )
    expect(model.preview?.text).toBe("old connection")

    const rebuilt = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: Connection.SessionSnapshot({
          epoch: 1,
          snapshot: {
            version: 1,
            session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
            cursor: 4,
            runs: [previewRun],
            conversation: { leafId: null, entries: [] },
          },
        }),
      }),
    )[0]
    expect(rebuilt.preview).toBeNull()
    ;[model] = Chat.update(
      rebuilt,
      Chat.ReceivedConnection({ event: preview({ epoch: 0, authority: 2, sequence: 1, offset: 14, delta: " stale" }) }),
    )
    expect(model).toEqual(rebuilt)
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({ event: preview({ epoch: 1, authority: 3, sequence: 0, offset: 0, delta: "current" }) }),
    )
    expect(model.preview).toMatchObject({ attemptFence: 3, sequence: 0, text: "current" })
    expect(Chat.conversationItems(model).at(-1)).toMatchObject({
      _tag: "PreviewConversationItem",
      attemptFence: 3,
      sequence: 0,
      entry: { _tag: "AssistantEntry", text: "current" },
    })

    const beforeHistoricalDelivery = model
    ;[model] = updateWith(
      model,
      hostEvent(
        4,
        "RunStarted",
        runtimeEvent(0, {
          _tag: "RunAccepted",
          messageId: "historical-message",
          address: Address.make("agent:assistant"),
        }),
      ),
      1,
    )
    expect(model).toEqual(beforeHistoricalDelivery)
    ;[model] = updateWith(model, hostEvent(4, "Turn", runtimeEvent(1, { _tag: "TurnCompleted", turn: 0 })), 1)
    expect(model).toEqual(beforeHistoricalDelivery)

    const current = model
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 2, sequence: 0, offset: 0, delta: "obsolete" }),
      }),
    )
    expect(model).toEqual(current)
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 3, sequence: 0, offset: 0, delta: "duplicate" }),
      }),
    )
    expect(model).toEqual(current)
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({ event: preview({ epoch: 1, authority: 3, sequence: 2, offset: 7, delta: "gap" }) }),
    )
    expect(model.preview).toBeNull()
    expect(model.entries).toEqual([])
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 3, sequence: 0, offset: 0, delta: "resurrected" }),
      }),
    )
    expect(model.preview).toBeNull()
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 4, sequence: 0, offset: 0, delta: "new attempt" }),
      }),
    )
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 4, sequence: 1, offset: 0, delta: "bad offset" }),
      }),
    )
    expect(model.preview).toBeNull()
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 5, sequence: 0, offset: 0, delta: "committing" }),
      }),
    )
    ;[model] = updateWith(
      model,
      hostEvent(
        5,
        "Completed",
        runtimeEvent(5, {
          _tag: "RunCompleted",
          result: {
            text: "committed",
            output: "committed",
            turns: 1,
            session: { sessionId: "session-1", leafId: "entry-1" },
          },
        }),
      ),
      1,
    )
    expect(model.preview).toBeNull()
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 5, sequence: 0, offset: 0, delta: "after commit" }),
      }),
    )
    expect(model.preview).toBeNull()

    const chunk = "x".repeat(4_096)
    for (let sequence = 0; sequence <= 16; sequence += 1) {
      ;[model] = Chat.update(
        model,
        Chat.ReceivedConnection({
          event: preview({ epoch: 1, authority: 6, sequence, offset: sequence * chunk.length, delta: chunk }),
        }),
      )
    }
    expect(model.preview).toBeNull()
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({
        event: preview({ epoch: 1, authority: 7, sequence: 0, offset: 0, delta: "disconnecting" }),
      }),
    )
    ;[model] = Chat.update(
      model,
      Chat.ReceivedConnection({ event: Connection.ConnectionLost({ sessionId: "session-1", epoch: 1 }) }),
    )
    expect(model.preview).toBeNull()
  })
  it("restores committed terminal summaries and ignores snapshots and events from older epochs", () => {
    const restoredExecutable = ExecutableManifest.makeTest("assistant", "1")
    const snapshot = Schema.decodeSync(Server.SessionSnapshot)({
      version: 1,
      session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
      cursor: 12,
      conversation: {
        leafId: "entry-1",
        entries: [
          {
            id: "entry-1",
            parentId: null,
            messages: [
              Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: "Existing answer" })] }),
            ],
          },
        ],
      },
      runs: [
        {
          run: {
            runId: "run-1",
            status: "succeeded",
            executableRef: restoredExecutable.ref,
            executableManifest: restoredExecutable.manifest,
            depth: 0,
            treePolicy: { maxDepth: 1, maxSubagents: 1 },
            waits: [],
            lastSequence: 8,
            durability: "durable",
            branches: [],
          },
          cursor: 8,
          turn: 1,
          usageFacts: [],
          budget: {},
          compactions: [],
          gates: [],
          outcome: {
            _tag: "Succeeded",
            eventId: "run-1:8",
            occurredAt: "2026-09-02T00:00:00.000Z",
            result: {
              text: "Existing answer",
              output: "Existing answer",
              turns: 1,
              session: { sessionId: "session-1", leafId: "entry-1" },
            },
          },
        },
      ],
    })
    const [model, commands, output] = Chat.update(
      Chat.initialModel("session-1"),
      Chat.ReceivedConnection({ event: Connection.SessionSnapshot({ epoch: 2, snapshot }) }),
    )
    expect(model).toMatchObject({
      connectionEpoch: 2,
      lastSeq: 12,
      run: { _tag: "Idle" },
      entries: [{ _tag: "AssistantEntry", text: "Existing answer" }],
    })
    expect(commands).toEqual([])
    expect(Option.isNone(output)).toBe(true)
    const stale = [
      Connection.SessionSnapshot({ epoch: 1, snapshot: { ...snapshot, cursor: 999, runs: [] } }),
      Connection.HostDelivery({
        epoch: 1,
        event: hostEvent(999, "Turn", runtimeEvent(9, { _tag: "TurnStarted", turn: 99 })),
      }),
      Connection.ConnectionLost({ epoch: 1, sessionId: "session-1" }),
      Connection.HostDelivery({
        epoch: 2,
        event: hostEvent(12, "Turn", runtimeEvent(9, { _tag: "TurnStarted", turn: 99 })),
      }),
      Connection.SessionSnapshot({
        epoch: 3,
        snapshot: { ...snapshot, session: { ...snapshot.session, id: "other-session" } },
      }),
    ]
    for (const event of stale) expect(Chat.update(model, Chat.ReceivedConnection({ event }))[0]).toEqual(model)
    const resumed = Connection.HostDelivery({
      epoch: 2,
      event: hostEvent(20, "Turn", runtimeEvent(10, { _tag: "TurnStarted", turn: 2 })),
    })
    expect(Chat.update(model, Chat.ReceivedConnection({ event: resumed }))[0]).toMatchObject({
      connectionEpoch: 2,
      lastSeq: 20,
      run: { _tag: "Running", turn: 2 },
    })
  })

  it("rebuilds a deleted client projection from the authoritative Session snapshot", () => {
    const restoredExecutable = ExecutableManifest.makeTest("assistant", "1")
    const snapshot = Schema.decodeSync(Server.SessionSnapshot)({
      version: 1,
      session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
      cursor: 8,
      conversation: {
        leafId: "entry-1",
        entries: [
          {
            id: "entry-1",
            parentId: null,
            messages: [
              Prompt.makeMessage("assistant", {
                content: [Prompt.makePart("text", { text: "rebuilt answer" })],
              }),
            ],
          },
        ],
      },
      runs: [
        {
          run: {
            runId: "run-1",
            status: "succeeded",
            executableRef: restoredExecutable.ref,
            executableManifest: restoredExecutable.manifest,
            depth: 0,
            treePolicy: { maxDepth: 1, maxSubagents: 1 },
            waits: [],
            lastSequence: 4,
            durability: "durable",
            branches: [],
          },
          cursor: 4,
          turn: 1,
          usageFacts: [],
          budget: {},
          compactions: [],
          gates: [],
          outcome: {
            _tag: "Succeeded",
            eventId: "run-1:4",
            occurredAt: "2026-09-02T00:00:00.000Z",
            result: {
              text: "rebuilt answer",
              output: "rebuilt answer",
              turns: 1,
              session: { sessionId: "session-1", leafId: "entry-1" },
            },
          },
        },
      ],
    })
    const rebuild = (epoch: number) =>
      Chat.update(
        Chat.initialModel("session-1"),
        Chat.ReceivedConnection({ event: Connection.SessionSnapshot({ epoch, snapshot }) }),
      )
    const [original, originalCommands] = rebuild(1)
    const deleted = Chat.initialModel("session-1")
    expect(deleted.entries).toEqual([])
    const [rebuilt, rebuiltCommands] = rebuild(2)
    expect(rebuilt).toMatchObject({
      connectionEpoch: 2,
      lastSeq: 8,
      run: { _tag: "Idle" },
      entries: [{ _tag: "AssistantEntry", text: "rebuilt answer" }],
    })
    expect(rebuilt.entries).toEqual(original.entries)
    expect(originalCommands).toEqual([])
    expect(rebuiltCommands).toEqual([])
    expect(
      Chat.update(
        rebuilt,
        Chat.ReceivedConnection({
          event: Connection.HostDelivery({
            epoch: 1,
            event: hostEvent(99, "Turn", runtimeEvent(5, { _tag: "TurnStarted", turn: 99 })),
          }),
        }),
      )[0],
    ).toEqual(rebuilt)
  })

  it("tracks Session cursors and Runtime-owned tool state", () => {
    let model = connectedModel()
    ;[model] = updateWith(model, hostEvent(3, "Turn", runtimeEvent(0, { _tag: "TurnStarted", turn: 0 })))
    ;[model] = updateWith(model, {
      _tag: "Conversation",
      sessionId: "session-1",
      cursor: 4,
      update: {
        previousLeafId: null,
        leafId: "entry-call",
        afterEntryId: null,
        entries: [
          {
            id: "entry-call",
            parentId: null,
            messages: [
              Prompt.makeMessage("assistant", {
                content: [
                  Prompt.makePart("tool-call", {
                    id: "tool-1",
                    name: "search",
                    params: { query: "Generalist" },
                    providerExecuted: false,
                  }),
                ],
              }),
            ],
          },
        ],
      },
    })
    ;[model] = updateWith(
      model,
      hostEvent(7, "ToolCall", runtimeEvent(1, { _tag: "ToolExecutionStarted", turn: 0, call: searchCall })),
    )

    expect(model.lastSeq).toBe(7)
    expect(model.run).toEqual({ _tag: "Running", turn: 0 })
    expect(model.entries[0]).toMatchObject({
      _tag: "ToolEntry",
      callId: '["entry-call","tool-1"]',
      phase: "executing",
      outcome: { _tag: "Pending" },
    })
  })

  it("projects approvals and terminal results", () => {
    let model = connectedModel()
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
          result: {
            text: "done",
            output: "done",
            turns: 1,
            session: { sessionId: "session-1", leafId: "entry-1" },
          },
        }),
      ),
    )
    expect(model.lastSeq).toBe(9)
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunCompleted", text: "done" })
  })

  it("renders a committed assistant result once when its completion is replayed", () => {
    const completed = hostEvent(
      9,
      "Completed",
      runtimeEvent(2, {
        _tag: "RunCompleted",
        result: {
          text: "Committed answer",
          output: "Committed answer",
          turns: 1,
          session: { sessionId: "session-1", leafId: "entry-1" },
        },
      }),
    )
    const [committed] = updateWith(connectedModel(), {
      _tag: "Conversation",
      sessionId: "session-1",
      cursor: 8,
      update: {
        previousLeafId: null,
        leafId: "entry-1",
        afterEntryId: null,
        entries: [
          {
            id: "entry-1",
            parentId: null,
            messages: [
              Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: "Committed answer" })] }),
            ],
          },
        ],
      },
    })
    const [model, , output] = updateWith(committed, completed)
    expect(model.entries).toEqual([Chat.AssistantEntry({ text: "Committed answer", reasoning: null })])
    expect(Option.getOrUndefined(output)).toEqual(Chat.RunCompleted({ text: "Committed answer" }))
    const [replayed, , duplicateOutput] = updateWith(model, completed)
    expect(replayed.entries).toEqual(model.entries)
    expect(Option.isNone(duplicateOutput)).toBe(true)
  })

  it("does not append an answer already present in the snapshot taken before RunCompleted", () => {
    const [snapshotModel] = Chat.update(
      Chat.initialModel("session-1"),
      Chat.ReceivedConnection({
        event: Connection.SessionSnapshot({
          epoch: 0,
          snapshot: {
            version: 1,
            session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
            cursor: 8,
            runs: [],
            conversation: {
              leafId: "answer",
              entries: [
                {
                  id: "answer",
                  parentId: null,
                  messages: [
                    Prompt.makeMessage("assistant", {
                      content: [Prompt.makePart("text", { text: "snapshot answer" })],
                    }),
                  ],
                },
              ],
            },
          },
        }),
      }),
    )
    const [completed] = updateWith(
      snapshotModel,
      hostEvent(
        9,
        "Completed",
        runtimeEvent(2, {
          _tag: "RunCompleted",
          result: {
            text: "snapshot answer",
            output: "snapshot answer",
            turns: 1,
            session: { sessionId: "session-1", leafId: "answer" },
          },
        }),
      ),
    )
    expect(completed.entries).toEqual([Chat.AssistantEntry({ text: "snapshot answer", reasoning: null })])
    expect(completed.conversation).toEqual(snapshotModel.conversation)
  })

  it("does not let child Run completion replace the root conversation or status", () => {
    const [running] = updateWith(
      connectedModel(),
      hostEvent(1, "Turn", runtimeEvent(0, { _tag: "TurnStarted", turn: 0 })),
    )
    const [model, , output] = updateWith(
      running,
      Schema.decodeUnknownSync(HostEvent)({
        _tag: "Completed",
        sessionId: "session-1",
        cursor: 2,
        runId: "child",
        event: runtimeEvent(1, {
          _tag: "RunCompleted",
          runId: "child",
          parentRunId: "run-1",
          depth: 1,
          result: {
            text: "child answer",
            output: "child answer",
            turns: 1,
            session: { sessionId: "child-session", leafId: "child-answer" },
          },
        }),
      }),
    )
    expect(model.run).toEqual(running.run)
    expect(model.entries).toEqual([])
    expect(model.lastSeq).toBe(2)
    expect(Option.isNone(output)).toBe(true)
  })
})
