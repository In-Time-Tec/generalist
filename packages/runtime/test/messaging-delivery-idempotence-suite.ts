import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Mailbox } from "../src/index.js"
import { completedResult, textPrompt } from "./helpers.js"
import { messagingBackend, type MessagingBackend } from "./messaging-helpers.js"

/**
 * Delivery binds a pending message to a Run's steering inbox.
 *
 * The agent loop calls this at every turn boundary, so it runs many times per Run. These tests pin
 * the property that makes that safe: binding is keyed by mailbox entry, so repeating it is a no-op
 * rather than a second copy of the message in the conversation.
 */
export const messagingDeliveryIdempotenceSuite = <StoreError, Extra = never>(
  backend: MessagingBackend<StoreError, Extra>,
) => {
  const { provide, familyFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:delivery:${backend.name}:${label}`
  const provided = provide()

  describeBackend(`delivery idempotence (${backend.name})`, () => {
    it.live("binds one pending message exactly once no matter how often delivery runs", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("idempotent"))
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "deliver-once",
          prompt: textPrompt("status?"),
        })
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "child" })
        const firstPass = yield* store.deliverPendingMessages({ runId: first.runId })
        const secondPass = yield* store.deliverPendingMessages({ runId: first.runId })
        const thirdPass = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(firstPass).toHaveLength(1)
        // Re-running delivery must not re-bind an entry that already has a steering row.
        expect(secondPass).toHaveLength(0)
        expect(thirdPass).toHaveLength(0)
        // The conversation must carry the message exactly once, however many boundaries were crossed.
        const steering = yield* store.readSteering(claim)
        expect(
          steering.filter((entry) => entry.idempotencyKey === Mailbox.steeringKey(firstPass[0]!.entryId)),
        ).toHaveLength(1)
        expect(steering).toHaveLength(1)
        const accepted = (yield* runtime.history({ runId: first.runId, cursor: -1, limit: 100 })).filter(
          (event) => event._tag === "SteeringAccepted",
        )
        expect(accepted).toEqual([
          expect.objectContaining({
            entryId: firstPass[0]!.steeringEntryId,
            steeringSequence: steering[0]!.sequence,
            idempotencyKey: steering[0]!.idempotencyKey,
            digest: steering[0]!.digest,
            prompt: steering[0]!.prompt,
          }),
        ])
      }).pipe(provided),
    )

    it.live("stops offering a delivered message as pending", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("clears-pending"))
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "clears-pending",
          prompt: textPrompt("status?"),
        })
        expect(yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })).toHaveLength(1)
        yield* store.deliverPendingMessages({ runId: first.runId })
        expect(yield* store.pendingMessages({ sessionId: first.sessionId, limit: 10 })).toHaveLength(0)
      }).pipe(provided),
    )

    it.live("records which Run took each delivered message", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("attribution"))
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "attribution",
          prompt: textPrompt("status?"),
        })
        const delivered = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(delivered[0]?.deliveredRunId).toBe(first.runId)
        expect(delivered[0]?.steeringEntryId).toBeTypeOf("string")
      }).pipe(provided),
    )

    it.live("preserves admission order when several messages are delivered together", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("order"))
        for (const text of ["one", "two", "three"]) {
          yield* runtime.sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: `order:${text}`,
            prompt: textPrompt(text),
          })
        }
        const delivered = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(delivered.map((entry) => entry.sequence)).toEqual(
          [...delivered.map((entry) => entry.sequence)].sort((a, b) => a - b),
        )
        expect(delivered).toHaveLength(3)
      }).pipe(provided),
    )

    it.live("gives every delivered message its own steering row in admission order", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("steering-rows"))
        for (const text of ["one", "two", "three"]) {
          yield* runtime.sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: `rows:${text}`,
            prompt: textPrompt(text),
          })
        }
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "child" })
        const delivered = yield* store.deliverPendingMessages({ runId: first.runId })
        const steering = yield* store.readSteering(claim)
        expect(steering.map((entry) => entry.idempotencyKey)).toEqual(
          delivered.map((entry) => Mailbox.steeringKey(entry.entryId)),
        )
      }).pipe(provided),
    )

    it.live("never binds a message to a terminal Run", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("terminal"))
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "terminal-guard",
          prompt: textPrompt("status?"),
        })
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "child" })
        yield* store.complete({ ...claim, result: completedResult("done") })
        const delivered = yield* store.deliverPendingMessages({ runId: first.runId })
        expect(delivered).toHaveLength(0)
      }).pipe(provided),
    )
  })
}
