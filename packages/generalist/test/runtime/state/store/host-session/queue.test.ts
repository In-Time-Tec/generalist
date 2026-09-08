import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { make as makeAgent } from "../../../../../src/core/agent/service.js"
import { durableIdentity } from "../../../../../src/runtime/executable/registered-agent.js"
import { make as address } from "../../../../../src/runtime/address.js"
import { Prompt } from "effect/unstable/ai"
import { activate, layerRunStore } from "../../../../../src/durability/index.js"
import { ObjectStore } from "../../../../../src/durability/object-store.js"
import { RunStore } from "../../../../../src/runtime/run/store.js"
import { make as makeSimulator, type Client } from "../../../../../src/testing/durability/index.js"
import { alternateAssistantRef, assistantRef, registrationsFor } from "../../../execution/fixtures.js"
import { programExecutable } from "../../../program/fixture.js"
import { provideScoped } from "../../../execution/scoped-provide.js"

const selection = {
  executableRef: assistantRef.ref,
  executableManifest: assistantRef.manifest,
  registrations: registrationsFor(assistantRef),
}

const open = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ environment: "test", tenant: "queue", partition: "reopen", workerId, addresses: [] }).pipe(
        Layer.provide(Layer.succeed(ObjectStore, client.store)),
      ),
    )
    yield* activate.pipe(Effect.provide(context))
    return yield* RunStore.pipe(Effect.provide(context))
  })

it.effect("fresh Session queue hosts retain selection and exact receipts without duplicate admission", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const sessionId = "session:queue:reopen"
      const first = { sessionId, commandId: "first", prompt: Prompt.make("first"), selection }
      const pending = { sessionId, commandId: "pending", prompt: Prompt.make("pending") }
      const removed = { sessionId, commandId: "removed", prompt: Prompt.make("removed") }
      const replacementSelection = {
        executableRef: alternateAssistantRef.ref,
        executableManifest: alternateAssistantRef.manifest,
        registrations: registrationsFor(alternateAssistantRef),
        treePolicy: { maxDepth: 2, maxSessions: 1024, concurrency: { agents: 3, tools: 1024 } },
        budget: { tokens: 1200, toolCalls: 4 },
      }
      const edit = {
        ...pending,
        id: "pending",
        commandId: "edit",
        expectedRevision: 1,
        prompt: Prompt.make("edited"),
        selection: replacementSelection,
      }
      const remove = { sessionId, id: "removed", commandId: "remove", expectedRevision: 1 }
      const runId = yield* Effect.scoped(
        Effect.gen(function* () {
          const store = yield* open(bucket, "first-host")
          yield* store.createHostSession({ id: sessionId })
          yield* store.submitSessionInput(first)
          yield* store.submitSessionInput(pending)
          yield* store.submitSessionInput(removed)
          yield* store.updateSessionInput(edit)
          yield* store.removeSessionInput(remove)
          return (yield* store.hostSession(sessionId)).activeRunId!
        }),
      )
      const promoted = yield* Effect.scoped(
        Effect.gen(function* () {
          const store = yield* open(yield* bucket.connect, "second-host")
          expect(yield* store.submitSessionInput(first)).toEqual({ id: "first", revision: 1 })
          expect(yield* store.submitSessionInput(removed)).toEqual({ id: "removed", revision: 1 })
          expect(yield* store.removeSessionInput(remove)).toEqual({ id: "removed", revision: 2 })
          expect(yield* store.updateSessionInput(edit)).toEqual({ id: "pending", revision: 2 })
          expect(yield* store.hostSession(sessionId)).toMatchObject({
            activeRunId: runId,
            selection,
            queue: [{ id: "pending", revision: 2, prompt: edit.prompt, selection: replacementSelection }],
          })
          expect(yield* store.loadExecution(runId)).toMatchObject({ executableRef: selection.executableRef })
          expect(yield* store.hostSessionRuns(sessionId)).toHaveLength(1)
          const claim = yield* store.claimExecution({ runId, ownerId: "second-host", commandId: "claim" })
          yield* store.complete({
            ...claim,
            commandId: "complete",
            result: { text: "done", output: "done", turns: 1, session: { sessionId, leafId: null } },
          })
          return (yield* store.hostSession(sessionId)).activeRunId!
        }),
      )
      expect(promoted).not.toBe(runId)
      const store = yield* open(yield* bucket.connect, "third-host")
      expect(yield* store.submitSessionInput(pending)).toEqual({ id: "pending", revision: 1 })
      expect(yield* store.updateSessionInput(edit)).toEqual({ id: "pending", revision: 2 })
      expect(
        yield* store.updateSessionInput({ ...edit, prompt: Prompt.make("divergent") }).pipe(Effect.flip),
      ).toMatchObject({ reason: "input-conflict" })
      expect(yield* store.removeSessionInput({ ...remove, expectedRevision: 2 }).pipe(Effect.flip)).toMatchObject({
        reason: "input-conflict",
      })
      expect(yield* store.hostSession(sessionId)).toMatchObject({ activeRunId: promoted, queue: [], selection })
      expect(yield* store.loadExecution(promoted)).toMatchObject({
        message: { prompt: edit.prompt },
        executableRef: replacementSelection.executableRef,
        executableManifest: replacementSelection.executableManifest,
        registrations: replacementSelection.registrations,
        treePolicy: replacementSelection.treePolicy,
      })
      expect(yield* store.hostSessionRuns(sessionId)).toHaveLength(2)
    }),
  ).pipe(Effect.scoped),
)

it.effect("rejects a pinned Program selection without creating a conversational Run", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const store = yield* open(yield* makeSimulator(), "program-host")
      const sessionId = "session:queue:program"
      yield* store.createHostSession({ id: sessionId })
      expect(
        yield* store
          .submitSessionInput({
            sessionId,
            commandId: "program",
            prompt: Prompt.make("program"),
            selection: {
              executableRef: programExecutable.ref,
              executableManifest: programExecutable.manifest,
              registrations: [],
            },
          })
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "selection" })
      expect(yield* store.hostSessionRuns(sessionId)).toEqual([])
      expect(yield* store.hostSession(sessionId)).toMatchObject({ queue: [] })
    }),
  ).pipe(Effect.scoped),
)

it.effect("closes a Session as read-only while preserving exact prior receipts", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const client = yield* bucket.connect
      const store = yield* open(client, "closed-session")
      const sessionId = "session:queue:closed"
      yield* store.createHostSession({ id: sessionId, selection })
      const first = { sessionId, commandId: "closed:first", prompt: Prompt.make("first") }
      const accepted = yield* store.submitSessionInput(first)
      yield* store.submitSessionInput({ sessionId, commandId: "closed:pending", prompt: Prompt.make("pending") })
      const message = {
        sessionId,
        commandId: "closed:message",
        prompt: Prompt.make("message"),
        from: { user: "operator" } as const,
      }
      const messageReceipt = yield* store.messageSessionInput(message)
      yield* store.controlSession({ sessionId, commandId: "closed:close", action: "close" })
      expect(yield* store.submitSessionInput(first)).toEqual(accepted)
      expect(yield* store.messageSessionInput(message)).toEqual(messageReceipt)
      expect(
        yield* store
          .submitSessionInput({ sessionId, commandId: "closed:new", prompt: Prompt.make("new") })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/session/SessionQueueConflict", reason: "closed" })
      expect(
        yield* store.messageSessionInput({ ...message, commandId: "closed:new-message" }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/session/SessionQueueConflict",
        reason: "closed",
      })
      expect(
        yield* store
          .updateSessionInput({
            sessionId,
            commandId: "closed:edit",
            id: "closed:pending",
            expectedRevision: 1,
            prompt: Prompt.make("edited"),
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/session/SessionQueueConflict", reason: "closed" })
      expect(
        yield* store
          .removeSessionInput({ sessionId, commandId: "closed:remove", id: "closed:pending", expectedRevision: 1 })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/session/SessionQueueConflict", reason: "closed" })
      expect((yield* store.hostSession(sessionId)).lifecycle).toBe("closed")
    }),
  ).pipe(Effect.scoped),
)

for (const order of [
  "send-first",
  "settle-first",
  "concurrent",
  "stop-first",
  "send-stop",
  "concurrent-stop",
  "terminal-parent",
  "replacement-sponsor",
  "exhausted",
] as const) {
  it.effect(`delivers a retained child follow-up once across independent hosts (${order})`, () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const openHost = (workerId: string) =>
          Effect.gen(function* () {
            const client = yield* bucket.connect
            const context = yield* Layer.build(
              layerRunStore({
                environment: "test",
                tenant: "messaging",
                partition: order,
                addresses: [],
                workerId,
              }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
            )
            yield* activate.pipe(Effect.provide(context))
            return yield* RunStore.pipe(Effect.provide(context))
          })
        const first = yield* openHost("first")
        const second = yield* openHost("second")
        const { executable, registrations } = durableIdentity(makeAgent({ name: "reviewer", children: ["reviewer"] }))
        const selectedProfile = {
          executableRef: executable.ref,
          executableManifest: executable.manifest,
          registrations,
        }
        if (order === "exhausted") Object.assign(selectedProfile, { budget: { duration: 1 } })
        if (order === "replacement-sponsor") Object.assign(selectedProfile, { budget: { duration: 10 } })
        yield* first.createHostSession({ id: "parent", selection: selectedProfile })
        yield* first.submitSessionInput({ sessionId: "parent", commandId: "start", prompt: Prompt.make("coordinate") })
        const parentRunId = (yield* first.hostSession("parent")).activeRunId!
        const message = {
          id: "child",
          to: address(`spawn:${parentRunId}`),
          sessionId: "child",
          prompt: Prompt.make("review"),
          idempotencyKey: "child",
          correlationId: "child",
          metadata: {},
        }
        const child = yield* first.admitSpawn({
          parentRunId,
          invocationId: "child",
          selection: "reviewer",
          prompt: message.prompt,
          message,
        })
        const before = (yield* first.hostSession("child")).retainedSession
        const followup = {
          sessionId: "child",
          commandId: "followup",
          prompt: Prompt.make("check regression"),
          from: { runId: parentRunId },
        }
        const send = second.messageSessionInput(followup)
        if (order === "stop-first" || order === "send-stop" || order === "concurrent-stop") {
          const stop = first.controlSession({ sessionId: "child", commandId: "stop", action: "stop" })
          if (order === "stop-first") {
            yield* stop
            yield* send
          } else if (order === "send-stop") {
            yield* send
            yield* stop
          } else yield* Effect.all([send, stop], { concurrency: "unbounded" })
          const fresh = yield* openHost("fresh")
          const stopped = yield* fresh.hostSession("child")
          expect(stopped.lifecycle).toBe("stopped")
          expect(stopped.activeRunId).toBeUndefined()
          expect(stopped.queue.map((entry) => entry.id)).toEqual(["followup"])
          expect(stopped.retainedSession).toEqual(before)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(1)
          expect(yield* fresh.messageSessionInput(followup)).toEqual({ id: "followup", revision: 1 })
          yield* fresh.controlSession({ sessionId: "child", commandId: "resume", action: "resume" })
          expect((yield* fresh.hostSession("child")).activeRunId).not.toBe(child.runId)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(2)
          return
        }
        const claim = yield* first.claimExecution({ runId: child.runId, ownerId: "first", commandId: "claim" })
        const settle = first.complete({
          ...claim,
          commandId: "complete",
          result: { text: "done", output: "done", turns: 1, session: { sessionId: "child", leafId: null } },
        })
        if (order === "exhausted") {
          yield* TestClock.adjust("2 millis")
          yield* settle
          yield* first.releaseExecution(claim)
          yield* send
          const fresh = yield* openHost("fresh")
          expect((yield* fresh.snapshot(child.runId)).budget.duration).toBe(0)
          expect((yield* fresh.hostSession("child")).queue.map((entry) => entry.id)).toEqual(["followup"])
          expect((yield* fresh.hostSession("child")).activeRunId).toBeUndefined()
          yield* fresh.controlSession({ sessionId: "child", commandId: "resume", action: "resume" })
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(1)
          expect(yield* fresh.messageSessionInput(followup)).toEqual({ id: "followup", revision: 1 })
          expect((yield* fresh.snapshot(child.runId)).budget.duration).toBe(0)
          return
        }
        if (order === "replacement-sponsor") {
          yield* TestClock.adjust("2 millis")
          yield* settle
          yield* first.releaseExecution(claim)
          yield* first.controlSession({ sessionId: "child", commandId: "stop", action: "stop" })
          const parentClaim = yield* first.claimExecution({
            runId: parentRunId,
            ownerId: "first",
            commandId: "parent-claim",
          })
          yield* first.complete({
            ...parentClaim,
            commandId: "parent-complete",
            result: { text: "done", output: "done", turns: 1, session: { sessionId: "parent", leafId: null } },
          })
          yield* first.releaseExecution(parentClaim)
          yield* send
          const fresh = yield* openHost("fresh")
          expect((yield* fresh.hostSession("child")).queue.map((entry) => entry.id)).toEqual(["followup"])
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(1)
          yield* fresh.submitSessionInput({
            sessionId: "parent",
            commandId: "next-parent",
            prompt: Prompt.make("new allocation"),
          })
          const sponsorRunId = (yield* fresh.hostSession("parent")).activeRunId!
          expect(sponsorRunId).not.toBe(parentRunId)
          yield* fresh.messageSessionInput({ ...followup, commandId: "responsor", from: { runId: sponsorRunId } })
          yield* fresh.controlSession({ sessionId: "child", commandId: "resume", action: "resume" })
          const retained = yield* fresh.hostSession("child")
          expect(retained.sponsorRunId).toBe(sponsorRunId)
          expect(retained.retainedSession).toEqual(before)
          expect(retained.retainedSession?.parentRunId).toBe(parentRunId)
          expect((yield* fresh.loadExecution(retained.activeRunId!)).parentRunId).toBe(sponsorRunId)
          expect((yield* fresh.snapshot(retained.activeRunId!)).budget.duration).toBeGreaterThan(0)
          expect((yield* fresh.snapshot(retained.activeRunId!)).budget.duration).toBeLessThan(10)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(2)
          return
        }
        if (order === "terminal-parent") {
          yield* TestClock.adjust("2 millis")
          yield* settle
          yield* first.releaseExecution(claim)
          const parentClaim = yield* first.claimExecution({
            runId: parentRunId,
            ownerId: "first",
            commandId: "terminal-parent-claim",
          })
          yield* first.complete({
            ...parentClaim,
            commandId: "terminal-parent-complete",
            result: { text: "done", output: "done", turns: 1, session: { sessionId: "parent", leafId: null } },
          })
          yield* first.releaseExecution(parentClaim)
          yield* send
          const fresh = yield* openHost("fresh")
          const retained = yield* fresh.hostSession("child")
          expect(retained.activeRunId).toBeDefined()
          expect((yield* fresh.loadExecution(retained.activeRunId!)).parentRunId).toBe(parentRunId)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(2)
          return
        }
        if (order === "send-first") {
          yield* send
          yield* settle
        } else if (order === "settle-first") {
          yield* settle
          yield* send
        } else yield* Effect.all([send, settle], { concurrency: "unbounded" })
        yield* first.releaseExecution(claim)
        const verifyDelivery = Effect.gen(function* () {
          const fresh = yield* openHost("fresh")
          const retained = yield* fresh.hostSession("child")
          expect(retained.retainedSession).toEqual(before)
          expect(retained.sponsorRunId).toBe(parentRunId)
          expect(retained.activeRunId).toBeDefined()
          const continued = retained.activeRunId === child.runId
          if (order === "send-first") expect(continued).toBe(true)
          if (order === "settle-first") expect(continued).toBe(false)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(continued ? 1 : 2)
          expect(yield* fresh.messageSessionInput(followup)).toEqual({ id: "followup", revision: 1 })
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(continued ? 1 : 2)
          const execution = yield* fresh.loadExecution(retained.activeRunId!)
          const delivered = continued ? execution.continuation?.prompt : execution.message.prompt
          expect(delivered?.content[0]).toMatchObject({
            role: "user",
            options: { generalist: { message: { from: (yield* first.directory(parentRunId)).address } } },
          })
        })
        yield* verifyDelivery
      }),
    ),
  )
}
