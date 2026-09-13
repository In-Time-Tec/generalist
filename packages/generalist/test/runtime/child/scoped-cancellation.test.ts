import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { make as makeChildren } from "../../../src/runtime/child/admission.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { Runtime } from "../../../src/runtime/engine.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { assistantAddress, parentRelativeOptions, resolverLayer } from "../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { provideScoped } from "../execution/scoped-provide.js"

const fixture = Effect.gen(function* () {
  const storage = makeObjectStorage()
  const creates = yield* Ref.make(0)
  const store = ObjectStore.of({
    ...storage.store,
    create: (...args) => Ref.update(creates, (count) => count + 1).pipe(Effect.andThen(storage.store.create(...args))),
  })
  return {
    creates,
    layer: objectRuntimeLayer(parentRelativeOptions, {
      store,
      faults: storage.faults,
      maintenance: storage.maintenance,
    }).pipe(Layer.provide(resolverLayer)),
  }
})

const parent = (id: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    const store = yield* RunStore
    const run = yield* runtime.send({ to: assistantAddress, sessionId: id, idempotencyKey: id, prompt: id })
    return yield* store.claimExecution({ runId: run.runId, ownerId: objectWorkerId, commandId: `claim:${id}` })
  })

describe("attempt-fenced child cancellation", () => {
  it.effect("validates both Run and Session ownership without writing", () =>
    Effect.gen(function* () {
      const test = yield* fixture
      yield* provideScoped(
        test.layer,
        Effect.gen(function* () {
          const store = yield* RunStore
          const claim = yield* parent("claim-validation")
          if (claim.session === undefined) return yield* Effect.die("Agent execution requires a Session claim")
          const before = yield* Ref.get(test.creates)
          yield* store.assertExecutionClaim(claim)
          expect(yield* store.assertExecutionClaim({ ...claim, ownerId: "replaced" }).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/StaleClaim",
          })
          expect(
            yield* store
              .assertExecutionClaim({
                ...claim,
                session: { ...claim.session, epoch: (BigInt(claim.session.epoch) + 1n).toString() },
              })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/StaleSessionClaim" })
          expect(yield* Ref.get(test.creates)).toBe(before)
        }),
      )
    }),
  )

  it.effect("preserves the command across claim replacement and rejects changed reasons or targets", () =>
    Effect.gen(function* () {
      const test = yield* fixture
      yield* provideScoped(
        test.layer,
        Effect.gen(function* () {
          const store = yield* RunStore
          const claim = yield* parent("parent")
          const children = makeChildren(store)
          const child = yield* children.admit({
            parentRunId: claim.runId,
            selection: "researcher",
            toolCallId: "call",
            prompt: "child",
            key: "child",
          })
          const other = yield* children.admit({
            parentRunId: claim.runId,
            selection: "researcher",
            toolCallId: "other-call",
            prompt: "other",
            key: "other",
          })
          const command = { ...claim, childRunId: child.childRunId, commandId: "cancel-child", reason: "superseded" }
          yield* store.cancelScopedChild(command)
          expect(yield* store.inspect(child.childRunId)).toMatchObject({ status: "cancelled" })
          yield* store.releaseExecution(claim)
          const replacement = yield* store.claimExecution({
            runId: claim.runId,
            ownerId: objectWorkerId,
            commandId: "replacement",
          })
          const beforeRetry = yield* Ref.get(test.creates)
          yield* store.cancelScopedChild({
            ...replacement,
            childRunId: child.childRunId,
            commandId: "cancel-child",
            reason: "superseded",
          })
          expect(yield* Ref.get(test.creates)).toBe(beforeRetry)
          expect(
            yield* store
              .cancelScopedChild({
                ...replacement,
                childRunId: child.childRunId,
                commandId: "cancel-child",
                reason: "changed",
              })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/durability/DurabilityFailure",
            reason: "input-conflict",
          })
          expect(
            yield* store
              .cancelScopedChild({
                ...replacement,
                childRunId: other.childRunId,
                commandId: "cancel-child",
                reason: "superseded",
              })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/durability/DurabilityFailure",
            reason: "input-conflict",
          })
          const beforeStale = yield* Ref.get(test.creates)
          expect(yield* store.cancelScopedChild(command).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/StaleClaim",
          })
          expect(yield* Ref.get(test.creates)).toBe(beforeStale)
          expect(
            (yield* store.history({ runId: child.childRunId, cursor: -1, limit: 100 })).filter(
              (event) => event._tag === "RunCancelled",
            ),
          ).toHaveLength(1)
        }),
      )
    }),
  )

  it.effect("rejects a live but unrelated parent and a stale new command without writes", () =>
    Effect.gen(function* () {
      const test = yield* fixture
      yield* provideScoped(
        test.layer,
        Effect.gen(function* () {
          const store = yield* RunStore
          const owner = yield* parent("owner")
          const foreign = yield* parent("foreign")
          const child = yield* makeChildren(store).admit({
            parentRunId: owner.runId,
            selection: "researcher",
            toolCallId: "call",
            prompt: "child",
            key: "child",
          })
          const before = yield* Ref.get(test.creates)
          expect(
            yield* store
              .cancelScopedChild({ ...foreign, childRunId: child.childRunId, commandId: "foreign-cancel" })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/runtime/ChildParentageInvalid",
            parentRunId: foreign.runId,
            childRunId: child.childRunId,
          })
          expect(
            yield* store
              .cancelScopedChild({
                ...owner,
                ownerId: "not-the-owner",
                childRunId: child.childRunId,
                commandId: "stale-cancel",
              })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/runtime/StaleClaim",
          })
          expect(yield* Ref.get(test.creates)).toBe(before)
          expect(yield* store.inspect(child.childRunId)).toMatchObject({ status: "queued" })
        }),
      )
    }),
  )
})
