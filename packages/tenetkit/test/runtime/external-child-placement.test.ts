import { Database } from "bun:sqlite"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ProgramCapabilities } from "tenetkit"
import { ExternalChildStore, Runtime, RunStore } from "../../src/runtime/index.js"
import { RuntimeUnavailable } from "../../src/runtime/errors.js"
import { ExecutableResolver } from "../../src/runtime/index.js"
import { assistant, assistantRef, completedResult, memoryLayer, registrationsFor, textPrompt } from "./helpers.js"
import { assistantAddress } from "./helpers.js"
import { closedTestAgent } from "./identity.js"
import { provideScoped } from "./scoped-provide.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const suite = <E>(
  name: string,
  layer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | ExternalChildStore.ExternalChildStore, E>,
) => {
  let sequence = 0
  const provide = <A, Failure>(
    effect: Effect.Effect<A, Failure, Runtime.Runtime | RunStore.RunStore | ExternalChildStore.ExternalChildStore>,
  ) => provideScoped(layer, effect)
  const placement = (
    claim: { readonly runId: string; readonly ownerId: string; readonly attemptFence: number },
    placementId: string,
  ) => ({
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
          expect((yield* store.loadExecution(parent.runId)).resolution).toMatchObject({
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

it.live("rolls back reservation and projects settlement-driven cancellation in SQLite transactions", () => {
  let rejectProjection = false
  const projected: Array<{ readonly runId: string; readonly intent: string }> = []
  const layer = Runtime.layerSqlite({
    filename: tempDbPath("external-child-rollback"),
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    subscriberQueueCapacity: 8,
    activationProjection: {
      applyInTransaction: (changes) =>
        rejectProjection
          ? RuntimeUnavailable.make({ message: "forced projection rollback" })
          : Effect.sync(() => void projected.push(...changes)),
    },
  })
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
