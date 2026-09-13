import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "./object.js"
import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Pins } from "../../../src/index.js"
import { Approval, ExecutableResolver } from "../../../src/runtime/index.js"
import * as Runtime from "../../../src/runtime/engine.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../src/runtime/execution/run-executor.js"
import { LocalScheduler } from "../../../src/runtime/execution/local-scheduler.js"
import { registrationsFor } from "./fixtures.js"
import {
  agentMapProgramFixture,
  approvalProgramFixture,
  executeProgramFixture,
  program,
  programAddress,
  programExecutable,
  programFixture,
} from "../program/fixture.js"
import { programReplayDivergenceContract } from "../program/store-contract.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

describe("durable Agent Programs", () => {
  it.effect("rejects Program replay divergence without changing the journal", () => {
    const fixture = programFixture()
    const options = {
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }
    return scopedWith(objectRuntimeLayer(options).pipe(Layer.provide(fixture.resolverLayer)))(
      programReplayDivergenceContract,
    )
  })

  it.effect("rejects a live Program whose manifest differs from its claimed pin", () =>
    Effect.gen(function* () {
      const { resolverLayer: _resolverLayer, ...fixtureState } = programFixture()
      const forged = {
        ...program,
        pinned: {
          ...program.pinned,
          manifest: { ...program.pinned.manifest, name: "forged-program" },
        },
      }

      const failure = yield* ExecutableResolver.makeStatic([
        {
          _tag: "Program",
          executable: programExecutable,
          program: forged,
          executor: fixtureState.executor,
          handlers: fixtureState.handlers,
        },
      ]).pipe(Effect.flip)
      expect(failure.message).toMatch(/does not match/)
    }),
  )

  const dispatchFixture = programFixture()
  layer(
    objectRuntimeLayer({
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }).pipe(Layer.provide(dispatchFixture.resolverLayer)),
  )("dispatches Programs and replays named tool and log operations in object storage", (suite) => {
    suite.effect("dispatches and replays named operations", () =>
      Effect.gen(function* () {
        const runId = yield* executeProgramFixture
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
        expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
          kind: "tool",
          status: "succeeded",
        })
        expect(yield* store.getProgramOperation({ runId, operation: "summary" })).toMatchObject({
          kind: "log",
          status: "succeeded",
        })
        expect((yield* runtime.history({ runId, limit: 100 })).filter((event) => event._tag === "ProgramLog")).toEqual([
          expect.objectContaining({ operation: "summary", level: "info", message: "finished" }),
        ])
        expect(dispatchFixture.counts()).toEqual({ toolCalls: 1, logs: 1 })
      }),
    )
  })

  const approvalFixture = approvalProgramFixture()
  layer(
    objectRuntimeLayer({
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }).pipe(Layer.provide(approvalFixture.resolverLayer)),
  )("authorizes before dispatch and resumes the exact approved operation once", (suite) => {
    suite.effect("authorizes once and resumes exactly", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const host = yield* RunExecutor
        const receipt = yield* runtime.send({
          to: programAddress,
          sessionId: "approval-session",
          idempotencyKey: "approval-run",
          prompt: "run",
        })
        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-execution-execute-program-test-ts-claim-1",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          }),
        )
        const waiting = (yield* runtime.inspect(receipt.runId)).waits[0]
        expect(waiting).toMatchObject({
          waitId: "approval:echo",
          reason: {
            _tag: "Approval",
            request: { approvalId: "approval:echo", operation: "echo", capability: "echo" },
          },
        })
        expect(approvalFixture.counts()).toEqual({ authorizations: 1, executions: 0, sandboxes: 1 })
        const wrong = yield* runtime
          .respondApproval({
            runId: receipt.runId,
            approvalId: "approval:other",
            commandId: "approval:other",
            decision: { _tag: "Approved" },
          })
          .pipe(Effect.flip)
        expect(wrong._tag).toBe("generalist/runtime/ApprovalMismatch")
        yield* Approval.approve({
          runId: receipt.runId,
          approvalId: "approval:echo",
          commandId: "approval:echo:helper",
        })
        yield* runtime.respondApproval({
          runId: receipt.runId,
          approvalId: "approval:echo",
          commandId: "approval:echo:helper",
          decision: { _tag: "Approved" },
        })
        const conflict = yield* runtime
          .respondApproval({
            runId: receipt.runId,
            approvalId: "approval:echo",
            commandId: "approval:echo:conflict",
            decision: { _tag: "Denied" },
          })
          .pipe(Effect.flip)
        expect(conflict._tag).toBe("generalist/runtime/ApprovalMismatch")
        expect(yield* runtime.history({ runId: receipt.runId, limit: 100 })).toContainEqual(
          expect.objectContaining({
            _tag: "RunResumed",
            waitId: "approval:echo",
            resolution: { _tag: "Approved" },
          }),
        )
        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-execution-execute-program-test-ts-claim-2",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          }),
        )
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
        const stale = yield* runtime
          .respondApproval({
            runId: receipt.runId,
            approvalId: "approval:stale",
            commandId: "approval:stale",
            decision: { _tag: "Approved" },
          })
          .pipe(Effect.flip)
        expect(stale._tag).toBe("generalist/runtime/ApprovalStale")
        expect(approvalFixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
      }),
    )
  })

  it.live("reopens object storage between Program approval and exact resumed dispatch", () => {
    const storage = makeObjectStorage()
    const fixture = approvalProgramFixture()
    let runId = ""
    const options = {
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    const suspend = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const host = yield* RunExecutor
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "approval-reopen-session",
        idempotencyKey: "approval-reopen-run",
        prompt: "run",
      })
      runId = receipt.runId
      yield* host.execute(
        yield* store.claimExecution({
          commandId: "runtime-execution-execute-program-test-ts-claim-3",
          runId,
          ownerId: objectWorkerId,
        }),
      )
      expect((yield* runtime.inspect(runId)).waits[0]).toMatchObject({
        reason: {
          _tag: "Approval",
          request: { approvalId: "approval:echo", operation: "echo", capability: "echo" },
        },
      })
      expect(fixture.counts()).toEqual({ authorizations: 1, executions: 0, sandboxes: 1 })
    })
    const resume = Effect.suspend(() =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const host = yield* RunExecutor
        expect((yield* runtime.inspect(runId)).waits[0]).toMatchObject({
          status: "open",
          reason: {
            _tag: "Approval",
            request: { approvalId: "approval:echo", operation: "echo", capability: "echo" },
          },
        })
        yield* Approval.approve({ runId, approvalId: "approval:echo", commandId: "approval:echo:helper" })
        expect(yield* store.loadExecution(runId)).toMatchObject({
          suspension: { operation: "echo", reason: "approval" },
          resolutions: [{ waitId: "approval:echo", resolution: { _tag: "Approved" } }],
        })
        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-execution-execute-program-test-ts-claim-4",
            runId,
            ownerId: objectWorkerId,
          }),
        )
        expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
        expect(fixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
      }),
    )
    return Effect.gen(function* () {
      yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(fixture.resolverLayer)))(suspend)
      yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(fixture.resolverLayer)))(resume)
    })
  })

  it.effect("settles denied approval without dispatch and cancels a waiting Program without stranded slots", () => {
    const denied = approvalProgramFixture()
    const cancelled = approvalProgramFixture()
    const run = (fixture: ReturnType<typeof approvalProgramFixture>, resolution: "Denied" | "Cancel") =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const host = yield* RunExecutor
        const receipt = yield* runtime.send({
          to: programAddress,
          sessionId: `program-${resolution}`,
          idempotencyKey: `program-${resolution}`,
          prompt: "run",
        })
        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-execution-execute-program-test-ts-claim-5",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          }),
        )
        if (resolution === "Denied") {
          yield* Approval.deny({
            runId: receipt.runId,
            approvalId: "approval:echo",
            commandId: "approval:echo:deny",
            reason: "operator denied",
          })
          yield* host.execute(
            yield* store.claimExecution({
              commandId: "runtime-execution-execute-program-test-ts-claim-6",
              runId: receipt.runId,
              ownerId: objectWorkerId,
            }),
          )
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
        } else {
          yield* runtime.cancel({
            commandId: "runtime-execution-execute-program-test-ts-cancel-1",
            runId: receipt.runId,
            reason: "operator cancelled",
          })
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "cancelled", waits: [] })
        }
        expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
          status: "failed",
        })
        expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
        expect(fixture.counts().executions).toBe(0)
      })
    const layerFor = (fixture: ReturnType<typeof approvalProgramFixture>) =>
      objectRuntimeLayer({
        addresses: [
          {
            address: programAddress,
            executable: programExecutable,
            registrations: registrationsFor(programExecutable),
          },
        ],
      }).pipe(Layer.provide(fixture.resolverLayer))
    return Effect.gen(function* () {
      yield* scopedWith(layerFor(denied))(run(denied, "Denied"))
      yield* scopedWith(layerFor(cancelled))(run(cancelled, "Cancel"))
    })
  })

  it.live("reopens object storage with the Program result and operation journal intact", () => {
    const storage = makeObjectStorage()
    const first = programFixture()
    let runId = ""
    const write = Effect.gen(function* () {
      runId = yield* executeProgramFixture
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      expect((yield* runtime.snapshot(runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: "value:1|value:1" },
      })
      expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
        status: "succeeded",
        result: "value:1",
      })
    })
    const options = {
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }
    return Effect.gen(function* () {
      yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(first.resolverLayer)))(write)
      const reopened = programFixture()
      yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(reopened.resolverLayer)))(reopen)
    })
  })

  it.live("resolves a crashed non-idempotent Program operation without redispatch", () => {
    const verify = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const host = yield* RunExecutor
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "program-unknown",
        idempotencyKey: "program-unknown",
        prompt: "run",
      })
      const claim = yield* store.claimExecution({
        commandId: "runtime-execution-execute-program-test-ts-claim-7",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      const request = { operation: "echo", tool: "echo", input: "value" }
      yield* store.reserveProgramOperation({
        ...claim,
        programPin: program.pinned.pin,
        budget: program.pinned.manifest.budget,
        operation: "echo",
        authoredOperation: "echo",
        kind: "tool",
        capability: "echo",
        inputDigest: Pins.digest({ kind: "tool", capability: "echo", input: request }),
        input: request,
        replay: "non-idempotent",
        reservation: { toolCalls: 1, activeSlots: 1 },
      })
      yield* store.startProgramOperation({ ...claim, operation: "echo" })
      yield* host.execute(claim)
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
        status: "unknown",
      })
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: "echo",
        idempotencyKey: "program-resolution",
        resolution: { _tag: "Succeeded", value: "recovered" },
      })
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: "echo",
        idempotencyKey: "program-resolution",
        resolution: { _tag: "Succeeded", value: "recovered" },
      })
      expect(
        yield* Effect.flip(
          runtime.resolveOperation({
            runId: receipt.runId,
            operationId: "echo",
            idempotencyKey: "program-resolution:changed",
            resolution: { _tag: "Failed", error: "changed" },
          }),
        ),
      ).toMatchObject({ _tag: "generalist/runtime/OperationResolutionConflict" })
      yield* host.execute(
        yield* store.claimExecution({
          commandId: "runtime-execution-execute-program-test-ts-claim-8",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: "recovered|recovered" },
      })
    })
    const fixture = programFixture()
    return scopedWith(
      objectRuntimeLayer({
        addresses: [
          {
            address: programAddress,
            executable: programExecutable,
            registrations: registrationsFor(programExecutable),
          },
        ],
      }).pipe(Layer.provide(fixture.resolverLayer)),
    )(verify)
  })

  it.live(
    "recovers ordered Agent maps and cancels admitted Program child trees",
    () => {
      const fixture = agentMapProgramFixture()
      const mapAddress = fixture.address
      const executeReady = Effect.gen(function* () {
        const scheduler = yield* LocalScheduler
        yield* scheduler.tick
        yield* scheduler.idle
      })
      const admit = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const receipt = yield* runtime.send({
          to: mapAddress,
          sessionId: "program-map",
          idempotencyKey: "program-map",
          prompt: "run",
        })
        yield* executeReady
        const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
        expect(admitted?.status).toBe("waiting")
        return receipt.runId
      })
      const finishRun = (runId: string, finalizersBefore: number) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore
          const admitted = yield* store.getProgramOperation({ runId, operation: "workers" })
          const childRunIds = admitted?.childRunIds ?? []
          expect(childRunIds).toHaveLength(3)
          yield* executeReady
          expect(fixture.counts().childFinalizers).toBe(finalizersBefore + 2)
          expect((yield* runtime.inspect(childRunIds[0]!)).status).toBe("succeeded")
          expect((yield* runtime.inspect(childRunIds[1]!)).status).toBe("succeeded")
          expect((yield* runtime.inspect(childRunIds[2]!)).status).toBe("queued")
          yield* executeReady
          expect(fixture.counts().childFinalizers).toBe(finalizersBefore + 3)
          expect((yield* runtime.inspect(childRunIds[2]!)).status).toBe("succeeded")
          yield* executeReady
          expect((yield* runtime.snapshot(runId)).outcome).toMatchObject({
            _tag: "Succeeded",
            result: { _tag: "Program", value: ["third:child", "first:child", "second:child"] },
          })
          const operation = yield* store.getProgramOperation({ runId, operation: "workers" })
          expect(operation?.childRunIds).toHaveLength(3)
          expect(operation?.status).toBe("succeeded")
          expect(fixture.counts().bindingDispatches).toBe(0)
          expect(fixture.counts().childFinalizers).toBe(finalizersBefore + 3)
        })
      const options = {
        addresses: [
          { address: mapAddress, executable: fixture.executable, registrations: registrationsFor(fixture.executable) },
        ],
        scheduler: { pollInterval: "1 day" as const },
      }
      const storage = makeObjectStorage()
      let objectRunId = ""
      let objectFinalizersBefore = 0
      const objectAdmit = Effect.gen(function* () {
        objectFinalizersBefore = fixture.counts().childFinalizers
        objectRunId = yield* admit
      })
      const objectReopen = Effect.suspend(() => finishRun(objectRunId, objectFinalizersBefore))
      const cancelAdmitted = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        const receipt = yield* runtime.send({
          to: mapAddress,
          sessionId: "program-map-cancel",
          idempotencyKey: "program-map-cancel",
          prompt: "run",
        })
        yield* executeReady
        const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
        yield* runtime.cancel({
          commandId: "runtime-execution-execute-program-test-ts-cancel-2",
          runId: receipt.runId,
          reason: "cancel admitted Program tree",
        })
        expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "cancelled", waits: [] })
        for (const childRunId of admitted?.childRunIds ?? []) {
          expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
        }
        expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })).toMatchObject({
          status: "failed",
        })
        expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
      })
      return Effect.gen(function* () {
        yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(fixture.resolverLayer)))(objectAdmit)
        yield* scopedWith(objectRuntimeLayer(options, storage).pipe(Layer.provide(fixture.resolverLayer)))(objectReopen)
        yield* scopedWith(objectRuntimeLayer(options).pipe(Layer.provide(fixture.resolverLayer)))(cancelAdmitted)
      })
    },
    15_000,
  )
})
