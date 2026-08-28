import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DurableDriver, ToolContext } from "../../../src/index.js"
import { ChildAdmission, Errors, Messaging, RunStore } from "../../../src/runtime/index.js"
import { memoryLayer, textPrompt } from "./fixtures.js"
import { family } from "../messaging/scenario.js"
import { provideScoped } from "./scoped-provide.js"

const ambient = (input: { readonly runId?: string; readonly toolCallId?: string }) => {
  const base = {
    signal: new AbortController().signal,
    emit: () => Effect.void,
    sessionId: "session:in-execution-authority",
  }
  const withRun = input.runId === undefined ? base : { ...base, runId: input.runId }
  const options = input.toolCallId === undefined ? withRun : { ...withRun, toolCallId: input.toolCallId }
  return ToolContext.layerTest(options)
}

const interpreter = DurableDriver.layerTest({
  driver: DurableDriver.makeLoopDriver({
    logicalOperationId: "run:in-execution-authority",
    sessionId: "session:in-execution-authority",
  }),
  initial: {
    driverVersion: DurableDriver.currentDriverVersion,
    turn: 0,
    budget: { allocation: {}, remaining: {}, depth: 0 },
    state: {
      logicalOperationId: "run:in-execution-authority",
      sessionId: "session:in-execution-authority",
      modelCallOrdinal: 0,
      modelCallOrdinalStart: 0,
    },
  },
  journal: {
    onScheduled: () => Effect.void,
    onCompleted: () => Effect.void,
    onCheckpoint: () => Effect.void,
  },
})

const withAmbient =
  (input: { readonly runId?: string; readonly toolCallId?: string }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    provideScoped(Layer.merge(ambient(input), interpreter), effect)

layer(memoryLayer)("in-execution parent authority", (it) => {
  it.effect("reads the parent Run id from the ambient ToolContext", () =>
    Effect.gen(function* () {
      const { parent } = yield* family("thread:authority-parent")
      const derived = yield* ChildAdmission.parentRunId.pipe(withAmbient({ runId: parent.runId }))
      expect(derived).toBe(parent.runId)
    }),
  )

  it.effect("refuses a ToolContext that carries no Run id instead of inventing a parent", () =>
    Effect.gen(function* () {
      const failure = yield* ChildAdmission.parentRunId.pipe(withAmbient({}), Effect.flip)
      expect(failure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)
      expect(failure.parentRunId).toBe("")
    }),
  )

  it.effect("admits a child under the ambient Run even when the caller names another parent", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { parent, first } = yield* family("thread:authority-admit")
      const children = ChildAdmission.makeAgentChildren(store)
      const forged = {
        selection: "researcher",
        prompt: "review the boundary",
        key: "reviewer",
        parentRunId: first.runId,
        toolCallId: "call:forged",
      }

      const receipt = yield* children
        .admit(forged)
        .pipe(withAmbient({ runId: parent.runId, toolCallId: "call:authentic" }))

      const operations = ChildAdmission.make(store)
      expect((yield* operations.listDirect(parent.runId)).map((entry) => entry.childRunId)).toContain(
        receipt.childRunId,
      )
      expect(yield* operations.listDirect(first.runId)).toEqual([])
      const snapshot = yield* store.snapshot(receipt.childRunId)
      expect(snapshot.run.parentRunId).toBe(parent.runId)
    }),
  )

  it.effect("refuses admission when the ambient ToolContext carries no tool call", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { parent } = yield* family("thread:authority-no-call")
      const children = ChildAdmission.makeAgentChildren(store)

      const operations = ChildAdmission.make(store)
      const before = yield* operations.listDirect(parent.runId)
      const failure = yield* children
        .admit({ selection: "researcher", prompt: "review", key: "reviewer" })
        .pipe(withAmbient({ runId: parent.runId }), Effect.flip)

      expect(failure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)
      expect(yield* operations.listDirect(parent.runId)).toEqual(before)
    }),
  )

  it.effect("inspects, joins, and cancels only under the ambient Run", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { parent, first } = yield* family("thread:authority-lookup")
      const children = ChildAdmission.makeAgentChildren(store)
      const receipt = yield* children
        .admit({ selection: "researcher", prompt: "review", key: "reviewer" })
        .pipe(withAmbient({ runId: parent.runId, toolCallId: "call:authentic" }))

      const owned = yield* children
        .inspect({ childRunId: receipt.childRunId })
        .pipe(withAmbient({ runId: parent.runId, toolCallId: "call:authentic" }))
      expect(owned.childRunId).toBe(receipt.childRunId)

      // A Run that merely knows the child id, and names the true parent in its own payload, is refused.
      const stolen = { childRunId: receipt.childRunId, parentRunId: parent.runId }
      const inspectFailure = yield* children
        .inspect(stolen)
        .pipe(withAmbient({ runId: first.runId, toolCallId: "call:thief" }), Effect.flip)
      expect(inspectFailure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)

      const joinFailure = yield* children
        .join(stolen)
        .pipe(withAmbient({ runId: first.runId, toolCallId: "call:thief" }), Effect.flip)
      expect(joinFailure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)

      const cancelFailure = yield* children
        .cancel(stolen)
        .pipe(withAmbient({ runId: first.runId, toolCallId: "call:thief" }), Effect.flip)
      expect(cancelFailure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)

      const survived = yield* ChildAdmission.make(store).inspect({
        parentRunId: parent.runId,
        childRunId: receipt.childRunId,
      })
      expect(survived.status).not.toBe("cancelled")
    }),
  )

  it.effect("lists only the ambient Run's direct children", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { parent, first } = yield* family("thread:authority-list")
      const children = ChildAdmission.makeAgentChildren(store)
      const receipt = yield* children
        .admit({ selection: "researcher", prompt: "review", key: "reviewer" })
        .pipe(withAmbient({ runId: parent.runId, toolCallId: "call:authentic" }))

      const mine = yield* children.listDirect.pipe(withAmbient({ runId: parent.runId, toolCallId: "call:authentic" }))
      expect(mine.map((entry) => entry.childRunId)).toContain(receipt.childRunId)

      const theirs = yield* children.listDirect.pipe(withAmbient({ runId: first.runId, toolCallId: "call:thief" }))
      expect(theirs).toEqual([])
    }),
  )
})

layer(memoryLayer)("in-execution sender authority", (it) => {
  it.effect("sends under the ambient Run even when the payload names another sender", () =>
    Effect.gen(function* () {
      const { runtime, store, parent, first, second } = yield* family("thread:authority-send")
      const messaging = Messaging.make({
        store,
        policy: Messaging.Policy.make(),
        sendMessage: (request) => runtime.sendMessage(request),
      })
      const forged = {
        to: parent.address,
        idempotencyKey: "forged-sender",
        prompt: textPrompt("hello"),
        fromRunId: second.runId,
      }

      // The ambient ToolContext belongs to `first`, so the payload's `second` must be ignored.
      const receipt = yield* messaging.send(forged).pipe(withAmbient({ runId: first.runId, toolCallId: "call:send" }))

      const delivered = yield* runtime.messages({ runId: parent.runId, limit: 10 })
      const entry = delivered.find((candidate) => candidate.messageId === receipt.messageId)
      expect(entry?.fromRunId).toBe(first.runId)
      expect(entry?.fromRunId).not.toBe(second.runId)
    }),
  )

  it.effect("refuses to send without a Runtime-owned ToolContext", () =>
    Effect.gen(function* () {
      const { runtime, store, parent } = yield* family("thread:authority-send-anonymous")
      const messaging = Messaging.make({
        store,
        policy: Messaging.Policy.make(),
        sendMessage: (request) => runtime.sendMessage(request),
      })

      const failure = yield* messaging
        .send({ to: parent.address, idempotencyKey: "anonymous", prompt: textPrompt("hello") })
        .pipe(withAmbient({ toolCallId: "call:send" }), Effect.flip)

      expect(failure).toBeInstanceOf(Errors.RuntimeUnavailable)
      expect(yield* runtime.messages({ runId: parent.runId, limit: 10 })).toEqual([])
    }),
  )

  it.effect("refuses to read an inbox without a Runtime-owned ToolContext", () =>
    Effect.gen(function* () {
      const { runtime, store } = yield* family("thread:authority-inbox-anonymous")
      const messaging = Messaging.make({
        store,
        policy: Messaging.Policy.make(),
        sendMessage: (request) => runtime.sendMessage(request),
      })

      const failure = yield* messaging.inbox({ limit: 10 }).pipe(withAmbient({}), Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RuntimeUnavailable)
    }),
  )

  it.effect("refuses to read the directory without a Runtime-owned ToolContext", () =>
    Effect.gen(function* () {
      const { runtime, store } = yield* family("thread:authority-directory-anonymous")
      const messaging = Messaging.make({
        store,
        policy: Messaging.Policy.make(),
        sendMessage: (request) => runtime.sendMessage(request),
      })

      const failure = yield* messaging.directory.pipe(withAmbient({}), Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RuntimeUnavailable)
    }),
  )

  it.effect("reads the inbox and directory of the ambient Run", () =>
    Effect.gen(function* () {
      const { runtime, store, parent, first } = yield* family("thread:authority-ambient-reads")
      const messaging = Messaging.make({
        store,
        policy: Messaging.Policy.make(),
        sendMessage: (request) => runtime.sendMessage(request),
      })
      yield* runtime.sendMessage({
        fromRunId: parent.runId,
        to: first.address,
        idempotencyKey: "parent-to-child",
        prompt: textPrompt("from parent"),
      })

      const inbox = yield* messaging
        .inbox({ limit: 10 })
        .pipe(withAmbient({ runId: first.runId, toolCallId: "call:inbox" }))
      expect(inbox.map((entry) => entry.fromRunId)).toEqual([parent.runId])

      const reachable = yield* messaging.directory.pipe(withAmbient({ runId: first.runId, toolCallId: "call:dir" }))
      expect(reachable.map((entry) => entry.runId)).toContain(parent.runId)
    }),
  )
})
