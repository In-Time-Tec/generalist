import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { AgentDirectory, Errors, Runtime, RunStore } from "../src/index.js"
import { family } from "./messaging-helpers.js"
import { assistantAddress, textPrompt } from "./helpers.js"
import { provideScoped } from "./scoped-provide.js"

export interface StrandedDeliverySuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const strandedDeliverySuite = <StoreError, Extra = never>(
  options: StrandedDeliverySuiteOptions<StoreError, Extra>,
) => {
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const describeBackend = options.skip === true ? describe.skip : describe
  const activate = options.activate ?? (() => Effect.void)
  const familyFor = (sessionId: string) => family(sessionId).pipe(Effect.tap(({ first }) => activate(first.runId)))

  describeBackend(`stranded delivery (${options.name})`, () => {
    it.live("never migrates an exact Run message to a later Run in the same Session", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor("session:exact-run")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "exact-run",
          prompt: textPrompt("only for this execution"),
        })
        expect(yield* store.deliverPendingMessages({ runId: first.runId })).toHaveLength(1)
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "doomed" })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "worker died" }) })
        expect(
          yield* store.pendingMessages({ sessionId: first.sessionId, runId: first.runId, limit: 10 }),
        ).toHaveLength(0)

        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId: first.sessionId,
          idempotencyKey: "later-run",
          prompt: textPrompt("later"),
        })
        expect(yield* store.deliverPendingMessages({ runId: later.runId })).toHaveLength(0)
      }).pipe(provide),
    )
    /**
     * A message bound to a Run that dies before consuming it is still owed to the session.
     *
     * Binding is not delivery. The model only sees a message when the turn carrying it commits, so a
     * Run that reaches a terminal state without that commit must not take the message with it.
     */
    it.live("returns a message to pending when its bound Run dies without consuming it", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor("session:stranded-terminal")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.sessionAddress(first.sessionId),
          idempotencyKey: "stranded",
          prompt: textPrompt("are you there?"),
        })
        const bound = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(bound).toHaveLength(1)
        expect(yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })).toHaveLength(0)

        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "doomed" })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "worker died" }) })

        // The Run is gone and never consumed the message, so the session is still owed it.
        const owed = yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })
        expect(owed).toHaveLength(1)
        expect(owed[0]?.messageId).toBe(bound[0]?.messageId)
      }).pipe(provide),
    )

    it.live("returns a message to pending when its bound Run is cancelled without consuming it", () =>
      Effect.gen(function* () {
        // This case owns cancellation before execution starts; an activated SQL Run is intentionally only cancelling.
        const { runtime, store, parent, first } = yield* family("session:stranded-cancelled")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.sessionAddress(first.sessionId),
          idempotencyKey: "stranded-cancel",
          prompt: textPrompt("are you there?"),
        })
        const bound = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(bound).toHaveLength(1)

        // Cancellation is a terminal outcome like any other, so it must release the message too.
        yield* runtime.cancel({ runId: first.runId, reason: "no longer needed" })
        expect((yield* runtime.inspect(first.runId)).status).toBe("cancelled")

        const owed = yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })
        expect(owed).toHaveLength(1)
        expect(owed[0]?.messageId).toBe(bound[0]?.messageId)
      }).pipe(provide),
    )

    it.live("keeps a consumed message out of pending after its Run terminates", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor("session:consumed-terminal")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.sessionAddress(first.sessionId),
          idempotencyKey: "consumed",
          prompt: textPrompt("seen"),
        })
        yield* store.deliverPendingMessages({ runId: first.runId })
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "worker" })
        const steering = yield* store.readSteering(claim)
        // Recording the model operation is what durably consumes the steering entry.
        yield* store.recordOperation({
          ...claim,
          operationKey: "turn-0",
          kind: "model",
          inputDigest: "digest",
          input: {},
          replayPolicy: "never",
          attempt: 1,
          steeringEntryIds: steering.map((entry) => entry.entryId),
        })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "died after consuming" }) })

        // The model already saw it, so redelivering would duplicate the conversation.
        expect(yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })).toHaveLength(0)
      }).pipe(provide),
    )

    it.live("leaves a message bound while its Run is still alive", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor("session:live-holder")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.sessionAddress(first.sessionId),
          idempotencyKey: "live",
          prompt: textPrompt("hold"),
        })
        yield* store.deliverPendingMessages({ runId: first.runId })
        // A live Run owns the message: re-offering it would deliver it twice.
        expect(yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })).toHaveLength(0)
      }).pipe(provide),
    )

    it.live("does not charge a returned message twice against the pending bound", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor("session:returned-bound")
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.sessionAddress(first.sessionId),
          idempotencyKey: "bound-once",
          prompt: textPrompt("one"),
        })
        yield* store.deliverPendingMessages({ runId: first.runId })
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "doomed" })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "died" }) })
        const owed = yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })
        expect(owed).toHaveLength(1)
      }).pipe(provide),
    )
  })
}
