import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { ProgramCapabilities } from "../../../../src/index.js"
import { identifyRequest } from "../../../../src/runtime/child/external/placement.js"
import { ExternalChildStore } from "../../../../src/runtime/child/external/store.js"
import { Address, Message, Runtime, RunStore } from "../../../../src/runtime/index.js"
import type { ExecutionClaim } from "../../../../src/runtime/run/store.js"
import {
  assistantAddress,
  assistantRef,
  completedResult,
  objectLayer,
  registrationsFor,
  resolverLayer,
  textPrompt,
} from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"
const externalRoot = (id: string) =>
  Effect.gen(function* () {
    const request = {
      parent: { partition: "openwork:parent", runId: `parent:${id}` },
      ref: { partition: "conformance", runId: `child:${id}` },
      root: {
        message: Message.make({
          id: `message:${id}`,
          to: Address.make(`external-root:${id}`),
          sessionId: `thread:${id}`,
          prompt: textPrompt(`delegated ${id}`),
          idempotencyKey: `root:${id}`,
          correlationId: `parent:${id}`,
          metadata: {},
        }),
        executableRef: assistantRef.ref,
        executableManifest: assistantRef.manifest,
        registrations: registrationsFor(assistantRef),
        treePolicy: { maxDepth: 2, maxSubagents: 2 },
      },
    }
    return { placementId: `placement:${id}`, ...request, ...(yield* identifyRequest(request)) }
  })

const suite = <E>(name: string, layer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | ExternalChildStore, E>) => {
  let sequence = 0
  const provide = <A, Failure>(
    effect: Effect.Effect<A, Failure, Runtime.Runtime | RunStore.RunStore | ExternalChildStore>,
  ) => provideScoped(layer, effect)
  const placement = (claim: ExecutionClaim, placementId: string) =>
    Effect.gen(function* () {
      const admission = yield* externalRoot(placementId)
      const request = {
        parent: { partition: "conformance", runId: claim.runId },
        ref: { partition: "openwork:west", runId: `remote:${placementId}` },
        root: admission.root,
      }
      return {
        ...claim,
        placementId,
        request,
        invocationId: `invoke:${placementId}`,
        ...(yield* identifyRequest(request)),
      }
    })
  const root = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const id = `${name}:external:${sequence++}`
    return yield* runtime.send({
      to: assistantAddress,
      sessionId: id,
      idempotencyKey: id,
      prompt: textPrompt("external parent"),
      treePolicy: { maxDepth: 2, maxSubagents: 1 },
    })
  })
  describe(`external child placement (${name})`, () => {
    it.live("admits an independently addressable depth-zero root behind an idempotent activation gate", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const input = yield* externalRoot(`${name}:gate`)
          expect(yield* external.admitRoot(input)).toMatchObject({
            placementId: input.placementId,
            parent: input.parent,
            ref: input.ref,
            sessionId: input.root.message.sessionId,
            activated: false,
          })
          expect(yield* store.inspect(input.ref.runId)).toMatchObject({
            runId: input.ref.runId,
            status: "queued",
            depth: 0,
          })
          expect(
            (yield* store
              .claimExecution({
                commandId: "runtime-child-external-placement-test-ts-claim-1",
                runId: input.ref.runId,
                ownerId: objectWorkerId,
              })
              .pipe(Effect.flip))._tag,
          ).toBe("generalist/runtime/RuntimeUnavailable")
          expect(yield* external.admitRoot(input)).toMatchObject({ activated: false })
          expect(
            yield* external.admitRoot({ ...input, requestDigest: `${input.requestDigest}:changed` }).pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/ExternalRootConflict", placementId: input.placementId })
          expect(
            (yield* external
              .admitRoot({ ...(yield* externalRoot(`${name}:digest-mismatch`)), executableDigest: "wrong" })
              .pipe(Effect.flip))._tag,
          ).toBe("generalist/runtime/ExternalRootExecutableMismatch")
          expect(yield* external.activateRoot(input.placementId)).toMatchObject({ activated: true })
          expect(yield* external.activateRoot(input.placementId)).toMatchObject({ activated: true })
          const history = yield* store.history({ runId: input.ref.runId, cursor: -1, limit: 20 })
          expect(history.filter((event) => event._tag === "RunAttemptStarted")).toHaveLength(1)
          const claim = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-2",
            runId: input.ref.runId,
            ownerId: objectWorkerId,
          })
          yield* store.complete({
            commandId: "runtime-child-external-placement-test-ts-complete-1",
            ...claim,
            result: completedResult("delegated result"),
          })
          expect(yield* external.rootSettlement(input.placementId)).toMatchObject({
            value: {
              placementId: input.placementId,
              ref: input.ref,
              acknowledged: false,
              outcome: { _tag: "Succeeded", result: completedResult("delegated result") },
            },
          })
        }),
      ),
    )

    it.live("cancels before activation and replays one terminal settlement until exact acknowledgement", () =>
      provide(
        Effect.gen(function* () {
          const external = yield* ExternalChildStore
          const input = yield* externalRoot(`${name}:cancel-before-activation`)
          yield* external.admitRoot(input)
          expect(yield* external.cancelRoot(input.placementId, "parent requested cancellation")).toMatchObject({
            activated: false,
            cancelRequested: true,
            outcome: { _tag: "Cancelled", reason: "parent requested cancellation" },
          })
          const first = yield* external.rootSettlement(input.placementId)
          expect(Option.isSome(first)).toBe(true)
          if (Option.isNone(first)) return
          expect(first.value).toMatchObject({
            placementId: input.placementId,
            ref: input.ref,
            acknowledged: false,
          })
          expect(yield* external.rootSettlement(input.placementId)).toEqual(first)
          expect(
            yield* external
              .acknowledgeRootSettlement({ placementId: input.placementId, settlementId: "wrong" })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/ExternalChildSettlementConflict" })
          expect(
            yield* external.acknowledgeRootSettlement({
              placementId: input.placementId,
              settlementId: first.value.settlementId,
            }),
          ).toMatchObject({ acknowledged: true })
          expect(yield* external.rootSettlement(input.placementId)).toMatchObject({
            value: { acknowledged: true },
          })
        }),
      ),
    )

    it.live("replays exact reservations and rejects divergent or over-capacity reservations without mutation", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-3",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const input = yield* placement(claim, "placement:1")
          expect(yield* external.reserve(input)).toMatchObject({
            placementId: input.placementId,
            parentRunId: input.runId,
            request: input.request,
            invocationId: input.invocationId,
            requestDigest: input.requestDigest,
            executableDigest: input.executableDigest,
            settled: false,
          })
          expect(yield* external.reserve(input)).toMatchObject({ placementId: input.placementId })
          expect(yield* external.reserve({ ...input, requestDigest: "different" }).pipe(Effect.flip)).toMatchObject({
            _tag: "generalist/runtime/ExternalChildPlacementConflict",
            placementId: input.placementId,
          })
          const conflicting = yield* placement(claim, "placement:ref-conflict")
          const request = { ...conflicting.request, ref: input.request.ref }
          expect(
            (yield* external
              .reserve({ ...conflicting, request, ...(yield* identifyRequest(request)) })
              .pipe(Effect.flip))._tag,
          ).toBe("generalist/runtime/ExternalChildPlacementConflict")
          expect(
            (yield* external
              .reserve({
                ...(yield* placement(claim, "placement:invocation-conflict")),
                invocationId: input.invocationId,
              })
              .pipe(Effect.flip))._tag,
          ).toBe("generalist/runtime/ExternalChildPlacementConflict")
          expect((yield* external.reserve(yield* placement(claim, "placement:2")).pipe(Effect.flip))._tag).toBe(
            "generalist/runtime/ExternalChildCapacityUnavailable",
          )
          expect((yield* external.acknowledge("placement:2").pipe(Effect.flip))._tag).toBe(
            "generalist/runtime/ExternalChildPlacementNotFound",
          )
        }),
      ),
    )

    it.live("accepts settlement before acknowledgement, exact settlement replay, and cancellation races", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-4",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          yield* external.reserve(yield* placement(claim, "placement:race"))
          const outcome = {
            _tag: "Succeeded" as const,
            result: completedResult("done"),
            eventId: "remote:event:1",
            occurredAt: "2026-08-19T00:00:00.000Z",
          }
          expect(
            yield* external.settle({
              placementId: "placement:race",
              settlementId: "settlement:1",
              outcome,
            }),
          ).toMatchObject({ settled: true, acknowledged: false })
          expect(yield* external.acknowledge("placement:race")).toMatchObject({
            acknowledged: true,
            settled: true,
          })
          expect(yield* external.acknowledge("placement:race")).toMatchObject({
            acknowledged: true,
            settled: true,
          })
          expect(
            yield* external.settle({
              placementId: "placement:race",
              settlementId: "settlement:1",
              outcome,
            }),
          ).toMatchObject({ settled: true })
          expect(
            yield* external
              .settle({
                placementId: "placement:race",
                settlementId: "settlement:1",
                outcome: { ...outcome, eventId: "remote:event:divergent" },
              })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/ExternalChildSettlementConflict", placementId: "placement:race" })
          expect(yield* external.cancel("placement:race")).toMatchObject({ cancelRequested: false })

          yield* external.reserve(yield* placement(claim, "placement:cancel"))
          expect(yield* external.cancel("placement:cancel")).toMatchObject({ cancelRequested: true })
          expect(
            yield* external.settle({
              placementId: "placement:cancel",
              settlementId: "settlement:cancel",
              outcome,
            }),
          ).toMatchObject({ settled: true, cancelRequested: true })
        }),
      ),
    )

    it.live("atomically suspends and resumes only the owned parent wait", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-5",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const input = {
            ...(yield* placement(claim, "placement:wait")),
            parentSuspension: {
              wait: {
                waitId: "external-wait",
                reason: { _tag: "External" as const, capability: "child-placement" },
                status: "open" as const,
                openedAt: "2026-08-19T00:00:00.000Z",
              },
              suspension: ProgramCapabilities.ProgramSuspended.make({
                operation: "externalChild",
                reason: "agent",
                token: "placement:wait",
              }),
            },
          }
          const reserved = yield* external.reserve(input)
          expect(reserved).toMatchObject({ waitId: "external-wait", settled: false })
          expect((yield* store.loadExecution(parent.runId)).suspension).toMatchObject({ token: "placement:wait" })

          const outcome = {
            _tag: "Succeeded" as const,
            result: completedResult("external result"),
            eventId: "remote:event:wait",
            occurredAt: "2026-08-19T00:00:00.000Z",
          }
          yield* external.settle({
            placementId: input.placementId,
            settlementId: "settlement:wait",
            outcome,
          })
          expect((yield* store.loadExecution(parent.runId)).resolutions[0]?.resolution).toMatchObject({
            _tag: "ToolResult",
            result: outcome,
          })
        }),
      ),
    )

    it.live("converges an ownerless cancelling parent after authoritative remote settlement", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-6",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          yield* external.reserve(yield* placement(claim, "placement:parent-cancel"))
          yield* store.cancel({
            commandId: "runtime-child-external-placement-test-ts-cancel-2",
            runId: parent.runId,
            reason: "caller cancelled",
          })
          expect(yield* external.cancel("placement:parent-cancel")).toMatchObject({
            cancelRequested: true,
            settled: false,
          })
          yield* store.releaseExecution(claim)
          expect(yield* store.inspect(parent.runId)).toMatchObject({ status: "cancelling" })
          yield* external.settle({
            placementId: "placement:parent-cancel",
            settlementId: "settlement:parent-cancel",
            outcome: {
              _tag: "Succeeded",
              result: completedResult("late authoritative result"),
              eventId: "remote:event:parent-cancel",
              occurredAt: "2026-08-19T00:00:00.000Z",
            },
          })
          expect(yield* store.inspect(parent.runId)).toMatchObject({ status: "cancelled" })
        }),
      ),
    )

    it.live("rejects a stale parent claim without reserving a placement", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore
          const parent = yield* root
          const first = yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-7",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const reserved = yield* placement(first, "placement:existing")
          yield* external.reserve(reserved)
          yield* store.releaseExecution(first)
          yield* store.claimExecution({
            commandId: "runtime-child-external-placement-test-ts-claim-8",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          expect(yield* external.reserve(reserved)).toMatchObject({ placementId: reserved.placementId })
          expect((yield* external.reserve(yield* placement(first, "placement:stale")).pipe(Effect.flip))._tag).toBe(
            "generalist/runtime/StaleClaim",
          )
          expect((yield* external.acknowledge("placement:stale").pipe(Effect.flip))._tag).toBe(
            "generalist/runtime/ExternalChildPlacementNotFound",
          )
        }),
      ),
    )
  })
}

suite("object", objectLayer)

it.live("recovers external root identity and unacknowledged terminal delivery after object-host reopen", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  }
  return Effect.gen(function* () {
    const input = yield* externalRoot("object:reopen")
    const settlementId = yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        const external = yield* ExternalChildStore
        yield* external.admitRoot(input)
        yield* external.cancelRoot(input.placementId, "reopen")
        const settlement = yield* external.rootSettlement(input.placementId)
        if (Option.isNone(settlement)) return yield* Effect.die("cancelled external root has no settlement")
        return settlement.value.settlementId
      }),
    )
    yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        const external = yield* ExternalChildStore
        expect(yield* external.inspectRoot(input.placementId)).toMatchObject({
          parent: input.parent,
          ref: input.ref,
          sessionId: input.root.message.sessionId,
          activated: false,
          outcome: { _tag: "Cancelled", eventId: settlementId },
        })
        expect(yield* external.rootSettlement(input.placementId)).toMatchObject({
          value: { settlementId, acknowledged: false },
        })
      }),
    )
  })
})
