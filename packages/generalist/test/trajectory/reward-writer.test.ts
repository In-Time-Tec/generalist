import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
import * as RLExport from "generalist/unstable/rl-export"
import { makeObjectStorage } from "../runtime/execution/object.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"
import { unusedModel } from "../runtime/run/identity.js"

const namespace = { environment: "test", tenant: "reward-writer", partition: "commands" }

const fixture = Effect.gen(function* () {
  const simulator = makeObjectStorage()
  const creates = yield* Ref.make(0)
  const store = ObjectStore.of({
    ...simulator.store,
    create: (...args) =>
      Ref.update(creates, (count) => count + 1).pipe(Effect.andThen(simulator.store.create(...args))),
  })
  const assistant = Agent.make({ name: "assistant" })
  const options = {
    agents: { assistant },
    revision: "reward-v1",
    services: unusedModel,
    storage: Layer.merge(Layer.succeed(ObjectStore, store), BunCrypto.layer),
    namespace,
  }
  return { assistant, creates, simulator, options }
})

describe("Runtime-owned RewardWriter", () => {
  it.effect("records once and reports the actual original input for changed fields or Run identity", () =>
    Effect.gen(function* () {
      const state = yield* fixture
      yield* provideScoped(
        Runtime.layer(state.options),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const source = yield* runtime.hold(state.assistant, "source", { idempotencyKey: "source" })
          const other = yield* runtime.hold(state.assistant, "other", { idempotencyKey: "other" })
          const exported = yield* RLExport.runtime
          const command = { commandId: "judge", runId: source.runId, leaf: "leaf", value: 0.5, source: "fixture" }
          yield* exported.rewards.record(command)
          const beforeRetry = yield* Ref.get(state.creates)
          yield* exported.rewards.record({ ...command })
          expect(yield* Ref.get(state.creates)).toBe(beforeRetry)
          for (const changed of [
            { ...command, value: 0.75 },
            { ...command, leaf: "other-leaf" },
            { ...command, source: "other-source" },
            { ...command, runId: other.runId },
          ]) {
            const conflict = yield* exported.rewards.record(changed).pipe(Effect.flip)
            expect(conflict).toMatchObject({
              _tag: "generalist/rl-export/RewardConflict",
              commandId: "judge",
              existing: { runId: source.runId, leaf: "leaf", value: 0.5, source: "fixture" },
              received: { runId: changed.runId, leaf: changed.leaf, value: changed.value, source: changed.source },
            })
          }
          const events = yield* exported.history({ runId: source.runId, limit: 100 })
          expect(events.filter((event) => event._tag === "Rewarded")).toHaveLength(1)
          expect(
            yield* exported.rewards.record({ ...command, commandId: "missing", runId: "missing" }).pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/rl-export/RewardRunNotFound",
            runId: "missing",
          })
          expect(
            yield* RLExport.runtime.pipe(Effect.provideService(Runtime.Runtime, { ...runtime }), Effect.flip),
          ).toMatchObject({
            _tag: "generalist/runtime/RuntimeUnavailable",
          })
        }),
      )
    }),
  )

  it.effect("retains provenance after reopening and rejects a retired writer without any create", () =>
    Effect.gen(function* () {
      const state = yield* fixture
      const saved = yield* provideScoped(
        Runtime.layer(state.options),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const held = yield* runtime.hold(state.assistant, "source", { idempotencyKey: "source" })
          const exported = yield* RLExport.runtime
          const command = { commandId: "judge", runId: held.runId, leaf: "leaf", value: 0.5, source: "fixture" }
          yield* exported.rewards.record(command)
          return { command, writer: exported.rewards }
        }),
      )
      yield* provideScoped(
        Runtime.layer(state.options),
        Effect.gen(function* () {
          const current = yield* RLExport.runtime
          const before = yield* Ref.get(state.creates)
          expect(yield* saved.writer.record(saved.command).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/rl-export/RewardRuntimeUnavailable",
            commandId: "judge",
          })
          expect(yield* Ref.get(state.creates)).toBe(before)
          yield* current.rewards.record(saved.command)
          expect(yield* Ref.get(state.creates)).toBe(before)
          expect(yield* current.rewards.record({ ...saved.command, value: 0.75 }).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/rl-export/RewardConflict",
            existing: { runId: saved.command.runId, leaf: "leaf", value: 0.5, source: "fixture" },
          })
        }),
      )
    }),
  )

  it.effect("maps a storage failure without exposing provider details", () =>
    Effect.gen(function* () {
      const state = yield* fixture
      yield* provideScoped(
        Runtime.layer(state.options),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const held = yield* runtime.hold(state.assistant, "source", { idempotencyKey: "source" })
          const exported = yield* RLExport.runtime
          yield* state.simulator.faults.failNextCreate({ phase: "before", reason: "unavailable" })
          const error = yield* exported.rewards
            .record({
              commandId: "storage-error",
              runId: held.runId,
              leaf: "leaf",
              value: 0.5,
              source: "fixture",
            })
            .pipe(Effect.flip)
          expect(error).toMatchObject({
            _tag: "generalist/rl-export/RewardStorageFailed",
            commandId: "storage-error",
            operation: "record-reward",
            message: "Canonical storage could not establish the reward command result",
          })
        }),
      )
    }),
  )
})
