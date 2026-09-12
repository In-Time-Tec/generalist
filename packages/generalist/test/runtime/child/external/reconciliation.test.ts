import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { close, make } from "../../../../src/core/agent/service.js"
import { activate, layer as durabilityLayer, layerRunStore } from "../../../../src/durability/index.js"
import { ObjectStore } from "../../../../src/durability/object-store.js"
import { make as makeAddress } from "../../../../src/runtime/address.js"
import {
  type AdmissionRequest,
  ReserveInput,
  type RootAdmission,
  identifyRequest,
} from "../../../../src/runtime/child/external/placement.js"
import { reconcilePage } from "../../../../src/runtime/child/external/reconciliation.js"
import { ExternalChildStore, type Service } from "../../../../src/runtime/child/external/store.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { layerStatic } from "../../../../src/runtime/executable/resolver.js"
import { LocalScheduler } from "../../../../src/runtime/execution/local-scheduler.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { pinnedTestExecutable } from "../../run/identity.js"
import { registrationsFor } from "../../execution/fixtures.js"

const agent = make({ name: "external-recovery" })
const executable = pinnedTestExecutable(agent)
const address = makeAddress("agent:external-recovery")
const registrations = registrationsFor(executable)
const common = {
  environment: "test",
  tenant: "external-recovery",
  addresses: [{ address, executable, registrations }],
}
const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})
type Fault =
  | "before-admission"
  | "admitRoot"
  | "acknowledge"
  | "activateRoot"
  | "cancelRoot"
  | "settle"
  | "acknowledgeRootSettlement"

const makeFixture = Effect.gen(function* () {
  const bucket = yield* makeSimulator()
  const faults = new Set<Fault>()
  const counts = { executions: 0, writes: 0 }
  const failAfter = <A, E, R>(operation: Fault, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tap(() =>
        Effect.suspend(() =>
          faults.delete(operation) ? RuntimeUnavailable.make({ message: `lost ${operation} reply` }) : Effect.void,
        ),
      ),
    )
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([]),
      streamText: () => {
        counts.executions++
        return Stream.make(
          Response.makePart("text-delta", { id: "text", delta: "delivered once" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      },
    }),
  )
  const resolver = layerStatic([{ executable, agent: close(agent, model) }]).pipe(Layer.orDie)
  const storage = Layer.unwrap(
    Effect.map(bucket.connect, (client) =>
      Layer.succeed(ObjectStore, {
        ...client.store,
        create: (key, bytes) =>
          Effect.sync(() => void counts.writes++).pipe(Effect.andThen(client.store.create(key, bytes))),
      }),
    ),
  )
  const layerFor = (partition: string) =>
    Layer.effect(
      ExternalChildStore,
      Effect.map(ExternalChildStore, (store) => ({
        ...store,
        admitRoot: (input: RootAdmission) =>
          Effect.suspend(() =>
            faults.delete("before-admission")
              ? RuntimeUnavailable.make({ message: "admission was not delivered" })
              : failAfter("admitRoot", store.admitRoot(input)),
          ),
        acknowledge: (id: string) => failAfter("acknowledge", store.acknowledge(id)),
        activateRoot: (id: string) => failAfter("activateRoot", store.activateRoot(id)),
        cancelRoot: (id: string, reason?: string) => failAfter("cancelRoot", store.cancelRoot(id, reason)),
        settle: (input: Parameters<Service["settle"]>[0]) => failAfter("settle", store.settle(input)),
        acknowledgeRootSettlement: (input: Parameters<Service["acknowledgeRootSettlement"]>[0]) =>
          failAfter("acknowledgeRootSettlement", store.acknowledgeRootSettlement(input)),
      })),
    ).pipe(
      Layer.provideMerge(
        layerRunStore({ ...common, partition, workerId: `${partition}-host` }).pipe(Layer.provide(storage)),
      ),
    )
  const withHost = <A, E, R>(partition: string, effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(layerFor(partition))
        return yield* effect.pipe(Effect.provide(services))
      }),
    )
  const options = (partition: string) => ({
    partition,
    connect: (peer: string) =>
      Effect.succeed(
        peer === "parent" || peer === "child"
          ? Option.some(Layer.effect(ExternalChildStore, ExternalChildStore).pipe(Layer.provide(layerFor(peer))))
          : Option.none(),
      ),
  })
  const reserve = (id: string) =>
    withHost(
      "parent",
      Effect.gen(function* () {
        yield* activate
        const store = yield* RunStore
        const parent = yield* store.admitSend({
          runId: `parent:${id}`,
          message: {
            id: `parent-message:${id}`,
            to: address,
            sessionId: `parent-session:${id}`,
            prompt: Prompt.make("parent"),
            idempotencyKey: id,
            correlationId: id,
            metadata: {},
          },
          executableRef: executable.ref,
          executableManifest: executable.manifest,
          registrations,
        })
        const claim = yield* store.claimExecution({
          runId: parent.runId,
          ownerId: "parent-host",
          commandId: `claim:${id}`,
        })
        const request: AdmissionRequest = {
          parent: { partition: "parent", runId: parent.runId },
          ref: { partition: "child", runId: `child:${id}` },
          root: {
            message: {
              id: `child-message:${id}`,
              to: address,
              sessionId: `child-session:${id}`,
              prompt: Prompt.make("child"),
              idempotencyKey: `child:${id}`,
              correlationId: id,
              metadata: {},
            },
            executableRef: executable.ref,
            executableManifest: executable.manifest,
            registrations,
          },
        }
        expect(claim.session).toBeDefined()
        const input: ReserveInput = {
          ...claim,
          session: claim.session!,
          placementId: id,
          invocationId: id,
          request,
          ...(yield* identifyRequest(request)),
        }
        const placement = yield* (yield* ExternalChildStore).reserve(input)
        yield* store.releaseExecution(claim)
        return { input, placement }
      }),
    )
  const reconcile = (partition: string) => withHost(partition, reconcilePage(options(partition)))
  const drainChild = Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        durabilityLayer({ ...common, partition: "child", schedulerMode: "external" }).pipe(
          Layer.provide(resolver),
          Layer.provide(storage),
        ),
      )
      yield* activate.pipe(Effect.provide(services))
      yield* Effect.flatMap(LocalScheduler, (scheduler) => scheduler.drain({ fuel: 64 })).pipe(Effect.provide(services))
    }),
  )
  return { bucket, counts, faults, withHost, reserve, reconcile, drainChild, options }
})

layer(BunCrypto.layer)("external obligation recovery", (it) => {
  for (const fault of ["before-admission", "admitRoot", "acknowledge", "activateRoot"] as const) {
    it.effect(`fresh two-partition hosts recover lost ${fault} without redispatch`, () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const { input, placement } = yield* fixture.reserve("delivery")
        fixture.faults.add(fault)
        expect(yield* fixture.reconcile("parent").pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/runtime/RuntimeUnavailable",
        })
        expect(fixture.counts.executions).toBe(0)
        expect(
          yield* fixture.withHost(
            "parent",
            Effect.flatMap(ExternalChildStore, (store) => store.inspectPlacement("delivery")),
          ),
        ).toMatchObject({ request: placement.request, requestDigest: placement.requestDigest, settled: false })
        if (fault === "before-admission") yield* fixture.reconcile("parent")
        else yield* fixture.reconcile("child")
        yield* fixture.drainChild
        yield* fixture.reconcile("child")
        yield* fixture.reconcile("parent")
        yield* fixture.drainChild
        expect(fixture.counts.executions).toBe(1)
        yield* fixture.withHost(
          "parent",
          Effect.gen(function* () {
            const store = yield* ExternalChildStore
            const settled = yield* store.inspectPlacement("delivery")
            expect(settled).toMatchObject({ settled: true, acknowledged: true, request: input.request })
            expect(yield* store.outstandingPlacements({ limit: 10 })).toEqual({ items: [] })
            expect(yield* store.reserve(input)).toEqual(placement)
          }),
        )
        yield* fixture.withHost(
          "child",
          Effect.gen(function* () {
            const store = yield* ExternalChildStore
            expect(yield* store.outstandingRoots({ limit: 10 })).toEqual({ items: [] })
            expect(yield* store.inspectRoot("delivery")).toMatchObject({
              settlementAcknowledged: true,
              outcome: { _tag: "Succeeded" },
            })
            expect((yield* (yield* RunStore).list({ limit: 10 })).map((run) => run.runId)).toEqual([
              input.request.ref.runId,
            ])
          }),
        )
      }),
    )
  }

  for (const fault of ["settle", "acknowledgeRootSettlement"] as const) {
    it.effect(`receiver enumeration recovers a lost ${fault} reply after the parent obligation disappears`, () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        yield* fixture.reserve("settlement")
        yield* fixture.reconcile("parent")
        yield* fixture.drainChild
        fixture.faults.add(fault)
        expect(yield* fixture.reconcile("child").pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/runtime/RuntimeUnavailable",
        })
        const retained = yield* fixture.withHost(
          "parent",
          Effect.flatMap(ExternalChildStore, (store) => store.inspectPlacement("settlement")),
        )
        expect(retained.settled).toBe(true)
        yield* fixture.reconcile("parent")
        yield* fixture.reconcile("child")
        yield* fixture.drainChild
        expect(fixture.counts.executions).toBe(1)
        const terminal = yield* fixture.withHost(
          "child",
          Effect.flatMap(ExternalChildStore, (store) => store.rootSettlement("settlement")),
        )
        expect(terminal).toMatchObject({
          value: { acknowledged: true, settlementId: retained.settlementId, outcome: retained.outcome },
        })
        expect(
          yield* fixture.withHost(
            "parent",
            Effect.flatMap(ExternalChildStore, (store) => store.inspectPlacement("settlement")),
          ),
        ).toEqual(retained)
      }),
    )
  }

  for (const fault of ["admitRoot", "cancelRoot"] as const) {
    it.effect(`a lost ${fault} reply during cancellation is recovered without child execution`, () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        yield* fixture.reserve("cancel")
        yield* fixture.withHost(
          "parent",
          Effect.flatMap(ExternalChildStore, (store) => store.cancel("cancel")),
        )
        fixture.faults.add(fault)
        yield* fixture.reconcile("parent").pipe(Effect.flip)
        yield* fixture.reconcile("child")
        yield* fixture.drainChild
        expect(fixture.counts.executions).toBe(0)
        expect(
          yield* fixture.withHost(
            "parent",
            Effect.flatMap(ExternalChildStore, (store) => store.inspectPlacement("cancel")),
          ),
        ).toMatchObject({ settled: true, cancelRequested: true, outcome: { _tag: "Cancelled" } })
      }),
    )
  }

  it.effect("application-denied peers do not receive admission or activation", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      yield* fixture.reserve("denied")
      const writes = fixture.counts.writes
      const result = yield* fixture.withHost(
        "parent",
        reconcilePage({
          partition: "parent",
          connect: () => Effect.succeed(Option.none()),
        }),
      )
      expect(result).toMatchObject({ placements: 1, denied: 1 })
      expect(fixture.counts.writes).toBe(writes)
      expect(fixture.counts.executions).toBe(0)
      expect(
        yield* fixture.withHost(
          "child",
          Effect.flatMap(ExternalChildStore, (store) => store.outstandingRoots({ limit: 10 })),
        ),
      ).toEqual({ items: [] })
    }),
  )

  it.effect("bounded read-only windows keep a continuation across settled entries", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      for (const id of ["a", "b", "c"]) yield* fixture.reserve(id)
      yield* fixture.reconcile("parent")
      yield* fixture.withHost(
        "child",
        Effect.flatMap(ExternalChildStore, (store) => store.cancelRoot("a")),
      )
      yield* fixture.reconcile("child")
      const writes = fixture.counts.writes
      yield* fixture.withHost(
        "parent",
        Effect.gen(function* () {
          const store = yield* ExternalChildStore
          expect(yield* store.outstandingPlacements({ limit: 1 })).toEqual({ items: [], cursor: "a" })
          const second = yield* store.outstandingPlacements({ limit: 1, afterPlacementId: "a" })
          expect(second.items.map((item) => item.placementId)).toEqual(["b"])
          expect(second.cursor).toBe("b")
          expect(
            (yield* store.outstandingPlacements({ limit: 1, afterPlacementId: "b" })).items.map(
              (item) => item.placementId,
            ),
          ).toEqual(["c"])
          for (const limit of [0, 1001, 1.5])
            expect(yield* store.outstandingPlacements({ limit }).pipe(Effect.flip)).toMatchObject({
              _tag: "generalist/runtime/RuntimeUnavailable",
            })
        }),
      )
      yield* fixture.withHost(
        "child",
        Effect.gen(function* () {
          const store = yield* ExternalChildStore
          expect(yield* store.outstandingRoots({ limit: 1 })).toEqual({ items: [], cursor: "a" })
          expect(
            (yield* store.outstandingRoots({ limit: 1, afterPlacementId: "a" })).items.map((item) => item.placementId),
          ).toEqual(["b"])
        }),
      )
      expect(fixture.counts.writes).toBe(writes)
    }),
  )

  it.effect("required envelopes reject omissions, divergent digests, foreign parents and oversized payloads", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const { input } = yield* fixture.reserve("schema")
      const encoded = yield* Schema.encodeEffect(ReserveInput)(input)
      const { request: _request, ...missingRequest } = encoded
      expect(yield* Schema.decodeUnknownEffect(ReserveInput)(missingRequest).pipe(Effect.isFailure)).toBe(true)
      const oversized = {
        ...input.request,
        root: {
          ...input.request.root,
          message: { ...input.request.root.message, prompt: Prompt.make("x".repeat(1024 * 1024 + 1)) },
        },
      }
      expect(yield* identifyRequest(oversized).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/PayloadTooLarge",
        boundary: "external child admission",
      })
      yield* fixture.withHost(
        "parent",
        Effect.gen(function* () {
          const store = yield* ExternalChildStore
          expect(
            yield* store.reserve({ ...input, placementId: "digest", requestDigest: "divergent" }).pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/ExternalChildPlacementConflict" })
          const request = { ...input.request, parent: { ...input.request.parent, partition: "foreign" } }
          expect(
            yield* store
              .reserve({ ...input, placementId: "foreign", request, ...(yield* identifyRequest(request)) })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
          expect(yield* store.inspectPlacement("digest").pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/ExternalChildPlacementNotFound",
          })
          expect(yield* store.inspectPlacement("foreign").pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/ExternalChildPlacementNotFound",
          })
          const writes = fixture.counts.writes
          expect(
            yield* store.reserve({ ...input, placementId: "oversized", request: oversized }).pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/PayloadTooLarge", boundary: "external child reservation" })
          expect(fixture.counts.writes).toBe(writes)
        }),
      )
    }),
  )
})
