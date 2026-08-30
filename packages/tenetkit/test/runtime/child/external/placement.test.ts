import { Database } from "bun:sqlite"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { ProgramCapabilities } from "../../../../src/index.js"
import {
  Address,
  ExternalChildPlacement,
  ExternalChildStore,
  Message,
  Runtime,
  RunStore,
  ExecutableResolver,
} from "../../../../src/runtime/index.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import type { ExecutionClaim } from "../../../../src/runtime/run/store.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  memoryLayer,
  registrationsFor,
  textPrompt,
} from "../../execution/fixtures.js"
import { closedTestAgent } from "../../run/identity.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { sqliteLayer, tempDbPath } from "../../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
const externalRoot = (id: string) => ({
  placementId: `placement:${id}`,
  parent: { partition: "openwork:parent", runId: `parent:${id}` },
  ref: { partition: "openwork:child", runId: `child:${id}` },
  requestDigest: `request:${id}`,
  executableDigest: ExternalChildPlacement.executableDigest(assistantRef),
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
})

const suite = <E>(
  name: string,
  layer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | ExternalChildStore.ExternalChildStore, E>,
) => {
  let sequence = 0
  const provide = <A, Failure>(
    effect: Effect.Effect<A, Failure, Runtime.Runtime | RunStore.RunStore | ExternalChildStore.ExternalChildStore>,
  ) => provideScoped(layer, effect)
  const placement = (claim: ExecutionClaim, placementId: string) => ({
    ...claim,
    placementId,
    ref: { partition: "openwork:west", runId: `remote:${placementId}` },
    invocationId: `invoke:${placementId}`,
    requestDigest: `request:${placementId}`,
    executableDigest: "executable:v1",
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const input = externalRoot(`${name}:gate`)
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
            (yield* store.claimExecution({ runId: input.ref.runId, ownerId: "too-early" }).pipe(Effect.flip))._tag,
          ).toBe("tenetkit/runtime/RuntimeUnavailable")
          expect(yield* external.admitRoot(input)).toMatchObject({ activated: false })
          expect(
            (yield* external.admitRoot({ ...input, requestDigest: `${input.requestDigest}:changed` }).pipe(Effect.flip))
              ._tag,
          ).toBe("@tenetkit/runtime/ExternalRootConflict")
          expect(
            (yield* external
              .admitRoot({ ...externalRoot(`${name}:digest-mismatch`), executableDigest: "wrong" })
              .pipe(Effect.flip))._tag,
          ).toBe("@tenetkit/runtime/ExternalRootExecutableMismatch")
          expect(yield* external.activateRoot(input.placementId)).toMatchObject({ activated: true })
          expect(yield* external.activateRoot(input.placementId)).toMatchObject({ activated: true })
          const history = yield* store.history({ runId: input.ref.runId, cursor: -1, limit: 20 })
          expect(history.filter((event) => event._tag === "RunAttemptStarted")).toHaveLength(1)
          const claim = yield* store.claimExecution({ runId: input.ref.runId, ownerId: "child-worker" })
          yield* store.complete({ ...claim, result: completedResult("delegated result") })
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const input = externalRoot(`${name}:cancel-before-activation`)
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
            (yield* external
              .acknowledgeRootSettlement({ placementId: input.placementId, settlementId: "wrong" })
              .pipe(Effect.flip))._tag,
          ).toBe("@tenetkit/runtime/ExternalChildSettlementConflict")
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-test" })
          const input = placement(claim, "placement:1")
          expect(yield* external.reserve(input)).toMatchObject({
            placementId: input.placementId,
            parentRunId: input.runId,
            ref: input.ref,
            invocationId: input.invocationId,
            requestDigest: input.requestDigest,
            executableDigest: input.executableDigest,
            settled: false,
          })
          expect(yield* external.reserve(input)).toMatchObject({ placementId: input.placementId })
          expect((yield* external.reserve({ ...input, requestDigest: "different" }).pipe(Effect.flip))._tag).toBe(
            "@tenetkit/runtime/ExternalChildPlacementConflict",
          )
          expect(
            (yield* external
              .reserve({ ...placement(claim, "placement:ref-conflict"), ref: input.ref })
              .pipe(Effect.flip))._tag,
          ).toBe("@tenetkit/runtime/ExternalChildPlacementConflict")
          expect(
            (yield* external
              .reserve({ ...placement(claim, "placement:invocation-conflict"), invocationId: input.invocationId })
              .pipe(Effect.flip))._tag,
          ).toBe("@tenetkit/runtime/ExternalChildPlacementConflict")
          expect((yield* external.reserve(placement(claim, "placement:2")).pipe(Effect.flip))._tag).toBe(
            "@tenetkit/runtime/ExternalChildCapacityUnavailable",
          )
          expect((yield* external.acknowledge("placement:2").pipe(Effect.flip))._tag).toBe(
            "@tenetkit/runtime/ExternalChildPlacementNotFound",
          )
        }),
      ),
    )

    it.live("accepts settlement before acknowledgement, exact settlement replay, and cancellation races", () =>
      provide(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const external = yield* ExternalChildStore.ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-test" })
          yield* external.reserve(placement(claim, "placement:race"))
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
            (yield* external
              .settle({
                placementId: "placement:race",
                settlementId: "settlement:1",
                outcome: { ...outcome, eventId: "remote:event:divergent" },
              })
              .pipe(Effect.flip))._tag,
          ).toBe("@tenetkit/runtime/ExternalChildSettlementConflict")
          expect(yield* external.cancel("placement:race")).toMatchObject({ cancelRequested: false })

          yield* external.reserve(placement(claim, "placement:cancel"))
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-test" })
          const input = {
            ...placement(claim, "placement:wait"),
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const parent = yield* root
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-test" })
          yield* external.reserve(placement(claim, "placement:parent-cancel"))
          yield* store.cancel({ runId: parent.runId, reason: "caller cancelled" })
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
          const external = yield* ExternalChildStore.ExternalChildStore
          const parent = yield* root
          const first = yield* store.claimExecution({ runId: parent.runId, ownerId: "old-owner" })
          const reserved = placement(first, "placement:existing")
          yield* external.reserve(reserved)
          yield* store.claimExecution({ runId: parent.runId, ownerId: "new-owner" })
          expect(yield* external.reserve(reserved)).toMatchObject({ placementId: reserved.placementId })
          expect((yield* external.reserve(placement(first, "placement:stale")).pipe(Effect.flip))._tag).toBe(
            "tenetkit/runtime/StaleClaim",
          )
          expect((yield* external.acknowledge("placement:stale").pipe(Effect.flip))._tag).toBe(
            "@tenetkit/runtime/ExternalChildPlacementNotFound",
          )
        }),
      ),
    )
  })
}

suite("memory", memoryLayer)
suite("sqlite", sqliteLayer(tempDbPath("external-child-placement")))

it.live("recovers external root identity and unacknowledged terminal delivery after SQLite reopen", () => {
  const filename = tempDbPath("external-root-reopen")
  const input = externalRoot("sqlite:reopen")
  return Effect.gen(function* () {
    const settlementId = yield* provideScoped(
      sqliteLayer(filename),
      Effect.gen(function* () {
        const external = yield* ExternalChildStore.ExternalChildStore
        yield* external.admitRoot(input)
        yield* external.cancelRoot(input.placementId, "reopen")
        const settlement = yield* external.rootSettlement(input.placementId)
        if (Option.isNone(settlement)) return yield* Effect.die("cancelled external root has no settlement")
        return settlement.value.settlementId
      }),
    )
    yield* provideScoped(
      sqliteLayer(filename),
      Effect.gen(function* () {
        const external = yield* ExternalChildStore.ExternalChildStore
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

it.live("rolls back reservation and projects settlement-driven cancellation in SQLite transactions", () => {
  let rejectProjection = false
  const projected: Array<{ readonly runId: string; readonly intent: string }> = []
  const layer = SqliteRuntime.layerSqlite({
    filename: tempDbPath("external-child-rollback"),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    subscriberQueueCapacity: 8,
    activationProjection: {
      applyInTransaction: (changes) =>
        rejectProjection
          ? RuntimeUnavailable.make({ message: "forced projection rollback" })
          : Effect.sync(() => void projected.push(...changes)),
    },
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
        Layer.orDie,
      ),
    ),
  )
  return provideScoped(
    layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const external = yield* ExternalChildStore.ExternalChildStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "external-rollback",
        idempotencyKey: "external-rollback",
        prompt: textPrompt("rollback parent"),
      })
      const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-rollback" })
      const input = {
        ...claim,
        placementId: "placement:rollback",
        ref: { partition: "openwork:west", runId: "remote:rollback" },
        invocationId: "invoke:rollback",
        requestDigest: "request:rollback",
        executableDigest: "executable:v1",
        parentSuspension: {
          wait: {
            waitId: "wait:rollback",
            reason: { _tag: "External" as const },
            status: "open" as const,
            openedAt: "2026-08-19T00:00:00.000Z",
          },
          suspension: ProgramCapabilities.ProgramSuspended.make({
            operation: "externalChild",
            reason: "agent",
            token: "placement:rollback",
          }),
        },
      }
      rejectProjection = true
      expect((yield* external.reserve(input).pipe(Effect.flip))._tag).toBe("tenetkit/runtime/RuntimeUnavailable")
      rejectProjection = false
      expect((yield* external.acknowledge(input.placementId).pipe(Effect.flip))._tag).toBe(
        "@tenetkit/runtime/ExternalChildPlacementNotFound",
      )
      expect((yield* store.loadExecution(parent.runId)).suspension).toBeUndefined()
      expect(yield* external.reserve(input)).toMatchObject({
        placementId: input.placementId,
        waitId: input.parentSuspension.wait.waitId,
      })
      yield* store.cancel({ runId: parent.runId, reason: "cancel external parent" })
      yield* store.releaseExecution(claim)
      projected.length = 0
      yield* external.settle({
        placementId: input.placementId,
        settlementId: "settlement:rollback",
        outcome: {
          _tag: "Succeeded",
          result: completedResult("late authoritative result"),
          eventId: "remote:event:rollback",
          occurredAt: "2026-08-19T00:00:00.000Z",
        },
      })
      expect(yield* store.inspect(parent.runId)).toMatchObject({ status: "cancelled" })
      expect(projected).toContainEqual({ runId: parent.runId, intent: "inactive" })
    }),
  )
})

it.live("decodes legacy TEXT true external-child cancellation rows in SQLite", () => {
  const filename = tempDbPath("external-child-legacy-cancellation")
  return provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const external = yield* ExternalChildStore.ExternalChildStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "external-legacy-cancellation",
        idempotencyKey: "external-legacy-cancellation",
        prompt: textPrompt("external legacy cancellation"),
        treePolicy: { maxDepth: 2, maxSubagents: 1 },
      })
      const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "external-legacy-cancellation" })
      const input = {
        ...claim,
        placementId: "placement:legacy-cancellation",
        ref: { partition: "openwork:west", runId: "remote:legacy-cancellation" },
        invocationId: "invoke:legacy-cancellation",
        requestDigest: "request:legacy-cancellation",
        executableDigest: "executable:v1",
      }
      yield* external.reserve(input)
      const db = new Database(filename)
      db.run("UPDATE tenetkit_external_child_placements SET cancel_requested = 'true' WHERE placement_id = ?", [
        input.placementId,
      ])
      db.close()
      expect(yield* external.reserve(input)).toMatchObject({ cancelRequested: true })
    }),
  )
})
