import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Clock, Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { activate, layerRunStore } from "../../src/durability/index.js"
import { StoreActivation } from "../../src/durability/internal/runtime.js"
import { ObjectStore } from "../../src/durability/object-store.js"
import { Address } from "../../src/runtime/address.js"
import { UnknownAgent } from "../../src/runtime/errors.js"
import { makeTest } from "../../src/runtime/executable/manifest.js"
import { RunStore, type Service as RunStoreService } from "../../src/runtime/run/store.js"
import { make as makeSimulator, type Client } from "../../src/testing/durability/index.js"
import { registrationsFor } from "../runtime/execution/fixtures.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const executable = makeTest("activation", "1")
const address = Address.make("agent:activation")
const open = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({
        environment: "test",
        tenant: "activation",
        partition: "shared",
        workerId,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
    )
    return {
      store: yield* RunStore.pipe(Effect.provide(context)),
      activation: activate.pipe(Effect.provide(context)),
      nextDueAt: (yield* StoreActivation.pipe(Effect.provide(context))).nextDueAt,
    }
  })
const admit = (store: RunStoreService, key: string) =>
  store.admitSend({
    message: {
      id: key,
      to: address,
      sessionId: key,
      prompt: Prompt.make("check wake eligibility"),
      idempotencyKey: key,
      correlationId: key,
      metadata: {},
    },
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    registrations: [],
  })

describe("partition activation deadlines", () => {
  it.effect("does not schedule a wake solely to maintain an idle worker lease", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const client = yield* makeSimulator()
        const host = yield* open(client, "idle")
        yield* host.activation
        expect(yield* host.nextDueAt).toBeUndefined()
        const run = yield* admit(host.store, "completed")
        expect(yield* host.nextDueAt).toBe(0)
        const claim = yield* host.store.claimExecution({ runId: run.runId, ownerId: "idle", commandId: "claim" })
        yield* host.store.complete({
          ...claim,
          commandId: "complete",
          result: { text: "done", output: "done", turns: 1, session: { sessionId: "completed", leafId: null } },
        })
        expect(yield* host.nextDueAt).toBeUndefined()
      }),
    ),
  )

  it.effect("keeps a wake at the lease expiry of an owner with unfinished work", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const client = yield* makeSimulator()
        const host = yield* open(client, "busy")
        yield* host.activation
        const now = yield* Clock.currentTimeMillis
        const run = yield* admit(host.store, "unfinished")
        const claim = yield* host.store.claimExecution({ runId: run.runId, ownerId: "busy", commandId: "claim" })
        const observer = yield* open(yield* client.connect, "observer")
        expect(yield* observer.nextDueAt).toBe(now + 30_000)
        yield* host.store.releaseExecution(claim)
        expect(yield* observer.nextDueAt).toBe(0)
      }),
    ),
  )

  it.effect("recovers released ownership on a fresh layer without losing the execution wake", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const client = yield* makeSimulator()
        const prior = yield* Effect.scoped(
          Effect.gen(function* () {
            const first = yield* open(client, "first")
            yield* first.activation
            const run = yield* admit(first.store, "reopen")
            return yield* first.store.claimExecution({ runId: run.runId, ownerId: "first", commandId: "first-claim" })
          }),
        )
        const next = yield* open(yield* client.connect, "replacement")
        expect(yield* next.nextDueAt).toBe(0)
        yield* next.activation
        const claim = yield* next.store.claimExecution({
          runId: prior.runId,
          ownerId: "replacement",
          commandId: "replacement-claim",
        })
        expect(claim.attemptFence).toBeGreaterThan(prior.attemptFence)
        expect(BigInt(claim.session.epoch)).toBeGreaterThan(BigInt(prior.session.epoch))
      }),
    ),
  )

  it.effect("preserves an await-event deadline without waking for an unrelated idle lease", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const client = yield* makeSimulator()
        const host = yield* open(client, "waiting")
        yield* host.activation
        const run = yield* admit(host.store, "deadline")
        const claim = yield* host.store.claimExecution({ runId: run.runId, ownerId: "waiting", commandId: "claim" })
        yield* host.store.suspend({
          ...claim,
          suspension: UnknownAgent.make({ name: "unregistered", runId: run.runId }),
          waits: [
            {
              waitId: "event",
              status: "open",
              openedAt: "1970-01-01T00:00:00.000Z",
              reason: {
                _tag: "AwaitEvent",
                filter: { _tag: "Webhook", source: "test" },
                deadline: "1970-01-01T00:01:00.000Z",
              },
            },
          ],
        })
        expect(yield* host.nextDueAt).toBe(60_000)
      }),
    ),
  )
})
