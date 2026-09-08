import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { activate, layerRunStore } from "../../../../../src/durability/index.js"
import { ObjectStore } from "../../../../../src/durability/object-store.js"
import { RunStore } from "../../../../../src/runtime/run/store.js"
import { make as makeSimulator, type Client } from "../../../../../src/testing/durability/index.js"
import { assistantAddress, assistantRef, completedResult, registrationsFor } from "../../../execution/fixtures.js"
import { provideScoped } from "../../../execution/scoped-provide.js"

const policy = { maxDepth: 2, maxSessions: 2, concurrency: { agents: 1, tools: 4 } }
const selection = {
  executableRef: assistantRef.ref,
  executableManifest: assistantRef.manifest,
  registrations: registrationsFor(assistantRef),
}
const open = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({
        environment: "test",
        tenant: "delegation",
        partition: "policy",
        workerId,
        addresses: [{ address: assistantAddress, executable: assistantRef, registrations: selection.registrations }],
      }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
    )
    yield* activate.pipe(Effect.provide(context))
    return yield* RunStore.pipe(Effect.provide(context))
  })

it.effect("pins namespace ceilings across raw admission, queue edits, and fresh-host recovery", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* open(bucket, "first")
      expect(yield* first.configureDelegationPolicy(policy)).toEqual(policy)
      const message = {
        id: "raw",
        to: assistantAddress,
        sessionId: "raw",
        idempotencyKey: "raw",
        correlationId: "raw",
        prompt: Prompt.make("raw"),
        metadata: {},
      }
      const wider = { ...policy, maxSessions: 3 }
      expect(yield* first.admitSend({ ...selection, message, treePolicy: wider }).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/TreePolicyInvalid",
      })
      expect(
        yield* first
          .admitStart({ ...selection, message, treePolicy: wider, initialChildren: [], initialFanOuts: [] })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/TreePolicyInvalid" })
      yield* first.createHostSession({ id: "queue", selection })
      yield* first.submitSessionInput({ sessionId: "queue", commandId: "first", prompt: Prompt.make("first") })
      const pending = yield* first.submitSessionInput({
        sessionId: "queue",
        commandId: "pending",
        prompt: Prompt.make("pending"),
      })
      const edit = {
        sessionId: "queue",
        commandId: "widen",
        id: pending.id,
        expectedRevision: pending.revision,
        prompt: Prompt.make("widen"),
        selection: { ...selection, treePolicy: wider },
      }
      expect(yield* first.updateSessionInput(edit).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/session/SessionQueueConflict",
      })
      const reopened = yield* open(yield* bucket.connect, "reopened")
      expect(yield* reopened.configureDelegationPolicy(policy)).toEqual(policy)
      expect(yield* reopened.configureDelegationPolicy(wider).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/TreePolicyInvalid",
      })
      const accepted = yield* reopened.admitSend({ ...selection, message })
      expect(yield* reopened.loadExecution(accepted.runId)).toMatchObject({ treePolicy: policy })
      expect(yield* reopened.updateSessionInput(edit).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/session/SessionQueueConflict",
      })
    }),
  ),
)

it.effect("retains child Session reservations across queued root continuations and reopen", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const store = yield* open(bucket, "family")
      yield* store.configureDelegationPolicy(policy)
      yield* store.createHostSession({ id: "family", selection })
      yield* store.submitSessionInput({ sessionId: "family", commandId: "first", prompt: Prompt.make("first") })
      const first = (yield* store.hostSession("family")).activeRunId!
      const spawn = (current: RunStore["Service"], parentRunId: string, key: string) =>
        current.admitSpawn({
          parentRunId,
          selection: "researcher",
          invocationId: key,
          prompt: Prompt.make(key),
          message: {
            id: key,
            to: assistantAddress,
            sessionId: `child:${key}`,
            idempotencyKey: key,
            correlationId: key,
            prompt: Prompt.make(key),
            metadata: {},
          },
        })
      const child = yield* spawn(store, first, "one")
      yield* store.cancel({ runId: child.runId, commandId: "cancel-child" })
      yield* store.submitSessionInput({ sessionId: "family", commandId: "second", prompt: Prompt.make("second") })
      const claim = yield* store.claimExecution({ runId: first, ownerId: "family", commandId: "claim-first" })
      yield* store.complete({ ...claim, commandId: "complete-first", result: completedResult("done") })
      const second = (yield* store.hostSession("family")).activeRunId!
      expect(second).not.toBe(first)
      yield* store.rewind({
        runId: second,
        toSequence: 0,
        commandId: "rewind-continuation",
        branchRunId: "archived-continuation",
      })
      const reopened = yield* open(yield* bucket.connect, "reopened")
      expect(
        yield* reopened
          .admitStart({
            ...selection,
            message: {
              id: "free-child",
              to: assistantAddress,
              sessionId: "child:one",
              idempotencyKey: "free-child",
              correlationId: "free-child",
              prompt: Prompt.make("free child continuation"),
              metadata: {},
            },
            initialChildren: [],
            initialFanOuts: [],
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
      expect(yield* spawn(reopened, second, "two").pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/ChildLimitExceeded",
        current: 2,
        requested: 1,
        limit: 2,
      })
    }),
  ),
)
