import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentDirectory, Errors, Runtime, RunStore } from "../../../../../src/runtime/index.js"
import { assistantAddress, textPrompt } from "../../../execution/fixtures.js"
import { provideScoped } from "../../../execution/scoped-provide.js"

const encodePrompt = (prompt: Prompt.Prompt): string => Schema.encodeSync(Schema.fromJsonString(Prompt.Prompt))(prompt)

/**
 * One durable backend that can be closed and reopened over the same state.
 *
 * The memory Runtime has no state to reopen, so it is not a subject of this suite: the contract
 * under test is that a mailbox survives the process that admitted it.
 */
export interface MessagingDurabilitySuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const messagingDurabilitySuite = <StoreError, Extra = never>(
  options: MessagingDurabilitySuiteOptions<StoreError, Extra>,
) => {
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const describeBackend = options.skip === true ? describe.skip : describe
  const activate = options.activate ?? (() => Effect.void)
  const session = (label: string) => `thread:durable:${options.name}:${label}`

  const familyIn = (sessionId: string) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: `${sessionId}:parent`,
        prompt: textPrompt("plan"),
      })
      yield* activate(parent.runId)
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      return {
        runtime,
        store,
        parent: yield* store.directory(parent.runId),
        child: yield* store.directory(child.runId),
      }
    })

  describeBackend(`mailbox durability across reopen (${options.name})`, () => {
    it.live("preserves pending messages across a close and reopen", () => {
      const sessionId = session("pending")
      let parentRunId = ""
      let childRunId = ""

      const admit = provide(
        Effect.gen(function* () {
          const { runtime, parent, child } = yield* familyIn(sessionId)
          parentRunId = parent.runId
          childRunId = child.runId
          yield* runtime.sendMessage({
            fromRunId: child.runId,
            to: parent.address,
            idempotencyKey: "survives",
            prompt: textPrompt("survive the restart"),
          })
          expect(yield* runtime.messages({ runId: parent.runId, limit: 10 })).toHaveLength(1)
        }),
      )

      const reopen = provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const pending = yield* runtime.messages({ runId: parentRunId, limit: 10 })
          expect(pending).toHaveLength(1)
          expect(pending[0]?.fromRunId).toBe(childRunId)
          const prompt = pending[0]?.prompt
          expect(prompt === undefined ? "" : encodePrompt(prompt)).toContain("survive the restart")
        }),
      )

      return admit.pipe(Effect.andThen(reopen))
    })

    it.live("keeps admission idempotent across a reopen", () => {
      const sessionId = session("idempotent")
      let parentRunId = ""
      let childRunId = ""
      let entryId = ""

      const admit = provide(
        Effect.gen(function* () {
          const { runtime, parent, child } = yield* familyIn(sessionId)
          parentRunId = parent.runId
          childRunId = child.runId
          const receipt = yield* runtime.sendMessage({
            fromRunId: child.runId,
            to: parent.address,
            idempotencyKey: "once",
            messageId: "msg:once",
            prompt: textPrompt("exactly once"),
          })
          entryId = receipt.entryId
        }),
      )

      const retry = provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          // A sender that retried across the reopen must not create a second entry.
          const replay = yield* runtime.sendMessage({
            fromRunId: childRunId,
            to: AgentDirectory.runAddress(parentRunId),
            idempotencyKey: "once",
            messageId: "msg:once",
            prompt: textPrompt("exactly once"),
          })
          expect(replay.duplicate).toBe(true)
          expect(replay.entryId).toBe(entryId)
          expect(yield* runtime.messages({ runId: parentRunId, limit: 10 })).toHaveLength(1)
        }),
      )

      return admit.pipe(Effect.andThen(retry))
    })

    it.live("preserves a bound name and its address across a reopen", () => {
      const sessionId = session("name")
      let childRunId = ""
      let scope = ""

      const bind = provide(
        Effect.gen(function* () {
          const { runtime, child } = yield* familyIn(sessionId)
          childRunId = child.runId
          scope = AgentDirectory.nameScope({ runId: child.runId, parentRunId: child.parentRunId })
          yield* runtime.registerAgentName({ runId: child.runId, name: AgentDirectory.makeName("reviewer") })
        }),
      )

      const reopen = provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const resolved = yield* store.resolveAddress(
            AgentDirectory.nameAddress({ scope, name: AgentDirectory.makeName("reviewer") }),
          )
          expect(resolved.runId).toBe(childRunId)
          expect(resolved.name).toBe("reviewer")
        }),
      )

      return bind.pipe(Effect.andThen(reopen))
    })

    it.live("rejects a divergent payload for one message identity after a reopen", () => {
      const sessionId = session("conflict")
      let parentRunId = ""
      let childRunId = ""

      const admit = provide(
        Effect.gen(function* () {
          const { runtime, parent, child } = yield* familyIn(sessionId)
          parentRunId = parent.runId
          childRunId = child.runId
          yield* runtime.sendMessage({
            fromRunId: child.runId,
            to: parent.address,
            idempotencyKey: "key",
            messageId: "msg:key",
            prompt: textPrompt("original"),
          })
        }),
      )

      const reopen = provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const error = yield* runtime
            .sendMessage({
              fromRunId: childRunId,
              to: AgentDirectory.runAddress(parentRunId),
              idempotencyKey: "key",
              messageId: "msg:key",
              prompt: textPrompt("rewritten"),
            })
            .pipe(Effect.flip)
          expect(error).toBeInstanceOf(Errors.MessageConflict)
          expect(yield* runtime.messages({ runId: parentRunId, limit: 10 })).toHaveLength(1)
        }),
      )

      return admit.pipe(Effect.andThen(reopen))
    })

    it.live("continues the target's total order after a reopen", () => {
      const sessionId = session("ordering")
      let parentRunId = ""
      let childRunId = ""

      const admit = provide(
        Effect.gen(function* () {
          const { runtime, parent, child } = yield* familyIn(sessionId)
          parentRunId = parent.runId
          childRunId = child.runId
          yield* runtime.sendMessage({
            fromRunId: child.runId,
            to: parent.address,
            idempotencyKey: "before",
            prompt: textPrompt("before"),
          })
        }),
      )

      const reopen = provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          yield* runtime.sendMessage({
            fromRunId: childRunId,
            to: AgentDirectory.runAddress(parentRunId),
            idempotencyKey: "after",
            prompt: textPrompt("after"),
          })
          const entries = yield* runtime.messages({ runId: parentRunId, limit: 10 })
          // Sequence is derived from what is already stored, so a reopen must not restart it.
          expect(entries.map((entry) => entry.sequence)).toEqual([0, 1])
          expect(entries.map((entry) => entry.idempotencyKey)).toEqual(["before", "after"])
        }),
      )

      return admit.pipe(Effect.andThen(reopen))
    })

    it.live("still owes a message that was bound but never consumed before the reopen", () => {
      const sessionId = session("bound-unconsumed")
      let parentRunId = ""
      let parentSessionId = ""

      const admit = provide(
        Effect.gen(function* () {
          const { runtime, store, parent, child } = yield* familyIn(sessionId)
          parentRunId = parent.runId
          parentSessionId = parent.sessionId
          yield* runtime.sendMessage({
            fromRunId: child.runId,
            to: parent.address,
            idempotencyKey: "bound",
            prompt: textPrompt("bound but unconsumed"),
          })
          const bound = yield* store.deliverPendingMessages({ runId: parent.runId })
          expect(bound).toHaveLength(1)
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "doomed" })
          yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "worker died" }) })
        }),
      )

      const reopen = provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const owed = yield* store.pendingMessages({ sessionId: parentSessionId, limit: 10 })
          expect(owed).toHaveLength(1)
          expect(owed[0]?.deliveredRunId).toBe(parentRunId)
        }),
      )

      return admit.pipe(Effect.andThen(reopen))
    })
  })
}
