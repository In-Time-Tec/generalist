import { beforeEach } from "@effect/vitest"
import { Context, Deferred, Effect, Layer } from "effect"
import {
  modelResponseFaultConformance,
  type ClaimExecution,
  type ModelResponseFaultBoundary,
  type AtomicCommitCapability,
  type Services,
} from "generalist/testing/runtime-driver"
import { Testing } from "generalist/testing"
import { RunStore } from "../../../src/runtime/run/store.js"
import type { Service as ObjectStoreService } from "../../../src/durability/object-store.js"
import {
  assistantAddress,
  assistantRef,
  registrationsFor,
  resolverLayer,
  scheduleDefinition,
} from "../../runtime/execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer } from "../../runtime/execution/object.js"
import type { CreatePause, Simulator } from "../../../src/testing/durability/index.js"

let storage: Simulator
const hosts = new WeakMap<
  Services["store"],
  {
    readonly workerId: string
    readonly arm: (boundary: ModelResponseFaultBoundary) => void
    readonly pause: Effect.Effect<{ readonly entered: Effect.Effect<void>; readonly release: Effect.Effect<void> }>
  }
>()
let hostSequence = 0
beforeEach(() => {
  storage = makeObjectStorage()
  hostSequence = 0
})

/** New Layers share only immutable bucket objects, never a Runtime, RunStore, client faults or ownership. */
const freshLayer = (activate: boolean) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const client = yield* storage.connect
      const workerId = `conformance-host:${++hostSequence}`
      let boundary: ModelResponseFaultBoundary | undefined
      let paused: Deferred.Deferred<CreatePause> | undefined
      const store: ObjectStoreService = {
        ...client.store,
        create: (key, bytes) =>
          Effect.gen(function* () {
            if (paused !== undefined && key.includes("/commits/")) {
              const pending = paused
              paused = undefined
              yield* Deferred.succeed(pending, yield* client.faults.pauseNextCreate(key))
            }
            if (boundary !== undefined && key.includes("/commits/")) {
              const current = boundary
              boundary = undefined
              yield* client.faults.failNextCreate({ key, phase: current.startsWith("before-") ? "before" : "after" })
              if (current.endsWith("-unreadable")) yield* client.faults.failNextRead({ key })
            }
            return yield* client.store.create(key, bytes)
          }),
      }
      const context = yield* Layer.build(
        objectRuntimeLayer(
          {
            addresses: [
              { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
            ],
            workerId,
            subscriberQueueCapacity: 8,
          },
          { ...client, store },
          activate,
        ).pipe(Layer.provide(resolverLayer)),
      )
      hosts.set(Context.get(context, RunStore), {
        workerId,
        arm: (next) => {
          boundary = next
        },
        pause: Effect.gen(function* () {
          const pending = yield* Deferred.make<CreatePause>()
          paused = pending
          return {
            entered: Deferred.await(pending).pipe(
              Effect.flatMap((pause) => pause.entered),
              Effect.asVoid,
            ),
            release: Deferred.await(pending).pipe(Effect.flatMap((pause) => pause.release)),
          }
        }),
      })
      return context
    }),
  )

const layer = freshLayer(true)
const readLayer = freshLayer(false)
const claim: ClaimExecution = (services, { runId, commandId: action }) =>
  Effect.gen(function* () {
    const host = hosts.get(services.store)
    if (host === undefined) return yield* Effect.die("claim requires this fixture's activated host")
    return yield* services.store
      .claimExecution({
        runId,
        ownerId: host.workerId,
        commandId: `${runId}:claim:${action}`,
      })
      .pipe(Effect.orDie)
  })
const install = (services: Services, boundary: ModelResponseFaultBoundary) =>
  Effect.sync(() => {
    const host = hosts.get(services.store)
    if (host === undefined) throw new Error("fault requires this fixture's journal client")
    host.arm(boundary)
  })
const pauseNextCommit: AtomicCommitCapability["pauseNextCommit"] = (services) =>
  Effect.gen(function* () {
    const host = hosts.get(services.store)
    if (host === undefined) return yield* Effect.die("pause requires this fixture's journal client")
    return yield* host.pause
  })

Testing.runtimeDriver({
  name: "object-native",
  address: assistantAddress,
  layer,
  capabilities: {
    admission: true,
    runtime: { claim },
    "tool-runs": { claim },
    "host-sessions": { claim },
    "start-by-agent": { claim },
    "idempotent-start": { claim },
    "unknown-agent-on-recovery": { claim },
    "approval-suspend": { claim },
    "await-event": { claim },
    schedules: { definition: scheduleDefinition },
    "child-runs": { claim },
    "operator-explain": true,
    "operator-retry": { claim },
    "operator-resolve-unknown": { claim },
    "operator-scan": { claim },
    runTree: { claim },
    "fork-rewind": { claim },
    artifacts: true,
    steering: { claim },
    atomicCommits: { claim, failNextCommit: (services) => install(services, "before-publication"), pauseNextCommit },
    multiWorkerClaims: { layer, claim },
    notificationRecovery: { claim },
  },
})

modelResponseFaultConformance({
  name: "object-native",
  address: assistantAddress,
  layer,
  readLayer,
  claim,
  install,
})
