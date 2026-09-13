import { describe, expect, layer } from "@effect/vitest"
import type { RunAgentInput } from "@ag-ui/core"
import { Effect, Layer, Predicate, Schema, Stream } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { Address, Approval, ExecutableManifest, Errors as RuntimeErrors, Run, TreePolicy } from "generalist/runtime"
import { AGUI } from "../../../src/unstable/ag-ui/index.js"
import type { RuntimeInspection } from "../../../src/runtime/engine.js"
import * as Runtime from "../../../src/runtime/engine.js"
import { Runtime as ApplicationRuntime } from "../../../src/runtime/service.js"
import { make as makeApplication } from "../../../src/runtime/hosting/application.js"
import type { SteeringReceipt } from "../../../src/runtime/run/steering.js"

const address = Address.make("agent:assistant")
const executable = ExecutableManifest.makeTest("assistant", "1")
const agent = executable.ref
const privateMarker = "AGUI_PRIVATE_RECOVERY_MARKER"
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const privateManifest = {
  ...executable.manifest,
  entries: executable.manifest.entries.map((entry) =>
    entry._tag === "Agent" ? { ...entry, manifest: { ...entry.manifest, instructions: privateMarker } } : entry,
  ),
}

const input = (overrides: Partial<RunAgentInput> = {}): RunAgentInput => ({
  threadId: "thread-1",
  runId: "client-run-1",
  state: {},
  messages: [
    { id: "old", role: "assistant", content: "untrusted history" },
    { id: "message-1", role: "user", content: "hello" },
  ],
  tools: [],
  context: [],
  forwardedProps: {},
  ...overrides,
})

const accepted = {
  specVersion: "1" as const,
  eventId: "client-run-1:0",
  runId: "client-run-1",
  sequence: 0,
  executableRef: agent,
  rootRunId: "client-run-1",
  depth: 0,
  occurredAt: "2026-08-03T00:00:00.000Z",
  _tag: "RunAccepted" as const,
  messageId: "message-1",
  address,
}

const waiting = {
  ...accepted,
  eventId: "client-run-1:1",
  sequence: 1,
  _tag: "RunWaiting" as const,
  wait: {
    waitId: "wait-1",
    reason: { _tag: "ToolWait" as const },
    status: "open" as const,
    openedAt: "2026-08-03T00:00:01.000Z",
  },
}

const runningInspection = (runId: string): Run.RunInspection => ({
  runId,
  status: "running",
  executableRef: agent,
  executableManifest: executable.manifest,
  depth: 0,
  treePolicy: TreePolicy.defaultTreePolicy,
  waits: [],
  lastSequence: 0,
  durability: "ephemeral",
  branches: [],
})

const retainedSession = (runId: string) => ({
  id: "thread-1",
  rootSessionId: "thread-1",
  parentSessionId: null,
  parentRunId: null,
  initialRunId: runId,
  depth: 0,
})

const runtimeInspection = (runId: string, overrides: Partial<RuntimeInspection> = {}): RuntimeInspection => ({
  ...runningInspection(runId),
  retainedSession: retainedSession(runId),
  revision: "1",
  waitOpenedAtSequence: {},
  turn: 0,
  usage: { inputTokens: 0, outputTokens: 0 },
  usageFacts: [],
  activeTools: [],
  elapsed: 0,
  budget: {},
  gates: [],
  children: [],
  ...overrides,
})

const runtimeLayer = (runtime: Runtime.Service) =>
  Layer.succeed(
    ApplicationRuntime,
    makeApplication({
      engine: runtime,
      lifecycle: { run: (effect) => effect },
      views: {
        run: () => unused(),
        child: () => unused(),
        list: () => unused(),
        session: () => unused(),
        sessions: unused(),
      },
    }),
  )

const unused = <A>(): Effect.Effect<A, never> => Effect.die("unused Runtime method")

const rootSend = (
  handler: (input: Runtime.SendInput) => Effect.Effect<Run.RunReceipt, Runtime.SendError>,
): Runtime.Service["send"] => {
  function send(
    runId: string,
    prompt: Prompt.Prompt | string,
    options?: Runtime.RunSendOptions,
  ): Effect.Effect<SteeringReceipt, Runtime.RunSendError>
  function send(input: Runtime.SendInput): Effect.Effect<Run.RunReceipt, Runtime.SendError>
  function send(
    sendInput: Runtime.SendInput | string,
    _prompt?: Prompt.Prompt | string,
    _options?: Runtime.RunSendOptions,
  ): Effect.Effect<SteeringReceipt | Run.RunReceipt, Runtime.RunSendError | Runtime.SendError> {
    return Predicate.isString(sendInput) ? unused() : handler(sendInput)
  }
  return send
}

const mockRuntime = (implementation: Partial<Runtime.Service>): Runtime.Service =>
  Runtime.Runtime.of({
    messageSessionInput: () => unused(),
    controlSession: () => unused(),
    getTool: () => unused(),
    registerTool: () => unused(),
    startTool: () => unused(),
    startToolEncoded: () => unused(),
    sessionSelection: () => unused(),
    sessionFamily: () => Effect.die("not used"),
    hold: () => unused(),
    sessions: {
      create: () => unused(),
      get: () => unused(),
      list: unused(),
    },
    getRun: () => unused(),
    configureDelegationPolicy: () => unused(),
    submitSessionInput: () => unused(),
    updateSessionInput: () => unused(),
    removeSessionInput: () => unused(),
    operator: {
      explain: () => unused(),
      verify: () => unused(),
      retry: () => unused(),
      wake: () => unused(),
      scanObligations: () => Stream.empty,
      resolveUnknown: () => unused(),
      resolveApproval: () => unused(),
      extendBudget: () => unused(),
    },
    register: () => unused(),
    start: () => unused(),
    schedule: () => unused(),
    startExecution: () => unused(),
    admit: () => unused(),
    activate: ({ runId }) => Effect.succeed(runningInspection(runId)),
    fork: () => unused(),
    rewind: () => unused(),
    send: rootSend(() => unused()),
    previews: () => Stream.empty,
    previewAuthority: () => Effect.succeed(0),
    spawn: () => unused(),
    events: () => Stream.empty,
    snapshot: () => unused(),
    history: () => unused(),
    createSession: () => unused(),
    session: () => unused(),
    listSessions: unused(),
    sessionSnapshot: () => Effect.die("unexpected Session snapshot"),
    sessionHistoryPage: () => Effect.die("unexpected Session history page"),
    sessionRunsPage: () => Effect.die("unexpected Session Runs page"),
    sessionRunSummary: () => Effect.die("unexpected Session Run summary"),
    sessionRuns: () => unused(),
    sessionEvents: () => Stream.empty,
    acknowledge: () => unused(),
    acknowledged: () => unused(),
    sessionEntry: () => unused(),
    resolveModelResponse: () => unused(),
    recordReward: () => unused(),
    treeReplay: () => unused(),
    treeChanges: () => Stream.empty,
    treeCheckpoint: () => unused(),
    list: () => unused(),
    respond: () => unused(),
    respondApproval: () => unused(),
    signal: () => unused(),
    wake: () => unused(),
    cancel: () => unused(),
    cancelSession: () => unused(),
    awaitSessionTerminal: () => unused(),
    sendMessage: () => unused(),
    messages: () => unused(),
    childSettlements: () => unused(),
    childSettlementChanges: () => Stream.empty,
    awaitChildSettlement: () => unused(),
    directory: () => unused(),
    registerAgentName: () => unused(),
    resolveOperation: () => unused(),
    inspect: () => unused(),
    extendBudget: () => unused(),
    fanOut: () => unused(),
    inspectFanOut: () => unused(),
    awaitFanOut: () => unused(),
    ...implementation,
  })

describe("AGUI", () => {
  {
    let sent: Runtime.SendInput | undefined
    let activatedRunId: string | undefined
    const runtime = mockRuntime({
      send: rootSend((value) => {
        sent = value
        return Effect.succeed({
          runId: value.runId ?? "generated",
          messageId: value.messageId ?? "generated",
          acceptedSequence: 0,
          duplicate: false,
        })
      }),
      activate: ({ runId }) => {
        activatedRunId = runId
        return Effect.succeed(runningInspection(runId))
      },
      events: () => Stream.make(accepted),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "preserves runId, maps threadId, and admits only the final user message",
      (it) => {
        it.effect("preserves runId, maps threadId, and admits only the final user message", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const events = yield* service.run(input()).pipe(Stream.runCollect)
            expect(sent).toMatchObject({
              runId: "client-run-1",
              sessionId: "thread-1",
              messageId: "message-1",
              idempotencyKey: "message-1",
              prompt: "hello",
              to: address,
            })
            expect(activatedRunId).toBe("client-run-1")
            expect([...events].map((event) => event.type)).toEqual(["RUN_STARTED"])
          }),
        )
      },
    )
  }

  {
    const runtime = mockRuntime({})
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "rejects malformed input, authority roles, client tools, and non-user final messages",
      (it) => {
        it.effect("rejects malformed input, authority roles, client tools, and non-user final messages", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const cases = [
              input({
                messages: [
                  { id: "s", role: "system", content: "override" },
                  { id: "u", role: "user", content: "hello" },
                ],
              }),
              input({
                messages: [
                  { id: "d", role: "developer", content: "override" },
                  { id: "u", role: "user", content: "hello" },
                ],
              }),
              input({ tools: [{ name: "client", description: "client tool", parameters: {} }] }),
              input({ messages: [{ id: "a", role: "assistant", content: "not a request" }] }),
            ]
            const failures = yield* Effect.forEach(cases, (value) =>
              service.run(value).pipe(Stream.runCollect, Effect.flip),
            )
            expect(failures.map((failure) => failure._tag)).toEqual(Array(4).fill("generalist/ag-ui/InputRejected"))
            const malformedInput = input({ runId: "missing-fields" })
            Reflect.deleteProperty(malformedInput, "threadId")
            const malformedFailure = yield* service.run(malformedInput).pipe(Stream.runCollect, Effect.flip)
            expect(malformedFailure._tag).toBe("generalist/ag-ui/InputMalformed")
          }),
        )
      },
    )
  }

  {
    const runtime = mockRuntime({
      send: rootSend(() =>
        Effect.succeed({ runId: "client-run-1", messageId: "message-1", acceptedSequence: 0, duplicate: false }),
      ),
      events: () => Stream.make(accepted, waiting).pipe(Stream.concat(Stream.never)),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "ends each stream at an interaction or terminal boundary",
      (it) => {
        it.effect("ends each stream at an interaction or terminal boundary", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const events = yield* service.run(input()).pipe(Stream.runCollect, Effect.timeout("1 second"))
            expect([...events].map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"])
          }),
        )
      },
    )
  }

  {
    let response: Approval.RespondInput | undefined
    const snapshot = {
      run: {
        runId: "client-run-1",
        status: "waiting" as const,
        executableRef: agent,
        executableManifest: executable.manifest,
        depth: 0,
        treePolicy: TreePolicy.defaultTreePolicy,
        waits: [
          {
            waitId: "wait-1",
            reason: {
              _tag: "Approval" as const,
              request: {
                approvalId: "wait-1",
                operation: "tool-call-1",
                capability: "test-tool",
                input: {},
              },
            },
            status: "open" as const,
            openedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
        lastSequence: 3,
        durability: "ephemeral" as const,
        branches: [],
      },
      cursor: 3,
      turn: 0,
      usageFacts: [],
      budget: {},
      compactions: [],
      gates: [],
    }
    const runtime = mockRuntime({
      snapshot: () => Effect.succeed(snapshot),
      respondApproval: (value) => {
        response = value
        return Effect.void
      },
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "resumes only the exact active wait",
      (it) => {
        it.effect("resumes only the exact active wait", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            yield* service
              .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: "approved" }] }))
              .pipe(Stream.runDrain)
            expect(response).toEqual({
              runId: "client-run-1",
              approvalId: "wait-1",
              commandId: "agui:client-run-1:resume:wait-1",
              decision: { _tag: "Approved" },
            })
            yield* service
              .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: false }] }))
              .pipe(Stream.runDrain)
            expect(response?.decision).toEqual({ _tag: "Denied" })
            const mismatch = yield* service
              .run(input({ resume: [{ interruptId: "stale", status: "resolved", payload: "approved" }] }))
              .pipe(Stream.runDrain, Effect.flip)
            expect(mismatch._tag).toBe("generalist/ag-ui/ResumeMismatch")
            const invalid = yield* service
              .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: undefined }] }))
              .pipe(Stream.runDrain, Effect.flip)
            expect(invalid._tag).toBe("generalist/ag-ui/InputRejected")
          }),
        )
      },
    )
  }

  {
    const lagCursors: Array<number | undefined> = []
    let snapshotReads = 0
    const staleSnapshot = {
      run: {
        runId: "client-run-1",
        status: "waiting" as const,
        executableRef: agent,
        executableManifest: privateManifest,
        retainedSession: retainedSession("client-run-1"),
        depth: 0,
        treePolicy: TreePolicy.defaultTreePolicy,
        waits: [],
        lastSequence: 3,
        durability: "ephemeral" as const,
        branches: [],
        attemptFence: 17,
        privateMarker,
      },
      cursor: 3,
      turn: 0,
      usageFacts: [],
      budget: {},
      compactions: [],
      gates: [],
      claim: { ownerId: privateMarker, epoch: 3, fence: 17 },
      providerResourceRef: privateMarker,
    }
    const inspected = {
      ...runtimeInspection("client-run-1", {
        executableManifest: privateManifest,
        lastSequence: 8,
      }),
      attemptFence: 17,
      privateMarker,
      claim: { ownerId: privateMarker, epoch: 3, fence: 17 },
      providerResourceRef: privateMarker,
    }
    const runtime = mockRuntime({
      send: rootSend(() =>
        Effect.succeed({ runId: "client-run-1", messageId: "message-1", acceptedSequence: 0, duplicate: false }),
      ),
      events: ({ cursor }) => {
        lagCursors.push(cursor)
        return lagCursors.length === 1
          ? Stream.fail(RuntimeErrors.SubscriberLagged.make({ runId: "client-run-1", lastDeliveredSequence: 2 }))
          : Stream.empty
      },
      snapshot: () => {
        snapshotReads += 1
        return Effect.succeed(staleSnapshot)
      },
      inspect: () => Effect.succeed(inspected),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "recovers subscriber lag from one inspection view and its cursor",
      (it) => {
        it.effect("recovers subscriber lag from one inspection view and its cursor", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const current = yield* service.snapshot("client-run-1")
            const events = yield* service.run(input()).pipe(Stream.runCollect)
            expect(lagCursors).toEqual([-1, 8])
            expect(snapshotReads).toBe(0)
            const expected = {
              type: "STATE_SNAPSHOT",
              snapshot: {
                version: 1,
                cursor: "8",
                run: {
                  runId: "client-run-1",
                  sessionId: "thread-1",
                  rootRunId: "client-run-1",
                  agent: { name: "assistant", revision: "1" },
                  status: "running",
                  durability: "ephemeral",
                  depth: 0,
                  turn: 0,
                  lastSequence: 8,
                  budget: {},
                  usage: { inputTokens: 0, outputTokens: 0 },
                  waits: [],
                },
              },
            }
            expect(current).toEqual(expected)
            expect([...events]).toEqual([expected])
            const bytes = encodeJson([current, ...events])
            for (const forbidden of [
              privateMarker,
              "executableManifest",
              "attemptFence",
              "privateMarker",
              "claim",
              "ownerId",
              "epoch",
              "fence",
              "providerResourceRef",
            ]) {
              expect(bytes).not.toContain(forbidden)
            }
          }),
        )
      },
    )
  }

  {
    const expiredCursors: Array<number | undefined> = []
    const snapshot = {
      run: {
        runId: "client-run-1",
        status: "running" as const,
        executableRef: agent,
        executableManifest: privateManifest,
        retainedSession: retainedSession("client-run-1"),
        depth: 0,
        treePolicy: TreePolicy.defaultTreePolicy,
        waits: [],
        lastSequence: 12,
        durability: "durable" as const,
        branches: [],
        attemptFence: 21,
        privateMarker,
      },
      cursor: 12,
      turn: 0,
      usageFacts: [],
      budget: {},
      compactions: [],
      gates: [],
      claim: { ownerId: privateMarker, epoch: 4, fence: 21 },
      providerResourceRef: privateMarker,
    }
    const inspected = {
      ...runtimeInspection("client-run-1", {
        executableManifest: privateManifest,
        lastSequence: 12,
        durability: "durable",
      }),
      attemptFence: 21,
      privateMarker,
      claim: { ownerId: privateMarker, epoch: 4, fence: 21 },
      providerResourceRef: privateMarker,
    }
    const runtime = mockRuntime({
      send: rootSend(() =>
        Effect.succeed({
          runId: "client-run-1",
          messageId: "message-1",
          acceptedSequence: 0,
          duplicate: true,
        }),
      ),
      events: ({ cursor }) => {
        expiredCursors.push(cursor)
        return expiredCursors.length === 1
          ? Stream.fail(RuntimeErrors.CursorExpired.make({ runId: "client-run-1", cursor: -1, earliestSequence: 7 }))
          : Stream.empty
      },
      snapshot: () => Effect.succeed(snapshot),
      inspect: () => Effect.succeed(inspected),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "recovers an expired cursor from the authoritative snapshot",
      (it) => {
        it.effect("recovers an expired cursor from the authoritative snapshot", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const events = yield* service.run(input()).pipe(Stream.runCollect)
            expect(expiredCursors).toEqual([-1, 12])
            expect([...events]).toEqual([
              {
                type: "STATE_SNAPSHOT",
                snapshot: {
                  version: 1,
                  cursor: "12",
                  run: {
                    runId: "client-run-1",
                    sessionId: "thread-1",
                    rootRunId: "client-run-1",
                    agent: { name: "assistant", revision: "1" },
                    status: "running",
                    durability: "durable",
                    depth: 0,
                    turn: 0,
                    lastSequence: 12,
                    budget: {},
                    usage: { inputTokens: 0, outputTokens: 0 },
                    waits: [],
                  },
                },
              },
            ])
            const bytes = encodeJson(events)
            for (const forbidden of [
              privateMarker,
              "executableManifest",
              "attemptFence",
              "privateMarker",
              "claim",
              "ownerId",
              "epoch",
              "fence",
              "providerResourceRef",
            ]) {
              expect(bytes).not.toContain(forbidden)
            }
          }),
        )
      },
    )
  }

  {
    const snapshot = {
      run: {
        ...runningInspection("client-run-1"),
        retainedSession: retainedSession("client-run-1"),
      },
      cursor: 4,
      turn: 0,
      usageFacts: [],
      budget: {},
      compactions: [],
      gates: [],
    }
    const missingIdentity = runtimeInspection("client-run-1")
    Reflect.deleteProperty(missingIdentity, "revision")
    const runtime = mockRuntime({
      snapshot: () => Effect.succeed(snapshot),
      inspect: () => Effect.succeed(missingIdentity),
      send: rootSend(() =>
        Effect.succeed({ runId: "client-run-1", messageId: "message-1", acceptedSequence: 0, duplicate: false }),
      ),
      events: () =>
        Stream.fail(RuntimeErrors.SubscriberLagged.make({ runId: "client-run-1", lastDeliveredSequence: 0 })),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "fails typed when a snapshot has no exact public Agent identity",
      (it) => {
        it.effect("fails typed when a snapshot has no exact public Agent identity", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const failure = yield* service.snapshot("client-run-1").pipe(Effect.flip)
            expect(failure).toMatchObject({
              _tag: "generalist/runtime/RuntimeUnavailable",
              message: "Run has no complete public AG-UI identity",
            })
            const replayFailure = yield* service.run(input()).pipe(Stream.runDrain, Effect.flip)
            expect(replayFailure).toMatchObject({
              _tag: "generalist/runtime/RuntimeUnavailable",
              message: "Run has no complete public AG-UI identity",
            })
          }),
        )
      },
    )
  }

  {
    const snapshot = {
      run: { ...runningInspection("client-run-1"), parentRunId: "root-run", depth: 1 },
      cursor: 4,
      turn: 0,
      usageFacts: [],
      budget: {},
      compactions: [],
      gates: [],
    }
    const child = runtimeInspection("client-run-1", { parentRunId: "root-run", depth: 1 })
    Reflect.deleteProperty(child, "retainedSession")
    const root = runtimeInspection("root-run")
    const runtime = mockRuntime({
      snapshot: () => Effect.succeed(snapshot),
      inspect: (runId) => Effect.succeed(runId === "root-run" ? root : child),
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "does not substitute a root Session for a child snapshot",
      (it) => {
        it.effect("does not substitute a root Session for a child snapshot", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const failure = yield* service.snapshot("client-run-1").pipe(Effect.flip)
            expect(failure).toMatchObject({
              _tag: "generalist/runtime/RuntimeUnavailable",
              message: "Run has no retained Session identity",
            })
          }),
        )
      },
    )
  }

  {
    const child = runtimeInspection("client-run-1", { parentRunId: "root-run", depth: 1 })
    const invalidParent = runtimeInspection("root-run", { depth: 1 })
    const inspectedRunIds: Array<string> = []
    const runtime = mockRuntime({
      inspect: (runId) => {
        inspectedRunIds.push(runId)
        return Effect.succeed(runId === "root-run" ? invalidParent : child)
      },
    })
    layer(AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime))))(
      "rejects non-decreasing Run ancestry before projecting a snapshot",
      (it) => {
        it.effect("rejects non-decreasing Run ancestry before projecting a snapshot", () =>
          Effect.gen(function* () {
            const service = yield* AGUI.AGUI
            const failure = yield* service.snapshot("client-run-1").pipe(Effect.flip)
            expect(failure).toMatchObject({
              _tag: "generalist/runtime/RuntimeUnavailable",
              message: "Run ancestry has a non-decreasing depth",
            })
            expect(inspectedRunIds).toEqual(["client-run-1", "root-run"])
          }),
        )
      },
    )
  }
})
