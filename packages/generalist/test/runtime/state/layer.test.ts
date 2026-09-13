import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { activate, layer as durabilityLayer } from "generalist/durability"
import { ObjectStore, type Service as ObjectStoreService } from "generalist/durability/object-store"
import { LocalScheduler } from "../../../src/runtime/execution/local-scheduler.js"
import { makeObjectStorage } from "../execution/object.js"
import { assistantAddress, assistantRef, registrationsFor, resolverLayer } from "../execution/fixtures.js"

const namespace = { environment: "test", tenant: "runtime-layer", partition: "state-layer" }

const host = (store: ObjectStoreService, workerId: string, partition: string) =>
  Layer.build(
    durabilityLayer({
      ...namespace,
      partition,
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      workerId,
      ownershipLeaseMillis: 1000,
      reconcileInterval: "100 millis",
      scheduler: { pollInterval: "1 hour" },
      schedulerMode: "external",
    }).pipe(Layer.provide(Layer.mergeAll(Layer.succeed(ObjectStore, store), BunCrypto.layer, resolverLayer))),
  )

describe("activated Runtime retirement", () => {
  it.effect("scheduler calls after scope close fail RuntimeRetired", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const context = yield* host(makeObjectStorage().store, "retiring-worker", "state-layer-retired").pipe(
        Scope.provide(scope),
      )
      yield* activate.pipe(Effect.provide(Context.add(context, Scope.Scope, scope)))
      const scheduler = Context.get(context, LocalScheduler)
      const drain = (fuel: number) => scheduler.drain({ fuel }).pipe(Effect.provide(context))
      yield* drain(1)
      yield* Scope.close(scope, Exit.void)
      const error = yield* drain(1).pipe(Effect.flip)
      expect(error).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
    }),
  )

  it.effect("reactivates one layer while rejecting a prepared prior scheduler invocation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* host(makeObjectStorage().store, "reactivating-worker", "state-layer-reactivated")
        const scheduler = Context.get(context, LocalScheduler)
        const firstDrain = scheduler.drain({ fuel: 1 })

        yield* Effect.scoped(activate.pipe(Effect.andThen(firstDrain), Effect.provide(context)))

        const stale = yield* Effect.scoped(
          activate.pipe(
            Effect.andThen(scheduler.drain({ fuel: 1 })),
            Effect.andThen(firstDrain.pipe(Effect.flip)),
            Effect.provide(context),
          ),
        )
        expect(stale).toMatchObject({
          _tag: "generalist/runtime/RuntimeUnavailable",
          message: "scheduler invocation belongs to a retired activation",
        })
      }),
    ),
  )

  it.live("a store failure during the ownership heartbeat retires the incarnation with RuntimeOwnershipLost", () =>
    Effect.gen(function* () {
      const simulator = makeObjectStorage()
      const client = yield* simulator.connect
      const scope = yield* Scope.make()
      const context = yield* host(client.store, "failing-worker", "state-layer-takeover").pipe(Scope.provide(scope))
      yield* activate.pipe(Effect.provide(Context.add(context, Scope.Scope, scope)))
      const scheduler = Context.get(context, LocalScheduler)
      const drain = (fuel: number) => scheduler.drain({ fuel }).pipe(Effect.provide(context))
      yield* drain(1)

      // The next heartbeat reconcile commits through the faulted create and loses ownership.
      yield* client.faults.failNextCreate({ phase: "before", reason: "unavailable" })
      yield* Effect.sleep("700 millis")

      const error = yield* drain(1).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        namespace: { ...namespace, partition: "state-layer-takeover" },
      })
      yield* Scope.close(scope, Exit.void)
    }),
  )
})
