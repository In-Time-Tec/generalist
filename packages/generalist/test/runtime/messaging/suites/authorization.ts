import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AgentDirectory, Errors } from "../../../../src/runtime/index.js"
import { textPrompt } from "../../execution/fixtures.js"
import { messagingBackend, type MessagingBackend } from "../scenario.js"

export const messagingAuthorizationSuite = <StoreError, Extra = never>(
  backend: MessagingBackend<StoreError, Extra>,
) => {
  const { provide, familyFor, strangerFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:authorization:${backend.name}:${label}`

  describeBackend(`addressed messaging authorization and directory (${backend.name})`, () => {
    it.live("delivers parent to child, child to parent, and sibling to sibling", () =>
      Effect.gen(function* () {
        const { runtime, parent, first, second } = yield* familyFor(session("relationships"))

        const toChild = yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: first.address,
          idempotencyKey: "parent-to-child",
          prompt: textPrompt("from parent"),
        })
        const toParent = yield* runtime.sendMessage({
          fromRunId: first.runId,
          to: parent.address,
          idempotencyKey: "child-to-parent",
          prompt: textPrompt("from child"),
        })
        const toSibling = yield* runtime.sendMessage({
          fromRunId: first.runId,
          to: second.address,
          idempotencyKey: "sibling-to-sibling",
          prompt: textPrompt("from sibling"),
        })

        expect([toChild.duplicate, toParent.duplicate, toSibling.duplicate]).toEqual([false, false, false])
        expect((yield* runtime.messages({ runId: first.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          toChild.messageId,
        ])
        expect((yield* runtime.messages({ runId: parent.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          toParent.messageId,
        ])
        expect((yield* runtime.messages({ runId: second.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          toSibling.messageId,
        ])
      }).pipe(provide()),
    )

    it.live("rejects an unrelated target with a typed authorization failure", () =>
      Effect.gen(function* () {
        const { runtime, first } = yield* familyFor(session("unrelated"))
        const outsider = yield* strangerFor(session("outsider"))

        const error = yield* runtime
          .sendMessage({
            fromRunId: first.runId,
            to: outsider.address,
            idempotencyKey: "unrelated",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.NotInFamily)
        expect(yield* runtime.messages({ runId: outsider.runId, limit: 10 })).toEqual([])
      }).pipe(provide()),
    )

    it.live("rejects an unrelated target inside one session as unrelated rather than cross-session", () =>
      Effect.gen(function* () {
        const { runtime, first } = yield* familyFor(session("same-session-unrelated"))
        const { second: otherFamilyChild } = yield* familyFor(session("same-session-unrelated-other"))

        const error = yield* runtime
          .sendMessage({
            fromRunId: first.runId,
            to: otherFamilyChild.address,
            idempotencyKey: "no-relationship",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.NotInFamily)
        expect(yield* runtime.messages({ runId: otherFamilyChild.runId, limit: 10 })).toEqual([])
      }).pipe(provide()),
    )

    it.live("derives the sender from the Run, so a supplied Address cannot forge it", () =>
      Effect.gen(function* () {
        const { runtime, parent, first, second } = yield* familyFor(session("no-forgery"))

        // `second` sends while naming nothing about itself: identity comes only from its Run record.
        const receipt = yield* runtime.sendMessage({
          fromRunId: second.runId,
          to: parent.address,
          idempotencyKey: "authentic-sender",
          prompt: textPrompt("hello"),
        })

        const delivered = yield* runtime.messages({ runId: parent.runId, limit: 10 })
        const entry = delivered.find((candidate) => candidate.messageId === receipt.messageId)
        expect(entry?.fromRunId).toBe(second.runId)
        expect(entry?.from).toBe(AgentDirectory.runAddress(second.runId))
        expect(entry?.from).not.toBe(first.address)
      }).pipe(provide()),
    )

    it.live("fails typed when the sender Run does not exist", () =>
      Effect.gen(function* () {
        const { runtime, parent } = yield* familyFor(session("absent-sender"))
        const error = yield* runtime
          .sendMessage({
            fromRunId: "run_absent",
            to: parent.address,
            idempotencyKey: "absent",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(Errors.RunNotFound)
      }).pipe(provide()),
    )

    it.live("fails typed for an address that names nothing and for a malformed address", () =>
      Effect.gen(function* () {
        const { runtime, first } = yield* familyFor(session("absent-target"))

        const missing = yield* runtime
          .sendMessage({
            fromRunId: first.runId,
            to: AgentDirectory.runAddress("run_missing"),
            idempotencyKey: "missing",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)
        expect(missing).toBeInstanceOf(Errors.AddressNotFound)

        const malformed = yield* runtime
          .sendMessage({
            fromRunId: first.runId,
            to: yield* Schema.decodeEffect(Schema.String.pipe(Schema.brand("Address")))("not-an-address"),
            idempotencyKey: "malformed",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)
        expect(malformed).toBeInstanceOf(Errors.AddressNotFound)
      }).pipe(provide()),
    )

    it.live("lists exactly the addresses a Run may reach", () =>
      Effect.gen(function* () {
        const { runtime, parent, first, second } = yield* familyFor(session("discovery"))
        yield* strangerFor(session("discovery-outsider"))

        const fromChild = (yield* runtime.directory(first.runId)).map((entry) => entry.runId)
        expect(new Set(fromChild)).toEqual(new Set([parent.runId, second.runId]))

        const fromParent = (yield* runtime.directory(parent.runId)).map((entry) => entry.runId)
        expect(new Set(fromParent)).toEqual(new Set([first.runId, second.runId]))
      }).pipe(provide()),
    )

    it.live("binds a friendly name that is unique within its parent scope", () =>
      Effect.gen(function* () {
        const { runtime, store, first, second } = yield* familyFor(session("names"))

        const named = yield* runtime.registerAgentName({
          runId: first.runId,
          name: AgentDirectory.makeName("reviewer"),
        })
        expect(named.name).toBe("reviewer")

        const resolved = yield* store.resolveAddress(
          AgentDirectory.nameAddress({
            scope: AgentDirectory.nameScope({ runId: first.runId, parentRunId: first.parentRunId }),
            name: AgentDirectory.makeName("reviewer"),
          }),
        )
        expect(resolved.runId).toBe(first.runId)

        // Re-registering the same name for the same Run is idempotent, not a conflict.
        yield* runtime.registerAgentName({ runId: first.runId, name: AgentDirectory.makeName("reviewer") })

        const conflict = yield* runtime
          .registerAgentName({ runId: second.runId, name: AgentDirectory.makeName("reviewer") })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.AgentNameConflict)
      }).pipe(provide()),
    )

    it.live("keeps one name distinct from another that differs only past the first characters", () =>
      Effect.gen(function* () {
        const { runtime, store, first, second } = yield* familyFor(session("name-distinctness"))
        yield* runtime.registerAgentName({ runId: first.runId, name: AgentDirectory.makeName("reviewer-one") })
        yield* runtime.registerAgentName({ runId: second.runId, name: AgentDirectory.makeName("reviewer-two") })

        const scopeOf = (entry: typeof first) =>
          AgentDirectory.nameScope({ runId: entry.runId, parentRunId: entry.parentRunId })
        const one = yield* store.resolveAddress(
          AgentDirectory.nameAddress({ scope: scopeOf(first), name: AgentDirectory.makeName("reviewer-one") }),
        )
        const two = yield* store.resolveAddress(
          AgentDirectory.nameAddress({ scope: scopeOf(second), name: AgentDirectory.makeName("reviewer-two") }),
        )
        expect(one.runId).toBe(first.runId)
        expect(two.runId).toBe(second.runId)
      }).pipe(provide()),
    )

    it.live("addresses a named sibling without knowing its Run id", () =>
      Effect.gen(function* () {
        const { runtime, first, second } = yield* familyFor(session("name-addressing"))
        yield* runtime.registerAgentName({ runId: second.runId, name: AgentDirectory.makeName("worker") })

        const receipt = yield* runtime.sendMessage({
          fromRunId: first.runId,
          to: AgentDirectory.nameAddress({
            scope: AgentDirectory.nameScope({ runId: second.runId, parentRunId: second.parentRunId }),
            name: AgentDirectory.makeName("worker"),
          }),
          idempotencyKey: "by-name",
          prompt: textPrompt("hello worker"),
        })

        expect((yield* runtime.messages({ runId: second.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          receipt.messageId,
        ])
      }).pipe(provide()),
    )

    it.live("authorizes a name address from the Run it resolves to, not from the name", () =>
      Effect.gen(function* () {
        const { runtime, first } = yield* familyFor(session("name-authorization"))
        const outsider = yield* strangerFor(session("name-authorization-outsider"))
        yield* runtime.registerAgentName({ runId: outsider.runId, name: AgentDirectory.makeName("outsider") })

        const error = yield* runtime
          .sendMessage({
            fromRunId: first.runId,
            to: AgentDirectory.nameAddress({
              scope: AgentDirectory.nameScope({ runId: outsider.runId, parentRunId: outsider.parentRunId }),
              name: AgentDirectory.makeName("outsider"),
            }),
            idempotencyKey: "named-outsider",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.NotInFamily)
        expect(yield* runtime.messages({ runId: outsider.runId, limit: 10 })).toEqual([])
      }).pipe(provide()),
    )
  })
}
