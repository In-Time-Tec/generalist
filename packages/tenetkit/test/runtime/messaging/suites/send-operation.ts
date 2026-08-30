import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DurableDriver, ToolContext } from "../../../../src/index.js"
import { Errors, Messaging } from "../../../../src/runtime/index.js"
import { textPrompt } from "../../execution/fixtures.js"
import { messagingBackend, type MessagingBackend } from "../scenario.js"
import { provideScoped } from "../../execution/scoped-provide.js"

const toolContext = (sessionId: string, runId: string) =>
  ToolContext.layerTest({
    signal: new AbortController().signal,
    emit: () => Effect.succeed(true),
    sessionId,
    runId,
    toolCallId: "call:send",
  })

/**
 * A durable checkpoint the interpreter can start from.
 *
 * The send operation is journaled through the same DriverInterpreter the agent loop uses, so the
 * test drives it exactly as an in-execution `rika.agents.send` would.
 */
const interpreter = (sessionId: string, journal: DurableDriver.Journal) =>
  DurableDriver.layerTest({
    driver: DurableDriver.makeLoopDriver({ logicalOperationId: "run:send-operation", sessionId }),
    initial: {
      driverVersion: DurableDriver.currentDriverVersion,
      turn: 0,
      budget: { allocation: {}, remaining: {}, depth: 0 },
      state: {
        logicalOperationId: "run:send-operation",
        sessionId,
        modelCallOrdinal: 0,
        modelCallOrdinalStart: 0,
      },
    },
    journal,
  })

/** Run one effect as if it were code inside that Run's execution: its identity plus its journal. */
const inExecution =
  (sessionId: string, runId: string, journal: DurableDriver.Journal) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    provideScoped(Layer.merge(toolContext(sessionId, runId), interpreter(sessionId, journal)), effect).pipe(
      Effect.scoped,
    )

const silent: DurableDriver.Journal = {
  onScheduled: () => Effect.void,
  onCompleted: () => Effect.void,
  onCheckpoint: () => Effect.void,
}

export const messagingSendOperationSuite = <StoreError, Extra = never>(
  backend: MessagingBackend<StoreError, Extra>,
) => {
  const { provide, familyFor, strangerFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:send-operation:${backend.name}:${label}`
  const provided = provide()

  describeBackend(`durable send operation (${backend.name})`, () => {
    it.live("journals one send as a never-replay operation and returns its receipt", () =>
      Effect.gen(function* () {
        const sessionId = session("journal")
        const { runtime, store, parent, first } = yield* familyFor(sessionId)
        const scheduled: Array<DurableDriver.DriverOperation> = []
        const completed: Array<{
          readonly operation: DurableDriver.DriverOperation
          readonly outcome: DurableDriver.OperationOutcome
        }> = []
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        const receipt = yield* messaging
          .send({ to: first.address, idempotencyKey: "durable-send", prompt: textPrompt("hello") })
          .pipe(
            inExecution(sessionId, parent.runId, {
              onScheduled: (operation) => Effect.sync(() => void scheduled.push(operation)),
              onCompleted: (operation, outcome) => Effect.sync(() => void completed.push({ operation, outcome })),
              onCheckpoint: () => Effect.void,
            }),
          )

        expect(receipt.duplicate).toBe(false)
        expect(scheduled).toHaveLength(1)
        // A send crosses an external boundary exactly once, so it must never be blindly replayed.
        expect(scheduled[0]).toMatchObject({ kind: "send", replayPolicy: "never" })
        expect(completed).toHaveLength(1)
        expect(completed[0]?.outcome._tag).toBe("Succeeded")
        expect((yield* runtime.messages({ runId: first.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          receipt.messageId,
        ])
      }).pipe(provided),
    )

    it.live("returns the recorded outcome instead of sending again when the journal replays it", () =>
      Effect.gen(function* () {
        const sessionId = session("replay")
        const { runtime, store, parent, first } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        const original = yield* messaging
          .send({ to: first.address, idempotencyKey: "replayed", prompt: textPrompt("hello") })
          .pipe(inExecution(sessionId, parent.runId, silent))

        // The host replays the persisted success: the boundary is not crossed a second time.
        const replayed = yield* messaging
          .send({ to: first.address, idempotencyKey: "replayed", prompt: textPrompt("hello") })
          .pipe(
            inExecution(sessionId, parent.runId, {
              ...silent,
              onScheduled: () => Effect.succeed({ _tag: "Succeeded" as const, value: original }),
            }),
          )

        expect(replayed).toEqual(original)
        expect(yield* runtime.messages({ runId: first.runId, limit: 10 })).toHaveLength(1)
      }).pipe(provided),
    )

    it.live("refuses to replay an unknown send outcome", () =>
      Effect.gen(function* () {
        const sessionId = session("unknown")
        const { runtime, store, parent, first } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        // A send that crashed between journal and mailbox is Unknown; replaying it could duplicate a
        // real delivery, so the driver must refuse rather than guess.
        const error = yield* messaging
          .send({ to: first.address, idempotencyKey: "unknown", prompt: textPrompt("hello") })
          .pipe(
            inExecution(sessionId, parent.runId, {
              ...silent,
              onScheduled: () => Effect.succeed({ _tag: "Unknown" as const, operationId: "op:unknown" }),
            }),
            Effect.flip,
          )

        expect(error).toBeInstanceOf(DurableDriver.DriverUnknownReplay)
        expect(yield* runtime.messages({ runId: first.runId, limit: 10 })).toEqual([])
      }).pipe(provided),
    )

    it.live("surfaces an authorization failure as a failed operation without admitting a message", () =>
      Effect.gen(function* () {
        const sessionId = session("unauthorized")
        const { runtime, store, parent } = yield* familyFor(sessionId)
        const outsider = yield* strangerFor(session("outsider"))
        const completed: Array<DurableDriver.OperationOutcome> = []
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        const error = yield* messaging
          .send({ to: outsider.address, idempotencyKey: "denied", prompt: textPrompt("hello") })
          .pipe(
            inExecution(sessionId, parent.runId, {
              ...silent,
              onCompleted: (_operation, outcome) => Effect.sync(() => void completed.push(outcome)),
            }),
            Effect.flip,
          )

        expect(error).toBeInstanceOf(Errors.MessagingUnauthorized)
        expect(completed[0]?._tag).toBe("Failed")
        expect(yield* runtime.messages({ runId: outsider.runId, limit: 10 })).toEqual([])
      }).pipe(provided),
    )

    it.live("reads the inbox and directory under the running Run's own identity", () =>
      Effect.gen(function* () {
        const sessionId = session("in-execution-reads")
        const { runtime, store, parent, first, second } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        yield* runtime.sendMessage({
          fromRunId: first.runId,
          to: parent.address,
          idempotencyKey: "for-parent",
          prompt: textPrompt("status"),
        })

        const inbox = yield* messaging.inbox({ limit: 10 }).pipe(inExecution(sessionId, parent.runId, silent))
        expect(inbox.map((entry) => entry.fromRunId)).toEqual([first.runId])

        const reachable = yield* messaging.directory.pipe(inExecution(sessionId, parent.runId, silent))
        expect(new Set(reachable.map((entry) => entry.runId))).toEqual(new Set([first.runId, second.runId]))
      }).pipe(provided),
    )
  })
}
