import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Queue, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { EntryPayload, type Entry } from "../../../src/core/context/session.js"
import { make as makeRunBudget } from "../../../src/core/durable/run-budget.js"
import { ProgramAgentFailure, ProgramOperationName } from "../../../src/core/program/capabilities.js"
import { Denied as NestedOperationDenied } from "../../../src/core/tools/nested-operation.js"
import { DurabilityFailure } from "../../../src/durability/errors.js"
import { apply, freeze, type State } from "../../../src/durability/internal/protocol.js"
import {
  decode,
  decodeReceipt,
  diff,
  encode,
  encodeCommandValue,
  make as makeCodec,
} from "../../../src/durability/internal/runtime-state.js"
import { SessionAppendInputCodec, SessionEntryCodec } from "../../../src/durability/internal/runtime-state/session.js"
import { normalize, Value } from "../../../src/durability/internal/runtime-state/value.js"
import { publishChanges } from "../../../src/durability/internal/runtime-state/publications.js"
import type { ArtifactUpdate, ArtifactSubscriberLagged } from "../../../src/core/artifact.js"
import { HostSessionEvent, type SessionSubscriberLagged } from "../../../src/runtime/session/host.js"
import { RuntimeState as WireRuntimeState } from "../../../src/durability/internal/runtime-state/schema.js"
import { Address } from "../../../src/runtime/address.js"
import { Cursor } from "../../../src/runtime/cursor.js"
import { AgentExecutionFailure, type RuntimeUnavailable } from "../../../src/runtime/errors.js"
import { ExecutableResolver, RunStore, Runtime } from "../../../src/runtime/index.js"
import { makeTest } from "../../../src/runtime/executable/manifest.js"
import type { ExecutionCheckpoint } from "../../../src/runtime/execution/state.js"
import type { ScheduleRecord } from "../../../src/runtime/execution/trigger/schedule.js"
import type { OperationRecord } from "../../../src/runtime/operation/record.js"
import { OperationResolution } from "../../../src/runtime/operation/resolution.js"
import { RunId } from "../../../src/runtime/run.js"
import { RunEventBase, type RunEvent } from "../../../src/runtime/run/event.js"
import type { RunWait } from "../../../src/runtime/run/wait.js"
import {
  emptySession,
  emptyState,
  type RuntimeState,
  type StoredRun,
  type SubscriberError,
} from "../../../src/runtime/state/projection.js"
import { make as makeTreeCursor } from "../../../src/runtime/tree/cursor.js"
import {
  assistantRef,
  completedResult,
  registrationsFor,
  resolverLayer as fixtureResolverLayer,
} from "../../runtime/execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../runtime/execution/object.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

const executable = makeTest("codec", "1")
const runId = RunId.make("run-codec")
const address = Address.make("agent:codec")
const prompt = Prompt.make("recover this conversation")
const instant = "2026-09-06T00:00:00.000Z"
const epoch = 9007199254740993123456789n
const fresh = () => emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })
const wait: RunWait = {
  waitId: "wait-codec",
  reason: { _tag: "AwaitEvent", filter: { _tag: "Webhook", source: "payments" }, deadline: instant },
  status: "open",
  openedAt: instant,
}
const checkpoint: ExecutionCheckpoint = {
  driverVersion: "1",
  executable: executable.ref,
  turn: 3,
  budget: makeRunBudget({ tokens: 200, toolCalls: 4 }),
  state: {
    logicalOperationId: 7,
    outcome: { _tag: "Unknown", operationId: "operation-codec" },
    extra: { epoch, absent: undefined },
  },
}
const event = (sequence: number): RunEvent => ({
  _tag: "RunWaiting",
  specVersion: "1",
  eventId: `${runId}:${sequence}`,
  runId,
  rootRunId: runId,
  executableRef: executable.ref,
  sequence: Cursor.make(sequence),
  depth: 0,
  occurredAt: instant,
  wait,
})
const operation: OperationRecord = {
  runId,
  operationId: "operation-codec",
  operationKey: "paid-call",
  kind: "tool",
  status: "unknown",
  inputDigest: "input-digest",
  input: {
    amount: epoch,
    absent: undefined,
    bytes: new Uint8Array([1, 2, 255]),
    nested: new Map([["__proto__", { safe: true }]]),
  },
  replayPolicy: "never",
  attempt: 2,
  checkpoint,
}
const registration = { pin: "pin-codec", codec: "fixture", version: "1", payload: { model: "fixture" } }
const storedRun = (): StoredRun => ({
  runId,
  status: "needs-resolution",
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  address,
  message: {
    id: "message-codec",
    to: address,
    sessionId: "session-codec",
    prompt,
    idempotencyKey: "admit-codec",
    correlationId: "correlation",
    metadata: {},
  },
  rootRunId: runId,
  depth: 0,
  treePolicy: { maxDepth: 3, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
  lastSequence: 1,
  lastTurnCompletedSequence: 0,
  attempt: 2,
  attemptFence: 4,
  ownerId: "worker-codec",
  checkpoint,
  continuation: { schemaVersion: 1, prompt, nextTurn: 4, steeringEntryIds: ["steering-codec"] },
  cancellationRequested: true,
  cancelReason: "operator",
  children: ["child-codec"],
  events: [event(1)],
  subscribers: new Map(),
  steering: [
    {
      entryId: "steering-codec",
      runId,
      sequence: 1,
      idempotencyKey: "steer",
      digest: "steer-digest",
      prompt,
      policy: "enqueue",
      from: { user: "operator" },
      consumedOperationId: "operation-codec",
    },
  ],
  registrations: [registration],
  checkpoints: new Map([
    [0, undefined],
    [1, checkpoint],
  ]),
})
const entries = (): ReadonlyArray<Entry> => [
  {
    _tag: "Message",
    id: "entry-0",
    parentId: null,
    message: prompt.content[0]!,
    metadata: { epoch, absent: undefined },
  },
  {
    _tag: "ModelResponse",
    id: "entry-1",
    parentId: "entry-0",
    content: [
      Response.makePart("tool-call", { id: "call", name: "pay", params: { amount: epoch }, providerExecuted: false }),
      Response.makePart("finish", {
        reason: "tool-calls",
        usage: Response.Usage.make({
          inputTokens: { uncached: undefined, total: 5, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 2, text: undefined, reasoning: undefined },
        }),
        response: undefined,
      }),
    ],
  },
  {
    _tag: "Compaction",
    id: "entry-2",
    parentId: "entry-1",
    projectedHistory: prompt,
    telemetry: [],
    summary: "retain evidence",
  },
  {
    _tag: "Handoff",
    id: "entry-3",
    parentId: "entry-2",
    handoffId: "handoff",
    target: "next",
    projectedHistory: prompt,
  },
  { _tag: "BranchSummary", id: "entry-4", parentId: "entry-0", summary: "alternate branch" },
]
const fixture = (): RuntimeState => {
  const history = entries()
  const schedule: ScheduleRecord = {
    scheduleId: "schedule-codec",
    rrule: "FREQ=DAILY",
    rule: { frequency: "DAILY", interval: 1 },
    definition: {
      executable,
      registrations: [registration],
      sessionId: "session-codec",
      prompt,
      budget: makeRunBudget({}),
    },
    nextAt: instant,
    occurrence: 7,
    status: "active",
    createdAt: instant,
  }
  const snapshot = { sha256: "a".repeat(64), mediaType: "text/plain", bytes: 3 }
  return {
    ...fresh(),
    nextRunCounter: 11,
    nextOperationCounter: 12,
    nextSteeringCounter: 13,
    nextMessageCounter: 14,
    runs: new Map([[runId, storedRun()]]),
    waits: new Map([[`${runId}\0${wait.waitId}`, wait]]),
    sessions: new Map([
      [
        "session-codec",
        {
          entries: new Map(history.map((entry) => [entry.id, entry])),
          order: history.map((entry) => entry.id),
          leaf: "entry-3",
          counter: 20,
          writerEpoch: epoch,
          writer: { runId, ownerId: "worker-codec", runAttemptFence: 4 },
        },
      ],
    ]),
    hostSessions: new Map([
      [
        "session-codec",
        {
          session: { id: "session-codec", createdAt: instant },
          lastCursor: 1,
          events: [{ _tag: "Run", cursor: Cursor.make(1), event: event(1) }],
          subscribers: new Map(),
        },
      ],
    ]),
    treeRoots: new Map([
      [
        runId,
        {
          earliestPosition: 0,
          lastPosition: 1,
          events: [{ rootRunId: runId, runId, event: event(1), cursor: makeTreeCursor(runId, 1) }],
          subscribers: new Map(),
        },
      ],
    ]),
    lanes: new Map([["session-codec", { queue: [runId, "queued-child"], acceptedSequence: 3 }]]),
    idempotency: new Map([
      [
        "admit-codec",
        {
          digest: "admit-digest",
          executable,
          receipt: { runId, messageId: "message-codec", acceptedSequence: 1, duplicate: false },
        },
      ],
    ]),
    registrationCatalog: new Map([[registration.pin, { digest: "registration-digest", value: registration }]]),
    operations: new Map([[`${runId}\0operation-codec`, operation]]),
    programStates: new Map([
      [
        runId,
        {
          runId,
          programPin: "program-codec",
          deadlineMillis: 1000,
          toolCalls: 2,
          agentRuns: 1,
          tokens: 25,
          logBytes: 80,
          activeSlots: 1,
          budget: {
            agentRuns: 5,
            concurrency: 2,
            toolCalls: 10,
            tokens: 100,
            wallClockMillis: 5000,
            logBytes: 200,
            outputBytes: 1000,
          },
        },
      ],
    ]),
    programOperations: new Map([
      [
        "program-op",
        {
          runId,
          operation: ProgramOperationName.make("step-codec"),
          authoredOperation: ProgramOperationName.make("step-codec"),
          kind: "step",
          capability: "payment",
          inputDigest: "input",
          input: { amount: 5 },
          replay: "non-idempotent",
          status: "unknown",
          childRunIds: ["child-codec"],
        },
      ],
    ]),
    addressBindings: new Map([[address, executable]]),
    agentNames: new Map([
      ["scope\0name", runId],
      ["__proto__", "prototype-safe"],
    ]),
    acknowledgements: new Map([[runId, { runId, sequence: Cursor.make(1), acknowledgedAt: instant }]]),
    wakeEvents: new Map([
      ["wake", { _tag: "Webhook", dedupeKey: "wake", source: "payments", payload: { settled: true }, headers: {} }],
    ]),
    schedules: new Map([[schedule.scheduleId, schedule]]),
    scheduleClaims: new Map([[schedule.scheduleId, { ...schedule, ownerId: "worker-codec", leaseExpiresAt: instant }]]),
    artifacts: new Map([
      [
        "artifact",
        {
          head: { artifact: "artifact", crdt: "yjs", version: 1, snapshot },
          baseVersion: 0,
          baseSnapshot: snapshot,
          updates: [
            {
              artifact: "artifact",
              base: 0,
              result: 1,
              operation: { _tag: "Insert", at: 0, text: "abc" },
              attribution: { _tag: "Human", actor: "operator" },
              update: new Uint8Array([1, 2]),
              snapshot,
            },
          ],
          subscribers: new Map(),
        },
      ],
    ]),
    workers: new Map([["worker-codec", { expiresAt: 1000, incarnation: "incarnation-codec" }]]),
  }
}
const detach = (value: State): State => Schema.decodeUnknownSync(Schema.JsonObject)(JSON.parse(JSON.stringify(value)))

describe("canonical runtime state", () => {
  it.effect(
    "round-trips Conversation updates without executable authority while validating tagged Run references",
    () =>
      Effect.gen(function* () {
        const codec = makeCodec()
        const conversation: HostSessionEvent = {
          _tag: "Conversation",
          cursor: Cursor.make(0),
          update: {
            previousLeafId: null,
            leafId: "tool-entry",
            afterEntryId: null,
            entries: [
              {
                id: "user-entry",
                parentId: null,
                messages: [
                  Prompt.userMessage({ content: [Prompt.makePart("text", { text: "Find the retained result" })] }),
                ],
              },
              {
                id: "tool-entry",
                parentId: "user-entry",
                messages: [
                  Prompt.assistantMessage({
                    content: [
                      Prompt.makePart("tool-call", {
                        id: "call",
                        name: "lookup",
                        params: { key: "retained" },
                        providerExecuted: false,
                      }),
                    ],
                  }),
                  Prompt.toolMessage({
                    content: [
                      Prompt.makePart("tool-result", {
                        id: "call",
                        name: "lookup",
                        isFailure: false,
                        providerExecuted: false,
                        result: { bytes: new Uint8Array([1, 2]), values: new Map([["key", "value"]]) },
                      }),
                    ],
                  }),
                ],
              },
            ],
          },
        }
        const persisted = freeze(
          yield* encode({
            ...fresh(),
            hostSessions: new Map([
              [
                "conversation-only",
                {
                  session: { id: "conversation-only", createdAt: instant },
                  lastCursor: 0,
                  events: [conversation],
                  subscribers: new Map(),
                },
              ],
            ]),
          }),
        )
        const local = yield* codec.read(persisted, fresh())
        expect(local.executableCatalog.size).toBe(0)
        expect(local.hostSessions.get("conversation-only")!.events).toEqual([conversation])
        const prepared = yield* codec.prepare(persisted, local, Schema.Undefined, (state) =>
          Effect.succeed([undefined, state] as const),
        )
        expect(prepared.patches).toEqual([])
        expect(yield* encode(yield* makeCodec().read(persisted, fresh()))).toEqual(persisted)
        const invalidRun: HostSessionEvent = { _tag: "Run", cursor: Cursor.make(1), event: event(1) }
        const rejected = yield* codec
          .prepare(persisted, local, Schema.Undefined, (state) =>
            Effect.succeed([
              undefined,
              {
                ...state,
                hostSessions: new Map(state.hostSessions).set("conversation-only", {
                  ...state.hostSessions.get("conversation-only")!,
                  lastCursor: 1,
                  events: [conversation, invalidRun],
                }),
              },
            ] as const),
          )
          .pipe(Effect.flip)
        expect(rejected.reason).toBe("encoding")
        const corrupted = yield* apply(
          persisted,
          [
            {
              op: "set",
              path: ["data", "fields", "hostSessions", "entries", "s:conversation-only", "fields", "events"],
              value: yield* encodeCommandValue([conversation, invalidRun], Schema.Array(HostSessionEvent)),
            },
          ],
          "corruption",
        )
        expect((yield* codec.read(corrupted, local).pipe(Effect.flip)).reason).toBe("corruption")
        expect((yield* makeCodec().read(corrupted, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
        expect(yield* encode(yield* codec.read(persisted, local))).toEqual(persisted)
      }),
  )

  it.effect("invalidates unchanged retained receipts when a Run changes executable closure", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const other = makeTest("other-closure", "1")
      const source = fixture()
      const persisted = freeze(
        yield* encode({
          ...source,
          addressBindings: new Map(source.addressBindings).set(Address.make("agent:other"), other),
        }),
      )
      const local = yield* codec.read(persisted, fresh())
      yield* codec.prepare(persisted, local, Schema.Undefined, (state) => Effect.succeed([undefined, state] as const))
      const altered = yield* codec
        .prepare(persisted, local, Schema.Undefined, (state) => {
          const { checkpoint: _checkpoint, ...run } = state.runs.get(runId)!
          return Effect.succeed([
            undefined,
            {
              ...state,
              runs: new Map(state.runs).set(runId, {
                ...run,
                executableRef: other.ref,
                executableManifest: other.manifest,
                checkpoints: new Map(),
                events: [],
              }),
            },
          ] as const)
        })
        .pipe(Effect.flip)
      expect(altered.reason).toBe("encoding")
      const damaged = yield* apply(
        persisted,
        [
          {
            op: "set",
            path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "executableRef"],
            value: normalize(other.ref),
          },
          { op: "remove", path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "checkpoint"] },
          {
            op: "set",
            path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "checkpoints"],
            value: normalize(new Map()),
          },
          {
            op: "set",
            path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "events"],
            value: normalize([]),
          },
        ],
        "corruption",
      )
      expect((yield* codec.read(damaged, local).pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* makeCodec().read(damaged, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* encode(yield* codec.read(persisted, local))).toEqual(persisted)
    }),
  )

  it.effect("detaches changed-row event Session artifact and receipt publications from authoritative data", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const payloadSchema = Schema.Struct({
        date: Schema.Date,
        bytes: Schema.Uint8Array,
        values: Schema.ReadonlyMap(Schema.String, Schema.String),
      })
      const payload = {
        date: yield* Schema.decodeEffect(Schema.DateFromString)(instant),
        bytes: new Uint8Array([1, 2]),
        values: new Map([["key", "original"]]),
      }
      const original = fixture()
      const persisted = freeze(
        yield* encode({
          ...original,
          runs: new Map(original.runs).set(runId, { ...storedRun(), events: [event(0), event(1)] }),
        }),
      )
      const first = yield* codec.refresh(persisted, fresh())
      first.accept()
      const runQueue = yield* Queue.unbounded<RunEvent, SubscriberError>()
      const sessionQueue = yield* Queue.unbounded<HostSessionEvent, SessionSubscriberLagged | RuntimeUnavailable>()
      const artifactQueue = yield* Queue.unbounded<ArtifactUpdate, ArtifactSubscriberLagged | RuntimeUnavailable>()
      const local = {
        ...first.state,
        runs: new Map(first.state.runs).set(runId, {
          ...first.state.runs.get(runId)!,
          subscribers: new Map([[1, runQueue]]),
        }),
        hostSessions: new Map(first.state.hostSessions).set("session-codec", {
          ...first.state.hostSessions.get("session-codec")!,
          subscribers: new Map([[2, sessionQueue]]),
        }),
        artifacts: new Map(first.state.artifacts).set("artifact", {
          ...first.state.artifacts.get("artifact")!,
          subscribers: new Map([[3, artifactQueue]]),
        }),
      }
      const publicationEvent: RunEvent = {
        ...(yield* Schema.decodeEffect(RunEventBase)(event(2))),
        _tag: "ToolExecutionStarted",
        turn: 1,
        call: Response.toolCallPart({
          id: "publication-call",
          name: "example",
          params: payload,
          providerExecuted: false,
        }),
      }
      const prepared = yield* codec.prepare(persisted, local, Schema.Unknown, (state) => {
        const run = state.runs.get(runId)!
        const session = state.hostSessions.get("session-codec")!
        const artifact = state.artifacts.get("artifact")!
        return Effect.succeed([
          payload,
          {
            ...state,
            runs: new Map(state.runs).set(runId, {
              ...run,
              events: [...run.events, publicationEvent],
              lastSequence: 2,
            }),
            hostSessions: new Map(state.hostSessions).set("session-codec", {
              ...session,
              events: [...session.events, { _tag: "Run", cursor: Cursor.make(2), event: publicationEvent }],
              lastCursor: 2,
            }),
            artifacts: new Map(state.artifacts).set("artifact", {
              ...artifact,
              head: { ...artifact.head, version: 2 },
              updates: [
                ...artifact.updates,
                { ...artifact.updates[0]!, base: 1, result: 2, update: new Uint8Array([3, 4]) },
              ],
            }),
          },
        ] as const)
      })
      const head = yield* apply(persisted, prepared.patches, "encoding")
      const next = yield* codec.refresh(head, local)
      const delivered = yield* publishChanges({ previous: local, next: next.state, changes: next.changes })
      next.accept()
      const runEvent = yield* Queue.take(runQueue)
      const sessionEvent = yield* Queue.take(sessionQueue)
      const artifact = yield* Queue.take(artifactQueue)
      const receipt = yield* decodeReceipt(prepared.receipt, Schema.Unknown)
      const mutate = <Input>(input: Input) => {
        if (!Schema.is(payloadSchema)(input)) throw new Error("Expected mutable payload")
        input.bytes[0] = 99
        input.date.setTime(0)
        if (input.values instanceof Map) input.values.clear()
      }
      if (
        runEvent._tag !== "ToolExecutionStarted" ||
        sessionEvent._tag !== "Run" ||
        sessionEvent.event._tag !== "ToolExecutionStarted"
      )
        return yield* Effect.die("Missing tool publications")
      mutate(runEvent.call.params)
      mutate(sessionEvent.event.call.params)
      mutate(receipt)
      artifact.update[0] = 99
      const oldRead = yield* codec.read(head, delivered)
      if (oldRead.runs instanceof Map) oldRead.runs.clear()
      oldRead.artifacts.get("artifact")!.updates[1]!.update[0] = 99
      expect(yield* encode(yield* codec.read(head, delivered))).toEqual(head)
      expect(yield* encode(yield* makeCodec().read(head, fresh()))).toEqual(head)
      const unchanged = yield* codec.refresh(head, delivered)
      expect(unchanged.changes).toEqual({ runs: [], sessions: [], artifacts: [] })
      expect(unchanged.state.artifacts.get("artifact")!.updates[1]!.update).toEqual(new Uint8Array([3, 4]))
      const following: RunEvent = { ...publicationEvent, ...(yield* Schema.decodeEffect(RunEventBase)(event(3))) }
      const appended = yield* codec.prepare(head, delivered, Schema.Undefined, (state) =>
        Effect.succeed([
          undefined,
          {
            ...state,
            runs: new Map(state.runs).set(runId, {
              ...state.runs.get(runId)!,
              events: [...state.runs.get(runId)!.events, following],
              lastSequence: 3,
            }),
            hostSessions: new Map(state.hostSessions).set("session-codec", {
              ...state.hostSessions.get("session-codec")!,
              events: [
                ...state.hostSessions.get("session-codec")!.events,
                { _tag: "Run", cursor: Cursor.make(3), event: following },
              ],
              lastCursor: 3,
            }),
          },
        ] as const),
      )
      const followingHead = yield* apply(head, appended.patches, "encoding")
      const followingView = yield* codec.refresh(followingHead, delivered)
      yield* publishChanges({ previous: delivered, next: followingView.state, changes: followingView.changes })
      followingView.accept()
      const followingRun = yield* Queue.take(runQueue)
      const followingSession = yield* Queue.take(sessionQueue)
      if (
        followingRun._tag !== "ToolExecutionStarted" ||
        followingSession._tag !== "Run" ||
        followingSession.event._tag !== "ToolExecutionStarted"
      )
        return yield* Effect.die("Missing following tool publications")
      expect(followingRun.call.params).toEqual(payload)
      expect(followingSession.event.call.params).toEqual(payload)
      expect(yield* encode(yield* makeCodec().read(followingHead, fresh()))).toEqual(followingHead)
      yield* Queue.shutdown(runQueue)
      yield* Queue.shutdown(sessionQueue)
      yield* Queue.shutdown(artifactQueue)
    }),
  )

  it.effect("retains executable authority and original receipts through reopen, rewind and fork", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      let resolutions = 0
      const resolver = Layer.effect(
        ExecutableResolver.ExecutableResolver,
        Effect.gen(function* () {
          const delegate = yield* ExecutableResolver.ExecutableResolver
          return ExecutableResolver.ExecutableResolver.of({
            resolve: (request) =>
              Effect.sync(() => {
                resolutions += 1
              }).pipe(Effect.andThen(delegate.resolve(request))),
          })
        }),
      ).pipe(Layer.provide(fixtureResolverLayer))
      const runtimeLayer = () =>
        objectRuntimeLayer(
          {
            addresses: [{ address, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
            scheduler: { pollInterval: "1 day" },
          },
          storage,
        ).pipe(Layer.provide(resolver))
      const input = {
        to: address,
        sessionId: "session:catalog-recovery",
        idempotencyKey: "catalog-recovery",
        prompt: "retain authority",
      }
      const receipt = yield* provideScoped(
        runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const admitted = yield* runtime.send(input)
          const claim = yield* store.claimExecution({
            commandId: "catalog-recovery:claim",
            runId: admitted.runId,
            ownerId: objectWorkerId,
          })
          yield* store.complete({ ...claim, commandId: "catalog-recovery:complete", result: completedResult("done") })
          expect(admitted.duplicate).toBe(false)
          return admitted
        }),
      )
      const forked = yield* provideScoped(
        runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* runtime.send(input)).toEqual(receipt)
          const beforeRead = resolutions
          expect((yield* store.loadExecution(receipt.runId)).executableManifest).toEqual(assistantRef.manifest)
          expect(resolutions).toBe(beforeRead)
          yield* runtime.rewind(receipt.runId, { commandId: "catalog-recovery:rewind", toSequence: 0 })
          const fork = yield* runtime.fork(receipt.runId, {
            commandId: "catalog-recovery:fork",
            atSequence: 0,
            budget: {},
          })
          expect((yield* store.loadExecution(fork.runId)).executableManifest).toEqual(assistantRef.manifest)
          return fork.runId
        }),
      )
      yield* provideScoped(
        runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* runtime.send(input)).toEqual(receipt)
          const beforeRead = resolutions
          expect((yield* store.loadExecution(receipt.runId)).executableManifest).toEqual(assistantRef.manifest)
          expect((yield* store.loadExecution(forked)).executableManifest).toEqual(assistantRef.manifest)
          expect(
            (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((entry) => entry._tag),
          ).toContain("RunRewound")
          expect((yield* runtime.history({ runId: forked, cursor: -1, limit: 100 }))[0]?.executableRef).toEqual(
            assistantRef.ref,
          )
          expect(resolutions).toBe(beforeRead)
        }),
      )
      expect(resolutions).toBeGreaterThan(0)
    }),
  )

  it.effect("stores each executable once while hydrating full Run and admission DTOs", () =>
    Effect.gen(function* () {
      const persisted = yield* encode(fixture())
      const wire = yield* decodeReceipt(persisted.data!, WireRuntimeState)
      expect(wire.executableCatalog.size).toBe(1)
      expect(wire.executableCatalog.get(executable.ref.executable)).toEqual(executable.manifest)
      expect(wire.runs.get(runId)).not.toHaveProperty("executableManifest")
      expect(wire.idempotency.get("admit-codec")!.executable).toEqual(executable.ref)
      expect(wire.addressBindings.get(address)).toEqual(executable.ref)
      const recovered = yield* decode(persisted, fresh())
      expect(recovered.runs.get(runId)!.executableManifest).toEqual(executable.manifest)
      expect(recovered.idempotency.get("admit-codec")!.executable).toEqual(executable)
      expect(recovered.addressBindings.get(address)).toEqual(executable)
    }),
  )

  it.effect("retains catalog entries after address replacement even without active Runs", () =>
    Effect.gen(function* () {
      const replacement = makeTest("catalog-replacement", "1")
      const original = yield* encode({ ...fresh(), addressBindings: new Map([[address, executable]]) })
      const first = yield* makeCodec().read(original, fresh())
      const next = yield* encode({ ...first, addressBindings: new Map([[address, replacement]]) })
      const recovered = yield* makeCodec().read(next, fresh())
      expect(recovered.runs.size).toBe(0)
      expect([...recovered.executableCatalog.keys()]).toEqual([executable.ref.executable, replacement.ref.executable])
      expect(recovered.addressBindings.get(address)).toEqual(replacement)
      expect(yield* encode(recovered)).toEqual(next)
    }),
  )

  it.effect("rejects missing, tampered, divergent and inline executable authority after cache warming", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const other = makeTest("catalog-other", "1")
      const persisted = freeze(yield* encode(fixture()))
      yield* codec.read(persisted, fresh())
      const catalog = normalize(
        new Map([
          [executable.ref.executable, executable.manifest],
          [other.ref.executable, other.manifest],
        ]),
      )
      const withOther = yield* apply(
        persisted,
        [{ op: "set", path: ["data", "fields", "executableCatalog"], value: catalog }],
        "corruption",
      )
      const root = ["data", "fields", "runs", "entries", `s:${runId}`, "fields"]
      const malformed = [
        yield* apply(persisted, [{ op: "remove", path: ["data", "fields", "executableCatalog"] }], "corruption"),
        yield* apply(
          persisted,
          [{ op: "set", path: ["data", "fields", "executableCatalog"], value: normalize(new Map()) }],
          "corruption",
        ),
        yield* apply(
          persisted,
          [
            {
              op: "set",
              path: ["data", "fields", "executableCatalog"],
              value: normalize(new Map([[other.ref.executable, executable.manifest]])),
            },
          ],
          "corruption",
        ),
        yield* apply(
          persisted,
          [
            {
              op: "set",
              path: ["data", "fields", "executableCatalog", "entries", `s:${executable.ref.executable}`],
              value: normalize(other.manifest),
            },
          ],
          "corruption",
        ),
        yield* apply(
          persisted,
          [{ op: "set", path: [...root, "executableRef"], value: normalize(other.ref) }],
          "corruption",
        ),
        yield* apply(
          withOther,
          [{ op: "set", path: [...root, "executableRef"], value: normalize(other.ref) }],
          "corruption",
        ),
        yield* apply(
          withOther,
          [
            {
              op: "set",
              path: ["data", "fields", "idempotency", "entries", "s:admit-codec", "fields", "executable"],
              value: normalize(other.ref),
            },
          ],
          "corruption",
        ),
        yield* apply(
          persisted,
          [
            {
              op: "set",
              path: ["data", "fields", "addressBindings", "entries", `s:${address}`],
              value: normalize({ ...executable.ref, active: other.ref.active }),
            },
          ],
          "corruption",
        ),
        yield* apply(
          persisted,
          [{ op: "set", path: [...root, "executableManifest"], value: normalize(executable.manifest) }],
          "corruption",
        ),
      ]
      for (const damaged of malformed) {
        expect((yield* codec.read(damaged, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
        expect((yield* makeCodec().read(damaged, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      }
      expect(yield* encode(yield* codec.read(persisted, fresh()))).toEqual(persisted)
    }),
  )

  it.effect("does not reuse mutable normalized input before domain validation", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const persisted = yield* encode(fixture())
      expect((yield* codec.read(persisted, fresh())).nextRunCounter).toBe(11)
      const data = persisted.data
      if (
        !Schema.is(Schema.Struct({ type: Schema.Literal("object"), fields: Schema.Record(Schema.String, Value) }))(data)
      ) {
        return yield* Effect.die("normalized fixture is not an object")
      }
      Reflect.set(data.fields, "nextRunCounter", 99)
      expect((yield* codec.read(persisted, fresh())).nextRunCounter).toBe(99)
      Reflect.set(data.fields, "nextRunCounter", -1)
      expect((yield* codec.read(persisted, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  it.effect("retains unchanged private maps while refreshing local subscriber ownership", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const persisted = freeze(yield* encode(fixture()))
      const local = yield* codec.read(persisted, fresh())
      let previous: RuntimeState | undefined
      const changed = yield* codec.prepare(persisted, local, Schema.Undefined, (state) => {
        previous = state
        return Effect.succeed([undefined, { ...state, nextRunCounter: state.nextRunCounter + 1 }] as const)
      })
      const head = yield* apply(persisted, changed.patches, "encoding")
      yield* codec.prepare(head, local, Schema.Undefined, (state) => {
        expect(state.runs).toBe(previous!.runs)
        expect(state.idempotency).toBe(previous!.idempotency)
        expect(state.addressBindings).toBe(previous!.addressBindings)
        return Effect.succeed([undefined, state] as const)
      })
      const run = local.runs.get(runId)!
      const subscribers = new Map(run.subscribers)
      yield* codec.prepare(
        head,
        { ...local, runs: new Map(local.runs).set(runId, { ...run, subscribers }) },
        Schema.Undefined,
        (state) => {
          expect(state.runs).not.toBe(previous!.runs)
          expect(state.runs.get(runId)!.subscribers).toBe(subscribers)
          return Effect.succeed([undefined, state] as const)
        },
      )
      expect(yield* encode(yield* makeCodec().read(head, fresh()))).toEqual(head)
    }),
  )

  it.effect("reuses private history nodes inside a changed Run without exposing cached state", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const persisted = freeze(yield* encode(fixture()))
      const local = yield* codec.read(persisted, fresh())
      const secondRead = yield* codec.read(persisted, local)
      expect(secondRead.runs).not.toBe(local.runs)
      expect(secondRead.runs.get(runId)!.events).toBe(local.runs.get(runId)!.events)
      expect(Object.isFrozen(local.runs.get(runId)!.events)).toBe(true)
      let retainedEvent: RunEvent | undefined
      let retainedEntry: Entry | undefined
      let retainedCheckpoint: ExecutionCheckpoint | undefined
      const changed = yield* codec.prepare(persisted, local, Schema.Undefined, (state) => {
        const run = state.runs.get(runId)!
        retainedEvent = run.events[0]
        retainedEntry = state.sessions.get("session-codec")!.entries.get("entry-1")
        retainedCheckpoint = run.checkpoint
        expect(run.events).not.toBe(local.runs.get(runId)!.events)
        expect(retainedEntry).not.toBe(local.sessions.get("session-codec")!.entries.get("entry-1"))
        return Effect.succeed([
          undefined,
          {
            ...state,
            runs: new Map(state.runs).set(runId, {
              ...run,
              lastSequence: 2,
              events: [...run.events, event(2)],
            }),
          },
        ] as const)
      })
      const head = yield* apply(persisted, changed.patches, "encoding")
      const repeated = yield* codec.prepare(head, local, Schema.Undefined, (state) => {
        const run = state.runs.get(runId)!
        expect(run.events[0]).toBe(retainedEvent)
        expect(run.checkpoint).toBe(retainedCheckpoint)
        expect(state.sessions.get("session-codec")!.entries.get("entry-1")).toBe(retainedEntry)
        expect(run.events).toHaveLength(2)
        return Effect.succeed([undefined, state] as const)
      })
      expect(repeated.patches).toEqual([])
      const recovered = yield* makeCodec().read(head, fresh())
      expect(recovered.runs.get(runId)!.events).toEqual([event(1), event(2)])
      const model = recovered.sessions.get("session-codec")!.entries.get("entry-1")
      expect(model?._tag).toBe("ModelResponse")
      if (model?._tag === "ModelResponse") expect(model.content.every(Response.isPart)).toBe(true)
      expect(yield* encode(recovered)).toEqual(head)
    }),
  )

  it.effect("isolates mutable public reads and returned receipts from private codec reuse", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const inputSchema = Schema.Struct({
        bytes: Schema.Uint8Array,
        date: Schema.Date,
        nested: Schema.ReadonlyMap(Schema.String, Schema.Struct({ value: Schema.String })),
      })
      const input = {
        bytes: new Uint8Array([1, 2, 3]),
        date: yield* Schema.decodeEffect(Schema.DateFromString)(instant),
        nested: new Map([["key", { value: "original" }]]),
      }
      const original = fixture()
      const persisted = freeze(
        yield* encode({
          ...original,
          operations: new Map(original.operations).set(`${runId}\0operation-codec`, { ...operation, input }),
        }),
      )
      const publicState = yield* codec.read(persisted, fresh())
      const exposed = publicState.operations.get(`${runId}\0operation-codec`)!.input
      if (!Schema.is(inputSchema)(exposed)) return yield* Effect.die("mutable codec fixture was not restored")
      exposed.bytes[0] = 99
      exposed.date.setUTCFullYear(2000)
      if (exposed.nested instanceof Map) exposed.nested.set("key", { value: "changed" })
      const publicEntries = publicState.sessions.get("session-codec")!.entries
      if (publicEntries instanceof Map) publicEntries.clear()
      if (publicState.executableCatalog instanceof Map) publicState.executableCatalog.clear()
      const prepared = yield* codec.prepare(persisted, publicState, Schema.Unknown, (state) => {
        const current = state.operations.get(`${runId}\0operation-codec`)!.input
        expect(current).toEqual(input)
        expect(state.sessions.get("session-codec")!.entries.size).toBe(entries().length)
        expect(state.executableCatalog.get(executable.ref.executable)).toEqual(executable.manifest)
        return Effect.succeed([current, { ...state, nextRunCounter: state.nextRunCounter + 1 }] as const)
      })
      const receipt = yield* decodeReceipt(prepared.receipt, inputSchema)
      receipt.bytes[0] = 77
      receipt.date.setUTCFullYear(1999)
      if (receipt.nested instanceof Map) receipt.nested.clear()
      const head = yield* apply(persisted, prepared.patches, "encoding")
      yield* codec.prepare(head, publicState, Schema.Undefined, (state) => {
        expect(state.operations.get(`${runId}\0operation-codec`)!.input).toEqual(input)
        return Effect.succeed([undefined, state] as const)
      })
      const recovered = yield* decode(head, fresh())
      expect(recovered.operations.get(`${runId}\0operation-codec`)!.input).toEqual(input)
      expect(recovered.nextRunCounter).toBe(original.nextRunCounter + 1)
      const unsupported = Object.defineProperty({}, "callback", { value: () => undefined })
      const rejected = yield* codec
        .prepare(head, publicState, Schema.Unknown, (state) => Effect.succeed([unsupported, state] as const))
        .pipe(Effect.flip)
      expect(rejected.reason).toBe("encoding")
    }),
  )

  it.effect("validates fresh changed domain fields and Session ancestry after warming codec caches", () =>
    Effect.gen(function* () {
      const codec = makeCodec()
      const persisted = freeze(yield* encode(fixture()))
      yield* codec.read(persisted, fresh())
      yield* codec.prepare(persisted, fresh(), Schema.Undefined, (state) => Effect.succeed([undefined, state] as const))
      const corruptions = [
        { path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "attemptFence"], value: -1 },
        { path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "unexpected"], value: true },
        { path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "leaf"], value: "missing" },
      ]
      for (const corruption of corruptions) {
        const damaged = yield* apply(persisted, [{ op: "set", ...corruption }], "corruption")
        expect((yield* codec.read(damaged, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
        let reduced = false
        const failed = yield* codec
          .prepare(damaged, fresh(), Schema.Undefined, (state) => {
            reduced = true
            return Effect.succeed([undefined, state] as const)
          })
          .pipe(Effect.flip)
        expect(failed.reason).toBe("corruption")
        expect(reduced).toBe(false)
      }
      expect(yield* encode(yield* codec.read(persisted, fresh()))).toEqual(persisted)
    }),
  )

  it.effect("rehydrates Effect Usage in retained model telemetry", () =>
    Effect.gen(function* () {
      const usage = Response.Usage.make({
        inputTokens: { total: 3, uncached: 3, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 2, text: 2, reasoning: undefined },
      })
      const completed: RunEvent = {
        ...(yield* Schema.decodeEffect(RunEventBase)(event(1)).pipe(Effect.orDie)),
        _tag: "ModelAttemptCompleted",
        deliveryId: "usage-delivery",
        turn: 0,
        modelCallId: "usage-call",
        modelAttemptId: "usage-attempt",
        attempt: 0,
        completedAt: 0,
        usageAt: 0,
        finishReason: "stop",
        usage,
      }
      const persisted = detach(
        yield* encode({
          ...fixture(),
          runs: new Map([[runId, { ...storedRun(), events: [completed] }]]),
        }),
      )
      const recovered = yield* decode(persisted, fresh())
      const retained = recovered.runs.get(runId)?.events[0]
      expect(retained?._tag).toBe("ModelAttemptCompleted")
      if (retained?._tag !== "ModelAttemptCompleted") return
      expect(retained.usage).toBeInstanceOf(Response.Usage)
      expect(yield* Schema.encodeEffect(Response.Usage)(retained.usage).pipe(Effect.orDie)).toEqual(
        yield* Schema.encodeEffect(Response.Usage)(usage).pipe(Effect.orDie),
      )
      expect(yield* encode(recovered)).toEqual(persisted)
    }),
  )

  it.effect("recovers newly created cursors before the first event", () =>
    Effect.gen(function* () {
      const state: RuntimeState = {
        ...fresh(),
        runs: new Map([[runId, { ...storedRun(), events: [], lastSequence: -1, lastTurnCompletedSequence: -1 }]]),
        hostSessions: new Map([
          [
            "empty",
            {
              session: { id: "empty", createdAt: instant },
              lastCursor: -1,
              events: [],
              subscribers: new Map(),
            },
          ],
        ]),
        treeRoots: new Map([[runId, { earliestPosition: 0, lastPosition: -1, events: [], subscribers: new Map() }]]),
      }
      const recovered = yield* decode(detach(yield* encode(state)), fresh())
      expect(recovered.runs.get(runId)?.lastSequence).toBe(-1)
      expect(recovered.runs.get(runId)?.lastTurnCompletedSequence).toBe(-1)
      expect(recovered.hostSessions.get("empty")?.lastCursor).toBe(-1)
      expect(recovered.treeRoots.get(runId)?.lastPosition).toBe(-1)
    }),
  )

  // oxlint-disable-next-line complexity -- This recovery assertion intentionally verifies all persisted authority and Session invariants from one decoded state.
  it.effect("reconstructs authority, unknown effects, waits and branched Session history on a fresh host", () =>
    // oxlint-disable-next-line complexity -- This recovery assertion intentionally verifies all persisted authority and Session invariants from one decoded state.
    Effect.gen(function* () {
      const original = fixture()
      const persisted = detach(yield* encode(original))
      const recovered = yield* decode(persisted, fresh())
      expect(recovered.sessions.get("session-codec")?.writerEpoch).toBe(epoch)
      expect(recovered.sessions.get("session-codec")?.leaf).toBe("entry-3")
      expect(recovered.sessions.get("session-codec")?.order).toEqual(entries().map((entry) => entry.id))
      expect(recovered.sessions.get("session-codec")?.entries.get("entry-4")?.parentId).toBe("entry-0")
      const model = recovered.sessions.get("session-codec")?.entries.get("entry-1")
      expect(model?._tag).toBe("ModelResponse")
      if (model?._tag === "ModelResponse") expect(model.content.every(Response.isPart)).toBe(true)
      const compacted = recovered.sessions.get("session-codec")?.entries.get("entry-2")
      expect(compacted?._tag).toBe("Compaction")
      if (compacted?._tag === "Compaction") expect(Prompt.isPrompt(compacted.projectedHistory)).toBe(true)
      expect(recovered.operations.get(`${runId}\0operation-codec`)).toEqual(operation)
      expect(recovered.waits.get(`${runId}\0${wait.waitId}`)).toEqual(wait)
      expect(recovered.runs.get(runId)?.attemptFence).toBe(4)
      expect(recovered.runs.get(runId)?.cancellationRequested).toBe(true)
      expect(recovered.runs.get(runId)?.checkpoints.has(0)).toBe(true)
      expect(recovered.runs.get(runId)?.checkpoints.get(0)).toBeUndefined()
      expect(recovered.runs.get(runId)?.events).toEqual([event(1)])
      expect(recovered.programOperations.get("program-op")?.status).toBe("unknown")
      expect(recovered.programStates.get(runId)?.tokens).toBe(25)
      expect(recovered.scheduleClaims.get("schedule-codec")?.occurrence).toBe(7)
      expect(recovered.workers.get("worker-codec")?.incarnation).toBe("incarnation-codec")
      expect(recovered.artifacts.get("artifact")?.updates[0]?.update).toEqual(new Uint8Array([1, 2]))
      expect(recovered.agentNames.get("__proto__")).toBe("prototype-safe")
      expect(detach(yield* encode(recovered))).toEqual(persisted)
    }),
  )

  it.effect("keeps local subscriptions and lifecycle out of canonical recovery", () =>
    Effect.gen(function* () {
      const original = fixture()
      const queue = yield* Queue.bounded<RunEvent, SubscriberError>(8)
      const localRun = { ...storedRun(), subscribers: new Map([[7, queue]]) }
      const local = {
        ...fresh(),
        closed: true,
        nextSubscriberId: 8,
        subscriberQueueCapacity: 17,
        runs: new Map([[runId, localRun]]),
      }
      const recovered = yield* decode(yield* encode(original), local)
      expect(recovered.runs.get(runId)?.subscribers).toBe(localRun.subscribers)
      expect(recovered.closed).toBe(true)
      expect(recovered.nextSubscriberId).toBe(8)
      expect(recovered.subscriberQueueCapacity).toBe(17)
      expect(recovered.publications).toBe(local.publications)
      expect(yield* encode(recovered)).toEqual(yield* encode(original))
    }),
  )

  it.effect("appends history with linear cumulative delta bytes and applies removals exactly", () =>
    Effect.gen(function* () {
      // oxlint-disable-next-line oxc/no-accumulating-spread -- The cumulative immutable state is the delta-encoding subject under test.
      let state: RuntimeState = {
        ...fresh(),
        runs: new Map([[runId, { ...storedRun(), events: [], lastSequence: 0 }]]),
      }
      let previous = yield* encode(state)
      let early = 0
      let late = 0
      for (let i = 0; i < 64; i++) {
        const session = state.sessions.get("history") ?? emptySession()
        const entry: Entry = { _tag: "Memory", id: `entry-${i}`, parentId: session.leaf, items: ["x".repeat(512)] }
        const run = state.runs.get(runId)!
        state = Object.assign({}, state, {
          runs: new Map([
            [runId, Object.assign({}, run, { events: run.events.concat(event(i + 1)), lastSequence: i + 1 })],
          ]),
          sessions: new Map([
            [
              "history",
              Object.assign({}, session, {
                entries: new Map(session.entries).set(entry.id, entry),
                order: session.order.concat(entry.id),
                leaf: entry.id,
                counter: i + 1,
              }),
            ],
          ]),
        })
        const next = yield* encode(state)
        const patches = diff(previous, next)
        expect(yield* apply(previous, patches, "encoding")).toEqual(next)
        const byteLength = new TextEncoder().encode(
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(patches).pipe(Effect.orDie),
        ).byteLength
        if (i < 32) early += byteLength
        else late += byteLength
        previous = next
      }
      expect(late).toBeLessThan(early * 1.5)
      const removed = yield* encode({ ...state, sessions: new Map(), runs: new Map() })
      expect(yield* apply(previous, diff(previous, removed), "encoding")).toEqual(removed)
    }),
  )

  it.effect("recovers typed operation failures and rejects incomplete framework errors", () =>
    Effect.gen(function* () {
      const key = `${runId}\0${operation.operationId}`
      const error = AgentExecutionFailure.make({
        message: "model connection closed",
        cause: new Error("provider socket closed"),
      })
      const persisted = detach(
        yield* encode({
          ...fixture(),
          operations: new Map([[key, { ...operation, kind: "model", status: "failed", error }]]),
        }),
      )
      const recovered = yield* decode(persisted, fresh())
      const failure = recovered.operations.get(key)?.error
      expect(failure).toBeInstanceOf(AgentExecutionFailure)
      expect(failure).toMatchObject({
        message: "model connection closed",
        cause: { message: "provider socket closed" },
      })
      const incomplete = yield* apply(
        persisted,
        [
          {
            op: "remove",
            path: ["data", "fields", "operations", "entries", `s:${key}`, "fields", "error", "fields", "hint"],
          },
        ],
        "encoding",
      )
      expect((yield* decode(incomplete, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )
  it.effect("retains domain failures nested in opaque resolutions across command and state recovery", () =>
    Effect.gen(function* () {
      const error = AgentExecutionFailure.make({ message: "interrupted provider", cause: new Error("closed") })
      const encoded = yield* encodeCommandValue({ _tag: "Failed", error }, OperationResolution)
      const resolution = yield* decodeReceipt(
        yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(encoded).pipe(Effect.orDie),
        ).pipe(Effect.orDie),
        OperationResolution,
      )
      expect(resolution._tag).toBe("Failed")
      if (resolution._tag !== "Failed") return
      expect(resolution.error).toBeInstanceOf(AgentExecutionFailure)
      const key = `${runId}\0${operation.operationId}`
      const persisted = detach(
        yield* encode({
          ...fixture(),
          operations: new Map([[key, { ...operation, status: "failed", resolution, error: resolution.error }]]),
        }),
      )
      const recovered = yield* decode(persisted, fresh())
      expect(recovered.operations.get(key)?.error).toBeInstanceOf(AgentExecutionFailure)
      expect(yield* encode(recovered)).toEqual(persisted)
    }),
  )

  it.effect("recovers a nested approval denial and rejects its incomplete persisted shape", () =>
    Effect.gen(function* () {
      const key = `${runId}\0${operation.operationId}`
      const error = NestedOperationDenied.make({
        operationKey: "outer",
        ordinal: 0,
        capability: "write",
        reason: "denied",
      })
      const persisted = detach(
        yield* encode({
          ...fixture(),
          operations: new Map([[key, { ...operation, kind: "nested", status: "failed", error }]]),
        }),
      )
      const recovered = yield* decode(persisted, fresh())
      expect(recovered.operations.get(key)?.error).toBeInstanceOf(NestedOperationDenied)
      expect(recovered.operations.get(key)?.error).toEqual(error)
      const incomplete = yield* apply(
        persisted,
        [
          {
            op: "remove",
            path: ["data", "fields", "operations", "entries", `s:${key}`, "fields", "error", "fields", "capability"],
          },
        ],
        "encoding",
      )
      expect((yield* decode(incomplete, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  it.effect("recovers typed fan-out and Program failures through aggregate codecs", () =>
    Effect.gen(function* () {
      const fanOutError = AgentExecutionFailure.make({
        message: "child execution closed",
        cause: new Error("child provider socket closed"),
      })
      const programError = ProgramAgentFailure.make({
        selection: "worker",
        operation: ProgramOperationName.make("step-codec"),
        cause: "child Run failed",
      })
      const original = fixture()
      const persisted = detach(
        yield* encode({
          ...original,
          fanOuts: new Map([
            [
              "fanout-codec",
              {
                fanOutId: "fanout-codec",
                parentRunId: runId,
                idempotencyKey: "fanout-key",
                digest: "fanout-digest",
                status: "failed" as const,
                join: { _tag: "AllSettled" as const },
                remainder: "await" as const,
                concurrency: 1,
                members: [
                  {
                    ordinal: 0,
                    key: "child",
                    selection: "worker",
                    prompt,
                    childRunId: "child-codec",
                    depth: 1,
                    readiness: "settled" as const,
                    status: "failed" as const,
                    terminalEventId: "child-codec:1",
                    error: fanOutError,
                  },
                ],
              },
            ],
          ]),
          programOperations: new Map([
            [
              "program-op",
              {
                ...original.programOperations.get("program-op")!,
                status: "failed" as const,
                error: programError,
              },
            ],
          ]),
        }),
      )
      const recovered = yield* decode(persisted, fresh())
      const memberError = recovered.fanOuts.get("fanout-codec")?.members[0]?.error
      expect(memberError).toBeInstanceOf(AgentExecutionFailure)
      expect(memberError).toMatchObject({
        _tag: fanOutError._tag,
        message: fanOutError.message,
        cause: { message: "child provider socket closed" },
        hint: fanOutError.hint,
      })
      const recoveredProgramError = recovered.programOperations.get("program-op")?.error
      expect(recoveredProgramError).toBeInstanceOf(ProgramAgentFailure)
      expect(recoveredProgramError).toMatchObject({
        _tag: programError._tag,
        selection: "worker",
        operation: "step-codec",
        cause: "child Run failed",
        hint: programError.hint,
      })
      const incompleteFanOut = yield* apply(
        persisted,
        [
          {
            op: "remove",
            path: [
              "data",
              "fields",
              "fanOuts",
              "entries",
              "s:fanout-codec",
              "fields",
              "members",
              "items",
              "0",
              "fields",
              "error",
              "fields",
              "hint",
            ],
          },
        ],
        "encoding",
      )
      expect((yield* decode(incompleteFanOut, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      const incompleteProgram = yield* apply(
        persisted,
        [
          {
            op: "remove",
            path: [
              "data",
              "fields",
              "programOperations",
              "entries",
              "s:program-op",
              "fields",
              "error",
              "fields",
              "hint",
            ],
          },
        ],
        "encoding",
      )
      expect((yield* decode(incompleteProgram, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  it.effect("rejects corrupt domain records and noncanonical sequence structure", () =>
    Effect.gen(function* () {
      const persisted = yield* encode(fixture())
      const corruptStatus = yield* apply(
        persisted,
        [
          {
            op: "set",
            path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "status"],
            value: "invented-status",
          },
        ],
        "encoding",
      )
      expect((yield* decode(corruptStatus, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      const corruptEpoch = yield* apply(
        persisted,
        [
          {
            op: "set",
            path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "writerEpoch", "value"],
            value: "01",
          },
        ],
        "encoding",
      )
      expect((yield* decode(corruptEpoch, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      const brokenOrder = yield* apply(
        persisted,
        [
          {
            op: "remove",
            path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "order", "items", "0"],
          },
        ],
        "encoding",
      )
      expect((yield* decode(brokenOrder, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      const brokenParent = yield* apply(
        persisted,
        [
          {
            op: "set",
            path: [
              "data",
              "fields",
              "sessions",
              "entries",
              "s:session-codec",
              "fields",
              "entries",
              "entries",
              "s:entry-0",
              "fields",
              "parentId",
            ],
            value: "entry-4",
          },
        ],
        "encoding",
      )
      expect((yield* decode(brokenParent, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
      const unsupported = yield* decode({ ...persisted, version: 2 }, fresh()).pipe(Effect.flip)
      expect(unsupported).toBeInstanceOf(DurabilityFailure)
      expect(unsupported.reason).toBe("unsupported-version")
    }),
  )

  it.effect("rejects live executable registrations without invoking callbacks", () =>
    Effect.gen(function* () {
      let calls = 0
      const bad = {
        ...registration,
        payload: {
          execute: () => {
            calls++
          },
        },
      }
      const state = { ...fresh(), registrationCatalog: new Map([[bad.pin, { digest: "bad", value: bad }]]) }
      expect((yield* encode(state).pipe(Effect.flip)).reason).toBe("encoding")
      expect(calls).toBe(0)
      interface Cycle {
        self?: Cycle
      }
      const cycle: Cycle = {}
      cycle.self = cycle
      expect(
        (yield* encode({
          ...state,
          registrationCatalog: new Map([[bad.pin, { digest: "cycle", value: { ...registration, payload: cycle } }]]),
        }).pipe(Effect.flip)).reason,
      ).toBe("encoding")
    }),
  )

  it.effect("recovers rich receipts only through their required domain schema", () =>
    Effect.gen(function* () {
      const Receipt = Schema.Struct({
        prompt: Prompt.Prompt,
        time: Schema.DateTimeUtcFromString,
        amount: Schema.BigInt,
        optional: Schema.Unknown,
      })
      const input = { prompt, time: DateTime.makeUnsafe(instant), amount: epoch, optional: undefined }
      const encoded = yield* encodeCommandValue(input, Receipt)
      const persisted = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(encoded).pipe(Effect.orDie),
      ).pipe(Effect.orDie)
      const recovered = yield* decodeReceipt(persisted, Receipt)
      expect(Prompt.isPrompt(recovered.prompt)).toBe(true)
      expect(DateTime.toEpochMillis(recovered.time)).toBe(DateTime.toEpochMillis(input.time))
      expect(recovered.amount).toBe(epoch)
      expect(Object.hasOwn(recovered, "optional")).toBe(true)
      expect(recovered.optional).toBeUndefined()
      expect(
        (yield* decodeReceipt(persisted, Schema.Struct({ unrelated: Schema.String })).pipe(Effect.flip)).reason,
      ).toBe("corruption")
    }),
  )

  it.effect("uses one session domain codec for state entries and append receipts", () =>
    Effect.gen(function* () {
      const entry = entries()[1]!
      const receipt = yield* encodeCommandValue(entry, SessionEntryCodec)
      const recovered = yield* decodeReceipt(receipt, SessionEntryCodec)
      expect(recovered.id).toBe("entry-1")
      expect(recovered.parentId).toBe("entry-0")
      expect(recovered._tag).toBe("ModelResponse")
      if (recovered._tag === "ModelResponse") expect(recovered.content.every(Response.isPart)).toBe(true)
      const append = yield* Schema.decodeEffect(SessionAppendInputCodec)({ _tag: "Memory", items: ["retained"] }).pipe(
        Effect.orDie,
      )
      expect(append).toEqual({ _tag: "Memory", items: ["retained"] })
      const compaction = yield* encodeCommandValue(
        { _tag: "Compaction", projectedHistory: prompt, telemetry: [] },
        EntryPayload,
      )
      expect((yield* decodeReceipt(compaction, SessionAppendInputCodec).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )
})
