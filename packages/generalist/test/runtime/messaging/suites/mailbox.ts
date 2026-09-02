import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Errors } from "../../../../src/runtime/index.js"
import { completedResult, textPrompt } from "../../execution/fixtures.js"
import { messagingBackend, type MessagingBackend } from "../scenario.js"

export const messagingMailboxSuite = <StoreError, Extra = never>(backend: MessagingBackend<StoreError, Extra>) => {
  const { provide, familyFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:mailbox:${backend.name}:${label}`

  describeBackend(`durable mailbox admission (${backend.name})`, () => {
    it.live("returns the same receipt for a duplicate admission", () =>
      Effect.gen(function* () {
        const { runtime, parent, first } = yield* familyFor(session("idempotent"))
        const send = () =>
          runtime.sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: "same-key",
            messageId: "msg:same",
            prompt: textPrompt("only once"),
          })

        const initial = yield* send()
        const replay = yield* send()

        expect(initial.duplicate).toBe(false)
        expect(replay.duplicate).toBe(true)
        expect(replay.entryId).toBe(initial.entryId)
        expect(replay.sequence).toBe(initial.sequence)
        expect(yield* runtime.messages({ runId: first.runId, limit: 10 })).toHaveLength(1)
      }).pipe(provide()),
    )

    it.live("rejects a divergent payload reusing one message identity", () =>
      Effect.gen(function* () {
        const { runtime, parent, first } = yield* familyFor(session("conflict"))
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "key",
          messageId: "msg:conflict",
          prompt: textPrompt("original"),
        })

        const error = yield* runtime
          .sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: "key",
            messageId: "msg:conflict",
            prompt: textPrompt("rewritten"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.SteeringConflict)
        expect(yield* runtime.messages({ runId: first.runId, limit: 10 })).toHaveLength(1)
      }).pipe(provide()),
    )

    it.live("treats two message identities that differ only in case as different messages", () =>
      Effect.gen(function* () {
        const { runtime, parent, first } = yield* familyFor(session("identity-case"))
        const lower = yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "key",
          messageId: "msg:review",
          prompt: textPrompt("lower"),
        })

        // Message identity is a wire identity, so a backend must compare it byte for byte rather
        // than through a case-insensitive collation.
        const upper = yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "KEY",
          messageId: "MSG:REVIEW",
          prompt: textPrompt("upper"),
        })
        expect(upper.duplicate).toBe(false)
        expect(upper.entryId).not.toBe(lower.entryId)
        expect(
          (yield* runtime.messages({ runId: first.runId, limit: 10 })).map((entry) => entry.idempotencyKey),
        ).toEqual(["key", "KEY"])
      }).pipe(provide()),
    )

    it.live("keeps one total order per target across interleaved senders", () =>
      Effect.gen(function* () {
        const { runtime, parent, first, second } = yield* familyFor(session("ordering"))

        // Interleave two senders: each sender's own messages keep the order it sent them, and the
        // target sees one total order over both.
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "parent:1",
          prompt: textPrompt("parent one"),
        })
        yield* runtime.sendMessage({
          fromRunId: second.runId,
          to: first.address,
          idempotencyKey: "sibling:1",
          prompt: textPrompt("sibling one"),
        })
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "parent:2",
          prompt: textPrompt("parent two"),
        })
        yield* runtime.sendMessage({
          fromRunId: second.runId,
          to: first.address,
          idempotencyKey: "sibling:2",
          prompt: textPrompt("sibling two"),
        })

        const entries = yield* runtime.messages({ runId: first.runId, limit: 10 })
        expect(entries.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3])
        expect(entries.map((entry) => entry.idempotencyKey)).toEqual(["parent:1", "sibling:1", "parent:2", "sibling:2"])
        expect(
          entries.filter((entry) => entry.fromRunId === parent.runId).map((entry) => entry.idempotencyKey),
        ).toEqual(["parent:1", "parent:2"])
        expect(
          entries.filter((entry) => entry.fromRunId === second.runId).map((entry) => entry.idempotencyKey),
        ).toEqual(["sibling:1", "sibling:2"])
      }).pipe(provide()),
    )

    it.live("gives every concurrent sender its own entry and one dense sequence", () =>
      Effect.gen(function* () {
        const { runtime, parent, first, second } = yield* familyFor(session("concurrent"))
        const senders = [parent.runId, second.runId]

        // Several agents addressing one mailbox at once is the ordinary case, so admission must
        // serialize on the target rather than race for the next sequence.
        yield* Effect.forEach(
          [0, 1, 2, 3, 4, 5, 6, 7],
          (index) =>
            runtime.sendMessage({
              fromRunId: senders[index % senders.length]!,
              to: first.address,
              idempotencyKey: `concurrent:${index}`,
              prompt: textPrompt(`message ${index}`),
            }),
          { concurrency: "unbounded" },
        )

        const entries = yield* runtime.messages({ runId: first.runId, limit: 20 })
        expect(entries).toHaveLength(8)
        expect(entries.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
        expect(new Set(entries.map((entry) => entry.entryId)).size).toBe(8)
        expect(new Set(entries.map((entry) => entry.idempotencyKey)).size).toBe(8)
      }).pipe(provide()),
    )

    it.live("refuses a message to a terminal target", () =>
      Effect.gen(function* () {
        const { runtime, store, parent, first } = yield* familyFor(session("terminal"))
        const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "terminal-test" })
        yield* store.complete({ ...claim, result: completedResult("done") })

        const error = yield* runtime
          .sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: "to-terminal",
            prompt: textPrompt("too late"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.RunTerminal)
        expect(Schema.is(Errors.RunTerminal)(error) ? error.status : undefined).toBe("succeeded")
      }).pipe(provide()),
    )

    it.live("bounds a pending read by its limit", () =>
      Effect.gen(function* () {
        const { runtime, parent, first } = yield* familyFor(session("limit"))
        for (const key of ["one", "two", "three"]) {
          yield* runtime.sendMessage({
            fromRunId: parent.runId,
            to: first.address,
            idempotencyKey: key,
            prompt: textPrompt(key),
          })
        }

        // The limit reaches the SQL backends as a literal rather than a bound parameter, because
        // MySQL rejects a placeholder in LIMIT.
        expect(
          (yield* runtime.messages({ runId: first.runId, limit: 2 })).map((entry) => entry.idempotencyKey),
        ).toEqual(["one", "two"])
        expect(yield* runtime.messages({ runId: first.runId, limit: 10 })).toHaveLength(3)
      }).pipe(provide()),
    )
  })
}
