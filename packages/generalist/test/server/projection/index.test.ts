import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { HostEvent, PreviewDelivery } from "generalist/host"
import { Errors, ExecutableManifest, RunWait } from "generalist/runtime"
import { ClientEvent, ClientSession, ClientSessionSnapshot, Server, type ClientRunSummary } from "generalist/server"
import { clientProjection } from "../../../src/server/projection/index.js"
import type { RuntimeInspection } from "../../../src/runtime/engine.js"
import { hostEvent } from "../fixtures.js"

const {
  clientToolName,
  projectClientApprovalSummary,
  projectClientBudget,
  projectClientConversation,
  projectClientConversationEntry,
  projectClientConversationUpdate,
  projectClientEvent,
  projectClientHistoryPage,
  projectClientPreview,
  projectClientRun,
  projectClientRunStatus,
  projectClientRunSummary,
  projectClientRunsPage,
  projectClientSession,
  projectClientSnapshot,
  projectClientUsage,
  projectClientWait,
} = clientProjection

const pinned = ExecutableManifest.makeTest("private-agent", "private-revision")
const marker = "A10_PRIVATE_RECOVERY_MARKER"
const privateManifest = {
  ...pinned.manifest,
  entries: pinned.manifest.entries.map((entry) =>
    entry._tag === "Agent" ? { ...entry, manifest: { ...entry.manifest, instructions: marker } } : entry,
  ),
}
const selection = {
  executableRef: pinned.ref,
  executableManifest: privateManifest,
  registrations: [
    {
      pin: "private-pin",
      codec: "generalist/runtime/registered-agent",
      version: "1",
      payload: { credential: marker, revision: "public-revision" },
    },
  ],
}

const runSummary = (runId: string): ClientRunSummary => ({
  runId,
  rootRunId: runId,
  agent: { name: "private-agent", revision: "public-revision" },
  status: "running",
  cursor: "4",
  turn: 1,
})

const searchCall = Response.makePart("tool-call", {
  id: "tool-1",
  name: "search",
  params: { query: "Generalist" },
  providerExecuted: false,
})
const promptSearchCall = Prompt.makePart("tool-call", {
  id: "tool-1",
  name: "search",
  params: { query: "Generalist" },
  providerExecuted: false,
})

const runEventFields = {
  specVersion: "1" as const,
  eventId: "run-1:5",
  runId: "run-1",
  sequence: 5,
  executableRef: pinned.ref,
  rootRunId: "run-1",
  depth: 0,
  occurredAt: "2026-09-12T00:00:00.000Z",
}

describe("Client transport projection", () => {
  it("allowlists Session and queue fields from internal recovery records", () => {
    const source = {
      id: "session-1",
      title: "Visible title",
      createdAt: "2026-09-12T00:00:00.000Z",
      selection,
      queue: [
        {
          id: "queued-1",
          revision: 2,
          prompt: Prompt.make("Visible prompt"),
          selection,
          from: { user: "reader-1" },
          ownerId: marker,
        },
        {
          id: "queued-agent",
          revision: 1,
          prompt: Prompt.make("Agent follow-up"),
          selection,
          from: { runId: "run-parent" },
        },
        {
          id: "queued-system",
          revision: 1,
          prompt: Prompt.make("System follow-up"),
          selection,
          from: { system: true as const },
        },
        {
          id: "queued-direct",
          revision: 1,
          prompt: Prompt.make("Direct follow-up"),
          selection,
        },
      ],
      activeRunId: "run-1",
      executableManifest: privateManifest,
      claim: { ownerId: marker, epoch: 3, fence: 7 },
      checkpointPath: `/private/${marker}`,
      providerResourceRef: marker,
      credential: marker,
      signedUrl: `https://storage.test/private?signature=${marker}`,
      novelPrivateField: marker,
    }
    const projected = projectClientSession(source)
    expect(projected).toMatchObject({
      id: "session-1",
      title: "Visible title",
      lifecycle: "active",
      selectedAgent: { name: "private-agent", revision: "public-revision" },
      queue: [
        {
          id: "queued-1",
          revision: 2,
          from: { kind: "user", id: "reader-1" },
          agent: { name: "private-agent", revision: "public-revision" },
        },
        {
          id: "queued-agent",
          from: { kind: "agent", id: "run-parent" },
        },
        {
          id: "queued-system",
          from: { kind: "system" },
        },
        {
          id: "queued-direct",
        },
      ],
      activeRunId: "run-1",
    })
    const bytes = Schema.encodeSync(Schema.fromJsonString(ClientSession))(projected)
    for (const forbidden of [
      marker,
      "selection",
      "executableRef",
      "executableManifest",
      "registrations",
      "claim",
      "ownerId",
      "epoch",
      "fence",
      "checkpointPath",
      "providerResourceRef",
      "credential",
      "signedUrl",
      "novelPrivateField",
    ]) {
      expect(bytes).not.toContain(forbidden)
    }
  })

  it("projects committed events and previews without their internal envelopes", () => {
    const committed = Option.getOrThrow(
      projectClientEvent("session-1", hostEvent(4), { name: "private-agent", revision: "public-revision" }),
    )
    expect(committed).toEqual({
      _tag: "RunChanged",
      sessionId: "session-1",
      cursor: "4",
      run: {
        runId: "run-1",
        rootRunId: "run-1",
        agent: { name: "private-agent", revision: "public-revision" },
        status: "pending",
        cursor: "4",
        turn: 0,
      },
    })
    const committedBytes = Schema.encodeSync(Schema.fromJsonString(ClientEvent))(committed)
    expect(committedBytes).not.toContain("executableRef")
    expect(committedBytes).not.toContain("messageId")
    expect(committedBytes).not.toContain("address")

    const delivery = Schema.decodeSync(PreviewDelivery)({
      _tag: "PreviewDelivery",
      sessionId: "session-1",
      runId: "run-1",
      authorityAttemptFence: 19,
      event: {
        _tag: "ModelPreview",
        runId: "run-1",
        attemptFence: 19,
        turn: 3,
        modelCallId: marker,
        modelAttemptId: marker,
        attempt: 2,
        generation: 7,
        sequence: 5,
        changes: [
          { channel: "reasoning", offset: 0, delta: "analysis" },
          { channel: "text", offset: 8, delta: "answer" },
        ],
      },
    })
    const previews = projectClientPreview(delivery)
    expect(previews).toEqual([
      {
        _tag: "Preview",
        sessionId: "session-1",
        runId: "run-1",
        attempt: 2,
        sequence: 5,
        channel: "analysis",
        append: "analysis",
      },
      {
        _tag: "Preview",
        sessionId: "session-1",
        runId: "run-1",
        attempt: 2,
        sequence: 5,
        channel: "final",
        append: "answer",
        droppedBefore: 8,
      },
    ])
    const previewBytes = JSON.stringify(previews)
    for (const forbidden of [marker, "authorityAttemptFence", "attemptFence", "generation", "modelCallId"]) {
      expect(previewBytes).not.toContain(forbidden)
    }
  })

  it("drops preview tombstones rather than exposing authority metadata", () => {
    const cleared = Schema.decodeSync(PreviewDelivery)({
      _tag: "PreviewDelivery",
      sessionId: "session-1",
      runId: "run-1",
      authorityAttemptFence: 20,
      event: { _tag: "ModelPreviewCleared", runId: "run-1", attemptFence: 20, generation: 8 },
    })
    expect(projectClientPreview(cleared)).toEqual([])
  })

  it("projects conversation pages and run pages without copying source extras", () => {
    const entry = {
      id: "entry-1",
      parentId: null,
      messages: [Prompt.makeMessage("assistant", { content: [promptSearchCall] })],
      contentDeferred: true as const,
      checkpointPath: marker,
    }
    const conversation = { leafId: entry.id, entries: [entry], nextLeafId: "entry-0", novel: marker }
    expect(projectClientConversationEntry(entry)).toEqual({
      id: entry.id,
      parentId: null,
      messages: entry.messages,
      contentDeferred: true,
    })
    expect(projectClientConversation(conversation)).toEqual({
      leafId: entry.id,
      entries: [projectClientConversationEntry(entry)],
      nextLeafId: "entry-0",
    })
    expect(clientToolName(conversation, promptSearchCall.id)).toBe(promptSearchCall.name)
    expect(clientToolName(conversation, "missing")).toBeUndefined()
    const update = {
      previousLeafId: null,
      leafId: entry.id,
      afterEntryId: null,
      entries: [entry],
      reset: true as const,
      nextLeafId: "entry-0",
      providerResourceRef: marker,
    }
    expect(projectClientConversationUpdate(update)).toEqual({
      previousLeafId: null,
      leafId: entry.id,
      afterEntryId: null,
      entries: [projectClientConversationEntry(entry)],
      reset: true,
      nextLeafId: "entry-0",
    })
    expect(projectClientHistoryPage({ leafId: entry.id, entries: [entry], nextLeafId: null })).toEqual({
      entries: [projectClientConversationEntry(entry)],
      nextLeafId: null,
    })

    const internalSummary = {
      runId: "run-1",
      rootRunId: "run-root",
      parentRunId: "run-parent",
      status: "waiting" as const,
      cursor: 7,
      turn: 2,
      approval: {
        approvalId: "approval-1",
        capability: "search",
        operation: "Search the index",
        input: { credential: marker },
      },
    }
    const identity = { name: "private-agent", revision: "public-revision" }
    expect(projectClientApprovalSummary(internalSummary.approval)).toEqual({
      id: "approval-1",
      tool: "search",
      summary: "Search the index",
    })
    const projectedSummary = projectClientRunSummary(internalSummary, identity)
    expect(projectedSummary).toEqual({
      runId: "run-1",
      rootRunId: "run-root",
      parentRunId: "run-parent",
      agent: identity,
      status: "waiting",
      cursor: "7",
      turn: 2,
      approval: { id: "approval-1", tool: "search", summary: "Search the index" },
    })
    expect(
      projectClientRunsPage({ at: 9, runs: [internalSummary], nextBefore: 3 }, new Map([["run-1", identity]])),
    ).toEqual({
      at: "9",
      runs: [projectedSummary],
      nextBefore: "3",
    })
    const session = {
      id: "session-1",
      createdAt: "2026-09-12T00:00:00.000Z",
      lifecycle: "stopped" as const,
      sponsorRunId: "sponsor-1",
      selection,
      queue: [],
    }
    expect(
      projectClientSnapshot(
        { version: 1, session, cursor: 9, runs: [internalSummary], conversation },
        new Map([["run-1", identity]]),
      ),
    ).toEqual({
      version: 1,
      session: {
        id: "session-1",
        createdAt: session.createdAt,
        lifecycle: "stopped",
        sponsorRunId: "sponsor-1",
        selectedAgent: identity,
        queue: [],
      },
      cursor: "9",
      runs: [projectedSummary],
      conversation: projectClientConversation(conversation),
    })
    expect(() => projectClientRunsPage({ at: 9, runs: [internalSummary], nextBefore: null }, new Map())).toThrow(
      "Missing Client Agent identity",
    )
  })

  it("projects every Run status, budget, usage, and wait kind", () => {
    const statuses = [
      "queued",
      "running",
      "waiting",
      "needs-resolution",
      "cancelling",
      "succeeded",
      "failed",
      "cancelled",
    ] as const
    expect(statuses.map(projectClientRunStatus)).toEqual([
      "pending",
      "running",
      "waiting",
      "waiting",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ])
    const waitReasons = [
      {
        _tag: "Approval" as const,
        request: { approvalId: "approval", capability: "search", operation: "Search", input: {} },
      },
      { _tag: "Signal" as const, name: "resume" },
      { _tag: "ToolWait" as const },
      {
        _tag: "AwaitEvent" as const,
        filter: { _tag: "ChildCompleted" as const },
        deadline: "2026-09-13T00:00:00.000Z",
      },
      { _tag: "Timer" as const },
      { _tag: "External" as const, capability: "external-write" },
    ]
    const waits = waitReasons.map((reason, index) =>
      RunWait.RunWait.make({
        waitId: `wait-${index}`,
        reason,
        status: "open",
        openedAt: "2026-09-12T00:00:00.000Z",
      }),
    )
    expect(waits.map((wait) => projectClientWait(wait, 11).kind)).toEqual([
      "approval",
      "signal",
      "tool",
      "child",
      "external",
      "external",
    ])
    expect(projectClientBudget({ tokens: 100, usd: "unknown", duration: 500, toolCalls: 3, children: 2 })).toEqual({
      tokens: 100,
      usd: "unknown",
      duration: 500,
      toolCalls: 3,
      children: 2,
    })
    expect(projectClientUsage({ inputTokens: 7, outputTokens: 5 })).toEqual({ inputTokens: 7, outputTokens: 5 })
    const inspection: RuntimeInspection = {
      runId: "run-child",
      status: "needs-resolution",
      executableRef: pinned.ref,
      executableManifest: pinned.manifest,
      parentRunId: "run-parent",
      depth: 1,
      treePolicy: { maxDepth: 4, maxSessions: 8, concurrency: { agents: 2, tools: 3 } },
      waits: [Option.getOrThrow(Option.fromNullishOr(waits[5]))],
      lastSequence: 11,
      durability: "durable",
      branches: [],
      revision: "public-revision",
      waitOpenedAtSequence: { "wait-5": 9 },
      turn: 2,
      usage: { inputTokens: 7, outputTokens: 5 },
      usageFacts: [],
      activeTools: [marker],
      elapsed: 50,
      budget: { tokens: 100, usd: "unknown", duration: 500, toolCalls: 3, children: 2 },
      gates: [],
      children: [],
    }
    const enrichedInspection = {
      ...inspection,
      ownerId: marker,
      epoch: 3,
      attemptFence: 7,
      checkpointPath: `/private/${marker}`,
      providerResourceRef: marker,
      credential: marker,
      signedUrl: `https://storage.test/private?signature=${marker}`,
      novelPrivateField: marker,
    }
    const projected = projectClientRun(enrichedInspection, {
      sessionId: "session-1",
      rootRunId: "run-root",
    })
    expect(projected).toEqual({
      runId: "run-child",
      sessionId: "session-1",
      rootRunId: "run-root",
      parentRunId: "run-parent",
      agent: { name: "private-agent", revision: "public-revision" },
      status: "waiting",
      durability: "durable",
      depth: 1,
      turn: 2,
      lastSequence: 11,
      budget: { tokens: 100, usd: "unknown", duration: 500, toolCalls: 3, children: 2 },
      usage: { inputTokens: 7, outputTokens: 5 },
      waits: [{ id: "wait-5", kind: "external", openedAtSequence: 9 }],
    })
    const bytes = JSON.stringify(projected)
    for (const forbidden of [
      marker,
      "ownerId",
      "epoch",
      "attemptFence",
      "checkpointPath",
      "providerResourceRef",
      "credential",
      "signedUrl",
      "novelPrivateField",
    ]) {
      expect(bytes).not.toContain(forbidden)
    }
  })

  it("maps conversation, approval, and tool events to their public variants", () => {
    const conversation = {
      leafId: "entry-1",
      entries: [
        { id: "entry-1", parentId: null, messages: [Prompt.makeMessage("assistant", { content: [promptSearchCall] })] },
      ],
    }
    const changed = Schema.decodeSync(HostEvent)({
      _tag: "Conversation",
      sessionId: "session-1",
      cursor: 4,
      update: { previousLeafId: null, leafId: "entry-1", afterEntryId: null, entries: conversation.entries },
    })
    expect(Option.getOrThrow(projectClientEvent("session-1", changed))).toMatchObject({
      _tag: "ConversationChanged",
      cursor: "4",
    })
    const started = Schema.decodeSync(HostEvent)({
      _tag: "ToolCall",
      sessionId: "session-1",
      cursor: 5,
      runId: "run-1",
      event: { ...runEventFields, _tag: "ToolExecutionStarted", turn: 0, call: searchCall },
    })
    expect(Option.getOrThrow(projectClientEvent("session-1", started))).toMatchObject({
      _tag: "ToolProgress",
      toolCallId: searchCall.id,
      tool: "search",
      status: "started",
    })
    const progress = Schema.decodeSync(HostEvent)({
      _tag: "ToolCall",
      sessionId: "session-1",
      cursor: 6,
      runId: "run-1",
      event: {
        ...runEventFields,
        eventId: "run-1:6",
        sequence: 6,
        _tag: "ToolProgress",
        turn: 0,
        toolCallId: searchCall.id,
        message: "halfway",
      },
    })
    expect(Option.isNone(projectClientEvent("session-1", progress))).toBe(true)
    expect(Option.getOrThrow(projectClientEvent("session-1", progress, undefined, "search"))).toMatchObject({
      _tag: "ToolProgress",
      tool: "search",
      summary: "halfway",
    })
    const approval = Schema.decodeSync(HostEvent)({
      _tag: "ApprovalRequested",
      sessionId: "session-1",
      cursor: 7,
      runId: "run-1",
      event: {
        ...runEventFields,
        eventId: "run-1:7",
        sequence: 7,
        _tag: "ApprovalRequested",
        turn: 0,
        call: searchCall,
        request: { approvalId: "approval-1", capability: "search", operation: "Search", input: { secret: marker } },
      },
    })
    expect(Option.getOrThrow(projectClientEvent("session-1", approval))).toEqual({
      _tag: "ApprovalRequested",
      sessionId: "session-1",
      cursor: "7",
      runId: "run-1",
      approval: { id: "approval-1", tool: "search", summary: "Search" },
    })

    for (const [terminal, status] of [
      [
        Schema.decodeSync(HostEvent)({
          _tag: "Completed",
          sessionId: "session-1",
          cursor: 8,
          runId: "run-1",
          event: {
            ...runEventFields,
            eventId: "run-1:completed",
            sequence: 8,
            _tag: "RunCompleted",
            result: { _tag: "Tool", isFailure: false, value: "done" },
          },
        }),
        "succeeded",
      ],
      [
        Schema.decodeSync(HostEvent)({
          _tag: "Completed",
          sessionId: "session-1",
          cursor: 9,
          runId: "run-1",
          event: {
            ...runEventFields,
            eventId: "run-1:failed",
            sequence: 9,
            _tag: "RunFailed",
            error: Errors.AgentExecutionFailure.make({ message: "failed" }),
          },
        }),
        "failed",
      ],
      [
        Schema.decodeSync(HostEvent)({
          _tag: "Completed",
          sessionId: "session-1",
          cursor: 10,
          runId: "run-1",
          event: {
            ...runEventFields,
            eventId: "run-1:cancelled",
            sequence: 10,
            _tag: "RunCancelled",
            reason: "cancelled",
          },
        }),
        "cancelled",
      ],
    ] as const) {
      expect(
        Option.getOrThrow(
          projectClientEvent("session-1", terminal, { name: "private-agent", revision: "public-revision" }),
        ),
      ).toMatchObject({ _tag: "RunChanged", run: { status } })
    }

    const waiting = Schema.decodeSync(HostEvent)({
      _tag: "ToolCall",
      sessionId: "session-1",
      cursor: 9,
      runId: "run-1",
      event: {
        ...runEventFields,
        eventId: "run-1:9",
        sequence: 9,
        _tag: "ToolExecutionWaiting",
        turn: 0,
        call: searchCall,
        waitId: "wait-1",
        token: "token-1",
      },
    })
    expect(Option.getOrThrow(projectClientEvent("session-1", waiting))).toMatchObject({
      _tag: "ToolProgress",
      status: "waiting",
    })

    for (const isFailure of [false, true]) {
      const result = Object.assign(
        Response.makePart("tool-result", {
          id: searchCall.id,
          name: searchCall.name,
          isFailure,
          result: isFailure ? "failed" : "done",
          encodedResult: isFailure ? "failed" : "done",
          providerExecuted: false,
          preliminary: false,
        }),
        { taint: [] },
      )
      const completed = Schema.decodeSync(HostEvent)({
        _tag: "ToolCall",
        sessionId: "session-1",
        cursor: 10,
        runId: "run-1",
        event: {
          ...runEventFields,
          eventId: `run-1:10:${isFailure}`,
          sequence: 10,
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: searchCall,
          result,
        },
      })
      expect(Option.getOrThrow(projectClientEvent("session-1", completed))).toMatchObject({
        _tag: "ToolProgress",
        status: isFailure ? "failed" : "completed",
      })
    }

    const internalOnly = Schema.decodeSync(HostEvent)({
      _tag: "TasksUpdated",
      sessionId: "session-1",
      cursor: 11,
      runId: "run-1",
      items: [],
    })
    expect(Option.isNone(projectClientEvent("session-1", internalOnly))).toBe(true)
  })

  it("keeps every Client schema strict at untrusted decode boundaries", () => {
    const session = {
      id: "session-1",
      createdAt: "2026-09-12T00:00:00.000Z",
      lifecycle: "active",
      queue: [],
    }
    expect(() =>
      Schema.decodeUnknownSync(ClientSession, { onExcessProperty: "error" })({
        ...session,
        executableManifest: privateManifest,
      }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(Server.ClientCursor)(17)).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(ClientEvent, { onExcessProperty: "error" })({
        _tag: "RunChanged",
        sessionId: "session-1",
        cursor: "4",
        run: { runId: "run-1" },
      }),
    ).toThrow()
    expect(() => Schema.decodeSync(Server.ClientMessage)(Prompt.makeMessage("system", { content: marker }))).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(ClientSessionSnapshot)({
        version: 1,
        session,
        cursor: "34",
        runs: Array.from({ length: 34 }, (_, index) => runSummary(`run-${index}`)),
        conversation: { leafId: null, entries: [] },
      }),
    ).toThrow()
  })

  it("exports each client schema by name and on the Server namespace", () => {
    expect(Server.ClientSession).toBe(ClientSession)
    expect(Server.ClientEvent).toBe(ClientEvent)
    expect(Server.ClientSessionSnapshot).toBe(ClientSessionSnapshot)
    expect("SessionSnapshot" in Server).toBe(false)
    expect("HostEvent" in Server).toBe(false)
    expect("ServerEvent" in Server).toBe(false)
    expect("CursorFromString" in Server).toBe(false)
  })
})
