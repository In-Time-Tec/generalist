import { describe, expect, it, layer } from "@effect/vitest"
import { Clock, Effect, Layer } from "effect"
import { Pins } from "@batonfx/core"
import { Approval, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import { registrationsFor } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"
import {
  agentMapProgramFixture,
  approvalProgramFixture,
  executeProgramFixture,
  program,
  programAddress,
  programExecutable,
  programFixture,
} from "./program-fixture.js"
import { programReplayDivergenceContract } from "./program-store-contract.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

describe("durable Agent Programs", () => {
  it.effect("rejects Program replay divergence in memory and SQLite without changing the journal", () => {
    const memory = programFixture()
    const sqlite = programFixture()
    const options = (resolver: typeof memory.resolver) => ({
      resolver,
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    })
    return Effect.gen(function* () {
      yield* scopedWith(Runtime.layerMemory(options(memory.resolver)))(programReplayDivergenceContract)
      yield* scopedWith(
        Runtime.layerSqlite({
          ...options(sqlite.resolver),
          filename: tempDbPath("program-replay-divergence"),
        }),
      )(programReplayDivergenceContract)
    })
  })

  it("rejects a live Program whose manifest differs from its claimed pin", () => {
    const { resolver: _resolver, ...fixtureState } = programFixture()
    const forged = {
      ...program,
      pinned: {
        ...program.pinned,
        manifest: { ...program.pinned.manifest, name: "forged-program" },
      },
    }

    expect(() =>
      ExecutableResolver.makeStatic([
        {
          _tag: "Program",
          executable: programExecutable,
          program: forged,
          sandbox: fixtureState.sandbox,
          bindings: fixtureState.bindings,
        },
      ]),
    ).toThrow(/does not match/)
  })

  const dispatchFixture = programFixture()
  layer(
    Runtime.layerMemory({
      resolver: dispatchFixture.resolver,
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }),
  )("dispatches Programs and replays named tool and log operations in memory", (suite) => {
    suite.effect("dispatches and replays named operations", () =>
      Effect.gen(function* () {
        const runId = yield* executeProgramFixture
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
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
    Runtime.layerMemory({
      resolver: approvalFixture.resolver,
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    }),
  )("authorizes before dispatch and resumes the exact approved operation once", (suite) => {
    suite.effect("authorizes once and resumes exactly", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = yield* runtime.send({
          to: programAddress,
          sessionId: "approval-session",
          idempotencyKey: "approval-run",
          prompt: "run",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-worker" }))
        const waiting = (yield* runtime.inspect(receipt.runId)).wait
        expect(waiting).toMatchObject({
          waitId: "approval:echo",
          reason: {
            _tag: "Approval",
            request: { approvalId: "approval:echo", operation: "echo", capability: "echo" },
          },
        })
        expect(approvalFixture.counts()).toEqual({ authorizations: 1, executions: 0, sandboxes: 1 })
        const wrong = yield* runtime
          .respondApproval({ runId: receipt.runId, approvalId: "approval:other", decision: { _tag: "Approved" } })
          .pipe(Effect.flip)
        expect(wrong._tag).toBe("@batonfx/runtime/ApprovalMismatch")
        yield* Approval.approve({ runId: receipt.runId, approvalId: "approval:echo" })
        yield* runtime.respondApproval({
          runId: receipt.runId,
          approvalId: "approval:echo",
          decision: { _tag: "Approved" },
        })
        const conflict = yield* runtime
          .respondApproval({ runId: receipt.runId, approvalId: "approval:echo", decision: { _tag: "Denied" } })
          .pipe(Effect.flip)
        expect(conflict._tag).toBe("@batonfx/runtime/ApprovalMismatch")
        expect(yield* runtime.history({ runId: receipt.runId, limit: 100 })).toContainEqual(
          expect.objectContaining({
            _tag: "RunResumed",
            waitId: "approval:echo",
            resolution: { _tag: "Approved" },
          }),
        )
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-worker" }))
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
        const stale = yield* runtime
          .respondApproval({ runId: receipt.runId, approvalId: "approval:stale", decision: { _tag: "Approved" } })
          .pipe(Effect.flip)
        expect(stale._tag).toBe("@batonfx/runtime/ApprovalStale")
        expect(approvalFixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
      }),
    )
  })

  it.live("reopens SQLite between Program approval and exact resumed dispatch", () => {
    const filename = tempDbPath("program-approval-reopen")
    const fixture = approvalProgramFixture()
    let runId = ""
    const options = {
      filename,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    const suspend = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "approval-reopen-session",
        idempotencyKey: "approval-reopen-run",
        prompt: "run",
      })
      runId = receipt.runId
      yield* host.execute(yield* store.claimExecution({ runId, ownerId: "approval-before-reopen" }))
      expect((yield* runtime.inspect(runId)).wait).toMatchObject({
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
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        expect((yield* runtime.inspect(runId)).wait).toMatchObject({
          status: "open",
          reason: {
            _tag: "Approval",
            request: { approvalId: "approval:echo", operation: "echo", capability: "echo" },
          },
        })
        yield* Approval.approve({ runId, approvalId: "approval:echo" })
        expect(yield* store.loadExecution(runId)).toMatchObject({
          suspension: { operation: "echo", reason: "approval" },
          resolution: { _tag: "Approved" },
        })
        yield* host.execute(yield* store.claimExecution({ runId, ownerId: "approval-after-reopen" }))
        expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
        expect(fixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
      }),
    )
    return Effect.gen(function* () {
      yield* scopedWith(Runtime.layerSqlite(options))(suspend)
      yield* scopedWith(Runtime.layerSqlite(options))(resume)
    })
  })

  it.effect("settles denied approval without dispatch and cancels a waiting Program without stranded slots", () => {
    const denied = approvalProgramFixture()
    const cancelled = approvalProgramFixture()
    const run = (fixture: ReturnType<typeof approvalProgramFixture>, resolution: "Denied" | "Cancel") =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = yield* runtime.send({
          to: programAddress,
          sessionId: `program-${resolution}`,
          idempotencyKey: `program-${resolution}`,
          prompt: "run",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: `program-${resolution}` }))
        if (resolution === "Denied") {
          yield* Approval.deny({
            runId: receipt.runId,
            approvalId: "approval:echo",
            reason: "operator denied",
          })
          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-denied-resume" }))
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
        } else {
          yield* runtime.cancel({ runId: receipt.runId, reason: "operator cancelled" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect((yield* runtime.inspect(receipt.runId)).wait?.status).toBe("cancelled")
        }
        expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
          status: "failed",
        })
        expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
        expect(fixture.counts().executions).toBe(0)
      })
    const layerFor = (fixture: ReturnType<typeof approvalProgramFixture>, sqliteName?: string) =>
      sqliteName === undefined
        ? Runtime.layerMemory({
            resolver: fixture.resolver,
            addresses: [
              {
                address: programAddress,
                executable: programExecutable,
                registrations: registrationsFor(programExecutable),
              },
            ],
          })
        : Runtime.layerSqlite({
            filename: tempDbPath(sqliteName),
            resolver: fixture.resolver,
            addresses: [
              {
                address: programAddress,
                executable: programExecutable,
                registrations: registrationsFor(programExecutable),
              },
            ],
          })
    return Effect.gen(function* () {
      yield* scopedWith(layerFor(denied))(run(denied, "Denied"))
      yield* scopedWith(layerFor(cancelled))(run(cancelled, "Cancel"))
      yield* scopedWith(layerFor(approvalProgramFixture(), "program-denied"))(run(approvalProgramFixture(), "Denied"))
      yield* scopedWith(layerFor(approvalProgramFixture(), "program-cancelled"))(
        run(approvalProgramFixture(), "Cancel"),
      )
    })
  })

  it.live("reopens SQLite with the Program result and operation journal intact", () => {
    const filename = tempDbPath("program-runtime-reopen")
    const first = programFixture()
    let runId = ""
    const write = Effect.gen(function* () {
      runId = yield* executeProgramFixture
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      expect((yield* runtime.snapshot(runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: "value:1|value:1" },
      })
      expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
        status: "succeeded",
        result: "value:1",
      })
    })
    return Effect.gen(function* () {
      yield* scopedWith(
        Runtime.layerSqlite({
          filename,
          resolver: first.resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      )(write)
      yield* scopedWith(
        Runtime.layerSqlite({
          filename,
          resolver: programFixture().resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      )(reopen)
    })
  })

  it.live("resolves a crashed non-idempotent Program operation without redispatch", () => {
    const verify = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "program-unknown",
        idempotencyKey: "program-unknown",
        prompt: "run",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-crash" })
      const request = { operation: "echo", tool: "echo", input: "value" }
      yield* store.reserveProgramOperation({
        ...claim,
        programPin: program.pinned.pin,
        budget: program.pinned.manifest.budget,
        nowMillis: yield* Clock.currentTimeMillis,
        operation: "echo",
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
            idempotencyKey: "program-resolution",
            resolution: { _tag: "Failed", error: "changed" },
          }),
        ),
      ).toMatchObject({ _tag: "@batonfx/runtime/OperationResolutionConflict" })
      yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-recovery" }))
      expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: "recovered|recovered" },
      })
    })
    const memory = programFixture()
    const sqlite = programFixture()
    return Effect.gen(function* () {
      yield* scopedWith(
        Runtime.layerMemory({
          resolver: memory.resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      )(verify)
      yield* scopedWith(
        Runtime.layerSqlite({
          filename: tempDbPath("program-unknown"),
          resolver: sqlite.resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      )(verify)
    })
  })

  it.live(
    "recovers ordered Agent maps and cancels admitted Program child trees",
    () => {
      const fixture = agentMapProgramFixture()
      const mapAddress = fixture.address
      const executeReady = Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const ready = yield* store.list({ status: "running", limit: 2 })
        yield* Effect.forEach(
          ready,
          (run) =>
            store.claimExecution({ runId: run.runId, ownerId: "program-worker" }).pipe(Effect.flatMap(host.execute)),
          { concurrency: 2, discard: true },
        )
      })
      const admit = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
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
          const store = yield* RunStore.RunStore
          const admitted = yield* store.getProgramOperation({ runId, operation: "workers" })
          const childRunIds = admitted?.childRunIds ?? []
          expect(childRunIds).toHaveLength(3)
          yield* executeReady
          expect(fixture.counts().childFinalizers).toBe(finalizersBefore + 2)
          expect((yield* runtime.inspect(childRunIds[0]!)).status).toBe("succeeded")
          expect((yield* runtime.inspect(childRunIds[1]!)).status).toBe("succeeded")
          expect((yield* runtime.inspect(childRunIds[2]!)).status).toBe("running")
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
        resolver: fixture.resolver,
        addresses: [
          { address: mapAddress, executable: fixture.executable, registrations: registrationsFor(fixture.executable) },
        ],
        scheduler: { pollInterval: "1 day" as const },
      }
      const memory = Effect.gen(function* () {
        const finalizersBefore = fixture.counts().childFinalizers
        yield* finishRun(yield* admit, finalizersBefore)
      })
      const filename = tempDbPath("program-agent-map")
      let sqliteRunId = ""
      let sqliteFinalizersBefore = 0
      const sqliteAdmit = Effect.gen(function* () {
        sqliteFinalizersBefore = fixture.counts().childFinalizers
        sqliteRunId = yield* admit
      })
      const sqliteReopen = Effect.suspend(() => finishRun(sqliteRunId, sqliteFinalizersBefore))
      const cancelAdmitted = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: mapAddress,
          sessionId: "program-map-cancel",
          idempotencyKey: "program-map-cancel",
          prompt: "run",
        })
        yield* executeReady
        const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
        yield* runtime.cancel({ runId: receipt.runId, reason: "cancel admitted Program tree" })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(receipt.runId)).wait?.status).toBe("cancelled")
        for (const childRunId of admitted?.childRunIds ?? []) {
          expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
        }
        expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })).toMatchObject({
          status: "failed",
        })
        expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
      })
      return Effect.gen(function* () {
        yield* scopedWith(Runtime.layerMemory(options))(memory)
        yield* scopedWith(Runtime.layerSqlite({ ...options, filename }))(sqliteAdmit)
        yield* scopedWith(Runtime.layerSqlite({ ...options, filename }))(sqliteReopen)
        yield* scopedWith(Runtime.layerMemory(options))(cancelAdmitted)
        yield* scopedWith(
          Runtime.layerSqlite({
            ...options,
            filename: tempDbPath("program-agent-map-cancel"),
          }),
        )(cancelAdmitted)
      })
    },
    15_000,
  )
})
