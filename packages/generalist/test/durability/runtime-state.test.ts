import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Queue, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { EntryPayload, type Entry } from "../../src/core/context/session.js"
import * as RunBudget from "../../src/core/durable/run-budget.js"
import { ProgramAgentFailure, ProgramOperationName } from "../../src/core/program/capabilities.js"
import { DurabilityFailure } from "../../src/durability/errors.js"
import { apply, type State } from "../../src/durability/internal/protocol.js"
import { decode, decodeReceipt, diff, encode, encodeCommandValue } from "../../src/durability/internal/runtime-state.js"
import { SessionAppendInputCodec, SessionEntryCodec } from "../../src/durability/internal/runtime-state/session.js"
import { Address } from "../../src/runtime/address.js"
import { Cursor } from "../../src/runtime/cursor.js"
import { AgentExecutionFailure } from "../../src/runtime/errors.js"
import { makeTest } from "../../src/runtime/executable/manifest.js"
import type { ExecutionCheckpoint } from "../../src/runtime/execution/state.js"
import type { ScheduleRecord } from "../../src/runtime/execution/trigger/schedule.js"
import type { OperationRecord } from "../../src/runtime/operation/record.js"
import { RunId } from "../../src/runtime/run.js"
import type { RunEvent } from "../../src/runtime/run/event.js"
import type { RunWait } from "../../src/runtime/run/wait.js"
import { emptySession, emptyState, type RuntimeState, type StoredRun, type SubscriberError } from "../../src/runtime/state/state.js"
import * as TreeCursor from "../../src/runtime/tree/cursor.js"

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
  budget: RunBudget.make({ tokens: 200, toolCalls: 4 }),
  state: { logicalOperationId: 7, outcome: { _tag: "Unknown", operationId: "operation-codec" }, extra: { epoch, absent: undefined } },
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
  input: { amount: epoch, absent: undefined, bytes: new Uint8Array([1, 2, 255]), nested: new Map([["__proto__", { safe: true }]]) },
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
  message: { id: "message-codec", to: address, sessionId: "session-codec", prompt, idempotencyKey: "admit-codec", correlationId: "correlation", metadata: {} },
  rootRunId: runId,
  depth: 0,
  treePolicy: { maxDepth: 3, maxSubagents: 4 },
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
  steering: [{ entryId: "steering-codec", runId, sequence: 1, idempotencyKey: "steer", digest: "steer-digest", prompt, policy: "enqueue", from: { user: "operator" }, consumedOperationId: "operation-codec" }],
  registrations: [registration],
  checkpoints: new Map([[0, undefined], [1, checkpoint]]),
})
const entries = (): ReadonlyArray<Entry> => [
  { _tag: "Message", id: "entry-0", parentId: null, message: prompt.content[0]!, metadata: { epoch, absent: undefined } },
  { _tag: "ModelResponse", id: "entry-1", parentId: "entry-0", content: [
    Response.makePart("tool-call", { id: "call", name: "pay", params: { amount: epoch }, providerExecuted: false }),
    Response.makePart("finish", { reason: "tool-calls", usage: new Response.Usage({
      inputTokens: { uncached: undefined, total: 5, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 2, text: undefined, reasoning: undefined },
    }), response: undefined }),
  ] },
  { _tag: "Compaction", id: "entry-2", parentId: "entry-1", projectedHistory: prompt, telemetry: [], summary: "retain evidence" },
  { _tag: "Handoff", id: "entry-3", parentId: "entry-2", handoffId: "handoff", target: "next", projectedHistory: prompt },
  { _tag: "BranchSummary", id: "entry-4", parentId: "entry-0", summary: "alternate branch" },
]
const fixture = (): RuntimeState => {
  const history = entries()
  const schedule: ScheduleRecord = {
    scheduleId: "schedule-codec", rrule: "FREQ=DAILY", rule: { frequency: "DAILY", interval: 1 },
    definition: { executable, registrations: [registration], sessionId: "session-codec", prompt, budget: RunBudget.make({}) },
    nextAt: instant, occurrence: 7, status: "active", createdAt: instant,
  }
  const snapshot = { sha256: "a".repeat(64), mediaType: "text/plain", bytes: 3 }
  return {
    ...fresh(),
    nextRunCounter: 11, nextOperationCounter: 12, nextSteeringCounter: 13, nextMessageCounter: 14,
    runs: new Map([[runId, storedRun()]]),
    waits: new Map([[`${runId}\0${wait.waitId}`, wait]]),
    sessions: new Map([["session-codec", { entries: new Map(history.map((entry) => [entry.id, entry])), order: history.map((entry) => entry.id), leaf: "entry-3", counter: 20, writerEpoch: epoch, writer: { runId, ownerId: "worker-codec", runAttemptFence: 4 } }]]),
    hostSessions: new Map([["session-codec", { session: { id: "session-codec", createdAt: instant }, lastCursor: 1, events: [{ cursor: Cursor.make(1), event: event(1) }], subscribers: new Map() }]]),
    treeRoots: new Map([[runId, { earliestPosition: 0, lastPosition: 1, events: [{ rootRunId: runId, runId, event: event(1), cursor: TreeCursor.make(runId, 1) }], subscribers: new Map() }]]),
    lanes: new Map([["session-codec", { queue: [runId, "queued-child"], acceptedSequence: 3 }]]),
    idempotency: new Map([["admit-codec", { digest: "admit-digest", executable, receipt: { runId, messageId: "message-codec", acceptedSequence: 1, duplicate: false } }]]),
    registrationCatalog: new Map([[registration.pin, { digest: "registration-digest", value: registration }]]),
    operations: new Map([[`${runId}\0operation-codec`, operation]]),
    programStates: new Map([[runId, { runId, programPin: "program-codec", deadlineMillis: 1000, toolCalls: 2, agentRuns: 1, tokens: 25, logBytes: 80, activeSlots: 1, budget: { agentRuns: 5, concurrency: 2, toolCalls: 10, tokens: 100, wallClockMillis: 5000, logBytes: 200, outputBytes: 1000 } }]]),
    programOperations: new Map([["program-op", { runId, operation: ProgramOperationName.make("step-codec"), authoredOperation: ProgramOperationName.make("step-codec"), kind: "step", capability: "payment", inputDigest: "input", input: { amount: 5 }, replay: "non-idempotent", status: "unknown", childRunIds: ["child-codec"] }]]),
    addressBindings: new Map([[address, executable]]),
    agentNames: new Map([["scope\0name", runId], ["__proto__", "prototype-safe"]]),
    acknowledgements: new Map([[runId, { runId, sequence: Cursor.make(1), acknowledgedAt: instant }]]),
    wakeEvents: new Map([["wake", { _tag: "Webhook", dedupeKey: "wake", source: "payments", payload: { settled: true }, headers: {} }]]),
    schedules: new Map([[schedule.scheduleId, schedule]]),
    scheduleClaims: new Map([[schedule.scheduleId, { ...schedule, ownerId: "worker-codec", leaseExpiresAt: instant }]]),
    artifacts: new Map([["artifact", { head: { artifact: "artifact", crdt: "yjs", version: 1, snapshot }, baseVersion: 0, baseSnapshot: snapshot, updates: [{ artifact: "artifact", base: 0, result: 1, operation: { _tag: "Insert", at: 0, text: "abc" }, attribution: { _tag: "Human", actor: "operator" }, update: new Uint8Array([1, 2]), snapshot }], subscribers: new Map() }]]),
    workers: new Map([["worker-codec", { expiresAt: 1000, incarnation: "incarnation-codec" }]]),
  }
}
const detach = (value: State): State => Schema.decodeUnknownSync(Schema.JsonObject)(JSON.parse(JSON.stringify(value)))

describe("canonical runtime state", () => {
  it.effect("recovers newly created cursors before the first event", () => Effect.gen(function* () {
    const state: RuntimeState = {
      ...fresh(),
      runs: new Map([[runId, { ...storedRun(), events: [], lastSequence: -1, lastTurnCompletedSequence: -1 }]]),
      hostSessions: new Map([["empty", {
        session: { id: "empty", createdAt: instant },
        lastCursor: -1,
        events: [],
        subscribers: new Map(),
      }]]),
      treeRoots: new Map([[runId, { earliestPosition: 0, lastPosition: -1, events: [], subscribers: new Map() }]]),
    }
    const recovered = yield* decode(detach(yield* encode(state)), fresh())
    expect(recovered.runs.get(runId)?.lastSequence).toBe(-1)
    expect(recovered.runs.get(runId)?.lastTurnCompletedSequence).toBe(-1)
    expect(recovered.hostSessions.get("empty")?.lastCursor).toBe(-1)
    expect(recovered.treeRoots.get(runId)?.lastPosition).toBe(-1)
  }))

  it.effect("reconstructs authority, unknown effects, waits and branched Session history on a fresh host", () => Effect.gen(function* () {
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
  }))

  it.effect("keeps local subscriptions and lifecycle out of canonical recovery", () => Effect.gen(function* () {
    const original = fixture()
    const queue = yield* Queue.bounded<RunEvent, SubscriberError>(8)
    const localRun = { ...storedRun(), subscribers: new Map([[7, queue]]) }
    const local = { ...fresh(), closed: true, nextSubscriberId: 8, subscriberQueueCapacity: 17, runs: new Map([[runId, localRun]]) }
    const recovered = yield* decode(yield* encode(original), local)
    expect(recovered.runs.get(runId)?.subscribers).toBe(localRun.subscribers)
    expect(recovered.closed).toBe(true)
    expect(recovered.nextSubscriberId).toBe(8)
    expect(recovered.subscriberQueueCapacity).toBe(17)
    expect(recovered.publications).toBe(local.publications)
    expect(yield* encode(recovered)).toEqual(yield* encode(original))
  }))

  it.effect("appends history with linear cumulative delta bytes and applies removals exactly", () => Effect.gen(function* () {
    let state: RuntimeState = { ...fresh(), runs: new Map([[runId, { ...storedRun(), events: [], lastSequence: 0 }]]) }
    let previous = yield* encode(state)
    let early = 0
    let late = 0
    for (let i = 0; i < 64; i++) {
      const session = state.sessions.get("history") ?? emptySession()
      const entry: Entry = { _tag: "Memory", id: `entry-${i}`, parentId: session.leaf, items: ["x".repeat(512)] }
      const run = state.runs.get(runId)!
      state = { ...state, runs: new Map([[runId, { ...run, events: [...run.events, event(i + 1)], lastSequence: i + 1 }]]), sessions: new Map([["history", { ...session, entries: new Map([...session.entries, [entry.id, entry]]), order: [...session.order, entry.id], leaf: entry.id, counter: i + 1 }]]) }
      const next = yield* encode(state)
      const patches = diff(previous, next)
      expect(yield* apply(previous, patches, "encoding")).toEqual(next)
      const byteLength = new TextEncoder().encode(JSON.stringify(patches)).byteLength
      if (i < 32) early += byteLength
      else late += byteLength
      previous = next
    }
    expect(late).toBeLessThan(early * 1.5)
    const removed = yield* encode({ ...state, sessions: new Map(), runs: new Map() })
    expect(yield* apply(previous, diff(previous, removed), "encoding")).toEqual(removed)
  }))

  it.effect("recovers typed operation failures and rejects incomplete framework errors", () => Effect.gen(function* () {
    const key = `${runId}\0${operation.operationId}`
    const error = AgentExecutionFailure.make({
      message: "model connection closed",
      cause: new Error("provider socket closed"),
    })
    const persisted = detach(yield* encode({
      ...fixture(),
      operations: new Map([[key, { ...operation, kind: "model", status: "failed", error }]]),
    }))
    const recovered = yield* decode(persisted, fresh())
    const failure = recovered.operations.get(key)?.error
    expect(failure).toBeInstanceOf(AgentExecutionFailure)
    expect(failure).toMatchObject({
      message: "model connection closed",
      cause: { message: "provider socket closed" },
    })
    const incomplete = yield* apply(persisted, [{
      op: "remove",
      path: ["data", "fields", "operations", "entries", `s:${key}`, "fields", "error", "fields", "hint"],
    }], "encoding")
    expect((yield* decode(incomplete, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
  }))
  it.effect("recovers typed fan-out and Program failures through aggregate codecs", () => Effect.gen(function* () {
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
    const persisted = detach(yield* encode({
      ...original,
      fanOuts: new Map([["fanout-codec", {
        fanOutId: "fanout-codec",
        parentRunId: runId,
        idempotencyKey: "fanout-key",
        digest: "fanout-digest",
        status: "failed" as const,
        join: { _tag: "AllSettled" as const },
        remainder: "await" as const,
        concurrency: 1,
        members: [{
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
        }],
      }]]),
      programOperations: new Map([["program-op", {
        ...original.programOperations.get("program-op")!,
        status: "failed" as const,
        error: programError,
      }]]),
    }))
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
    const incompleteFanOut = yield* apply(persisted, [{
      op: "remove",
      path: ["data", "fields", "fanOuts", "entries", "s:fanout-codec", "fields", "members", "items", "0", "fields", "error", "fields", "hint"],
    }], "encoding")
    expect((yield* decode(incompleteFanOut, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    const incompleteProgram = yield* apply(persisted, [{
      op: "remove",
      path: ["data", "fields", "programOperations", "entries", "s:program-op", "fields", "error", "fields", "hint"],
    }], "encoding")
    expect((yield* decode(incompleteProgram, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
  }))

  it.effect("rejects corrupt domain records and noncanonical sequence structure", () => Effect.gen(function* () {
    const persisted = yield* encode(fixture())
    const corruptStatus = yield* apply(persisted, [{ op: "set", path: ["data", "fields", "runs", "entries", `s:${runId}`, "fields", "status"], value: "invented-status" }], "encoding")
    expect((yield* decode(corruptStatus, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    const corruptEpoch = yield* apply(persisted, [{ op: "set", path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "writerEpoch", "value"], value: "01" }], "encoding")
    expect((yield* decode(corruptEpoch, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    const brokenOrder = yield* apply(persisted, [{ op: "remove", path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "order", "items", "0"] }], "encoding")
    expect((yield* decode(brokenOrder, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    const brokenParent = yield* apply(persisted, [{ op: "set", path: ["data", "fields", "sessions", "entries", "s:session-codec", "fields", "entries", "entries", "s:entry-0", "fields", "parentId"], value: "entry-4" }], "encoding")
    expect((yield* decode(brokenParent, fresh()).pipe(Effect.flip)).reason).toBe("corruption")
    const unsupported = yield* decode({ ...persisted, version: 2 }, fresh()).pipe(Effect.flip)
    expect(unsupported).toBeInstanceOf(DurabilityFailure)
    expect(unsupported.reason).toBe("unsupported-version")
  }))

  it.effect("rejects live executable registrations without invoking callbacks", () => Effect.gen(function* () {
    let calls = 0
    const bad = { ...registration, payload: { execute: () => { calls++ } } }
    const state = { ...fresh(), registrationCatalog: new Map([[bad.pin, { digest: "bad", value: bad }]]) }
    expect((yield* encode(state).pipe(Effect.flip)).reason).toBe("encoding")
    expect(calls).toBe(0)
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect((yield* encode({ ...state, registrationCatalog: new Map([[bad.pin, { digest: "cycle", value: { ...registration, payload: cycle } }]]) }).pipe(Effect.flip)).reason).toBe("encoding")
  }))

  it.effect("recovers rich receipts only through their required domain schema", () => Effect.gen(function* () {
    const Receipt = Schema.Struct({ prompt: Prompt.Prompt, time: Schema.DateTimeUtcFromString, amount: Schema.BigInt, optional: Schema.Unknown })
    const input = { prompt, time: DateTime.makeUnsafe(instant), amount: epoch, optional: undefined }
    const encoded = yield* encodeCommandValue(input, Receipt)
    const persisted = Schema.decodeUnknownSync(Schema.Json)(JSON.parse(JSON.stringify(encoded)))
    const recovered = yield* decodeReceipt(persisted, Receipt)
    expect(Prompt.isPrompt(recovered.prompt)).toBe(true)
    expect(DateTime.toEpochMillis(recovered.time)).toBe(DateTime.toEpochMillis(input.time))
    expect(recovered.amount).toBe(epoch)
    expect(Object.hasOwn(recovered, "optional")).toBe(true)
    expect(recovered.optional).toBeUndefined()
    expect((yield* decodeReceipt(persisted, Schema.Struct({ unrelated: Schema.String })).pipe(Effect.flip)).reason).toBe("corruption")
  }))

  it.effect("uses one session domain codec for state entries and append receipts", () => Effect.gen(function* () {
    const entry = entries()[1]!
    const receipt = yield* encodeCommandValue(entry, SessionEntryCodec)
    const recovered = yield* decodeReceipt(receipt, SessionEntryCodec)
    expect(recovered.id).toBe("entry-1")
    expect(recovered.parentId).toBe("entry-0")
    expect(recovered._tag).toBe("ModelResponse")
    if (recovered._tag === "ModelResponse") expect(recovered.content.every(Response.isPart)).toBe(true)
    const append = Schema.decodeUnknownSync(SessionAppendInputCodec)({ _tag: "Memory", items: ["retained"] })
    expect(append).toEqual({ _tag: "Memory", items: ["retained"] })
    const compaction = yield* encodeCommandValue({ _tag: "Compaction", projectedHistory: prompt, telemetry: [] }, EntryPayload)
    expect((yield* decodeReceipt(compaction, SessionAppendInputCodec).pipe(Effect.flip)).reason).toBe("corruption")
  }))
})
