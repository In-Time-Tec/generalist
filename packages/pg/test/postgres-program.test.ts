import { layerPostgres } from "@tenetkit/pg"
import { describe, expect, layer } from "@effect/vitest"
import { Clock, Effect, Layer } from "effect"
import { Pins } from "tenetkit"
import { SqlClient } from "effect/unstable/sql"
import { Errors, ExecutionHost, RunClaims, Runtime, RuntimeWorker, RunStore } from "tenetkit/runtime"
import {
  agentMapProgramFixture,
  approvalProgramFixture,
  program,
  programAddress,
  programExecutable,
  programFixture,
} from "../../tenetkit/test/runtime/program-fixture.js"
import { provideScoped } from "../../tenetkit/test/runtime/scoped-provide.js"
import { postgresAvailable, postgresClient, postgresDatabase, postgresTestMaxConnections } from "./helpers.js"
import { registrationsFor } from "../../tenetkit/test/runtime/helpers.js"
import {
  programBudgetContract,
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programReplayDivergenceContract,
  programSettledReplayContract,
} from "../../tenetkit/test/runtime/program-store-contract.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip

describePostgres("postgres Program store contract", () => {
  {
    const database0 = postgresDatabase("program-budget")
    const fixture = programFixture()
    const options = {
      url: database0.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    layer(database0.provision(layerPostgres(options)), { excludeTestServices: true })(
      "enforces budgets, replay identity, and cancellation fences",
      (it) => {
        it.effect("enforces budgets, replay identity, and cancellation fences", () =>
          programBudgetContract.pipe(
            Effect.andThen(programReplayDivergenceContract),
            Effect.andThen(programSettledReplayContract),
            Effect.andThen(programCancellationFinalizerContract),
            Effect.andThen(programCancellationFenceContract),
          ),
        )
      },
    )
  }

  {
    const database1 = postgresDatabase("program-operations")
    const fixture = programFixture()
    const runtimeLayer = layerPostgres({
      url: database1.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    })
    layer(database1.provision(runtimeLayer), { excludeTestServices: true })(
      "atomically records and replays Program tool and log operations",
      (it) => {
        it.effect("atomically records and replays Program tool and log operations", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "postgres-program",
              idempotencyKey: "postgres-program",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            yield* host.execute({ runId: receipt.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
            const runId = receipt.runId
            expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
            expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
              status: "succeeded",
            })
            expect(yield* store.getProgramOperation({ runId, operation: "summary" })).toMatchObject({
              status: "succeeded",
            })
            expect(fixture.counts()).toEqual({ toolCalls: 1, logs: 1 })
          }),
        )
      },
    )
  }

  {
    const database = postgresDatabase("program-exact-root-worker")
    const fixture = programFixture()
    const runtimeLayer = RuntimeWorker.layerWorker({ workerId: "postgres-exact-root-worker" }).pipe(
      Layer.provideMerge(
        layerPostgres({
          url: database.url,
          maxConnections: postgresTestMaxConnections,
          resolver: fixture.resolver,
          addresses: [],
        }),
      ),
    )
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "claims and executes a running parentless exact root without a lane",
      (it) => {
        it.effect("claims and executes a running parentless exact root without a lane", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const worker = yield* RuntimeWorker.RuntimeWorker
            const receipt = yield* runtime.start({
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
              sessionId: "postgres-exact-root-worker",
              idempotencyKey: "postgres-exact-root-worker",
              prompt: "run",
            })
            const claimed = yield* worker.poll
            yield* worker.idle
            expect(receipt.childRunIds).toEqual([])
            expect(claimed.map((item) => item.run.runId)).toEqual([receipt.runId])
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
          }),
        )
      },
    )
  }

  {
    const database2 = postgresDatabase("program-approval")
    const fixture = approvalProgramFixture()
    let runId = ""
    const options = {
      url: database2.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    layer(database2.provision(layerPostgres(options)), { excludeTestServices: true })(
      "atomically reserves one approval response and resumes the Program operation",
      (it) => {
        it.effect("atomically reserves one approval response and resumes the Program operation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "postgres-program-approval",
              idempotencyKey: "postgres-program-approval",
              prompt: "run",
            })
            runId = receipt.runId
            const [first] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: first!.workerId,
              attemptFence: first!.attemptFence,
            })
            yield* Effect.all(
              [
                runtime.respond({
                  runId: receipt.runId,
                  waitId: "approval:echo",
                  resolution: { _tag: "Approved" },
                }),
                runtime.respond({
                  runId: receipt.runId,
                  waitId: "approval:echo",
                  resolution: { _tag: "Approved" },
                }),
              ],
              { concurrency: "unbounded" },
            )
            expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
              status: "reserved",
            })
          }).pipe(
            Effect.andThen(
              Effect.suspend(() =>
                Effect.gen(function* () {
                  const runtime = yield* Runtime.Runtime
                  const store = yield* RunStore.RunStore
                  const claims = yield* RunClaims.RunClaims
                  const host = yield* ExecutionHost.ExecutionHost
                  const receipt = { runId }
                  const [resumed] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
                  expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
                    suspension: { operation: "echo", reason: "approval" },
                    resolution: { _tag: "Approved" },
                  })
                  yield* host.execute({
                    runId: receipt.runId,
                    ownerId: resumed!.workerId,
                    attemptFence: resumed!.attemptFence,
                  })
                  expect(fixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
                  expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
                    status: "succeeded",
                  })
                  expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
                }),
              ),
            ),
          ),
        )
      },
    )
  }

  {
    const database3 = postgresDatabase("program-cancelled-approval")
    const fixture = approvalProgramFixture()
    const options = {
      url: database3.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    layer(database3.provision(layerPostgres(options)), { excludeTestServices: true })(
      "does not reopen a cancelled Program approval operation",
      (it) => {
        it.effect("does not reopen a cancelled Program approval operation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "postgres-program-cancelled-approval",
              idempotencyKey: "postgres-program-cancelled-approval",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "postgres-program-cancelled-approval", limit: 1 })
            yield* host.execute({ runId: receipt.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
            const operation = yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })
            if (operation?.waitId === undefined) return yield* Effect.die("Program approval wait is missing")
            yield* provideScoped(
              postgresClient(database3.url),
              Effect.gen(function* () {
                const sql = yield* SqlClient.SqlClient
                yield* sql`
                UPDATE tenetkit_runs SET status = 'running', owner_worker_id = 'postgres-program-cancelled-approval'
                WHERE run_id = ${receipt.runId}
              `
              }),
            )
            yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
            const response = yield* runtime
              .respond({ runId: receipt.runId, waitId: operation.waitId, resolution: { _tag: "Approved" } })
              .pipe(Effect.flip)
            expect(response).toBeInstanceOf(Errors.WaitNotOpen)
            yield* runtime.signal({ runId: receipt.runId, name: operation.waitId })
            const resume = yield* store
              .resume({ runId: receipt.runId, waitId: operation.waitId, resolution: { _tag: "Approved" } })
              .pipe(Effect.flip)
            expect(resume).toBeInstanceOf(Errors.WaitNotOpen)
            expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
              status: "failed",
            })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
          }),
        )
      },
    )
  }

  {
    const database4 = postgresDatabase("program-children")
    const fixture = agentMapProgramFixture()
    const runtimeLayer = layerPostgres({
      url: database4.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        {
          address: fixture.address,
          executable: fixture.executable,
          registrations: registrationsFor(fixture.executable),
        },
      ],
    })
    layer(database4.provision(runtimeLayer), { excludeTestServices: true })(
      "claims Program children in order, wakes the parent, and settles cancellation",
      (it) => {
        it.effect("claims Program children in order, wakes the parent, and settles cancellation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: fixture.address,
              sessionId: "postgres-program-map",
              idempotencyKey: "postgres-program-map",
              prompt: "run",
            })
            const [parentAdmission] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: parentAdmission!.workerId,
              attemptFence: parentAdmission!.attemptFence,
            })
            const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
            expect(admitted).toMatchObject({ status: "waiting" })
            const firstChildren = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 2 })
            expect(firstChildren).toHaveLength(2)
            yield* Effect.forEach(
              firstChildren,
              (claim) =>
                host.execute({ runId: claim.run.runId, ownerId: claim.workerId, attemptFence: claim.attemptFence }),
              { concurrency: "unbounded", discard: true },
            )
            const [thirdChild] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            yield* host.execute({
              runId: thirdChild!.run.runId,
              ownerId: thirdChild!.workerId,
              attemptFence: thirdChild!.attemptFence,
            })
            expect(fixture.counts().childFinalizers).toBe(3)
            const [resumedParent] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            expect(resumedParent!.run.runId).toBe(receipt.runId)
            yield* host.execute({
              runId: receipt.runId,
              ownerId: resumedParent!.workerId,
              attemptFence: resumedParent!.attemptFence,
            })
            expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
              _tag: "Succeeded",
              result: { _tag: "Program", value: ["third:child", "first:child", "second:child"] },
            })

            const cancelled = yield* runtime.send({
              to: fixture.address,
              sessionId: "postgres-program-map-cancel",
              idempotencyKey: "postgres-program-map-cancel",
              prompt: "run",
            })
            const [cancelAdmission] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
            yield* host.execute({
              runId: cancelled.runId,
              ownerId: cancelAdmission!.workerId,
              attemptFence: cancelAdmission!.attemptFence,
            })
            const cancelledOperation = yield* store.getProgramOperation({
              runId: cancelled.runId,
              operation: "workers",
            })
            yield* runtime.cancel({ runId: cancelled.runId, reason: "cancel admitted Program tree" })
            expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
            for (const childRunId of cancelledOperation?.childRunIds ?? []) {
              expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
            }
            const waitId = cancelledOperation?.waitId
            if (waitId === undefined) return yield* Effect.die("cancelled Program operation wait is missing")
            const response = yield* runtime
              .respond({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
              .pipe(Effect.flip)
            expect(response._tag).toBe("tenetkit/runtime/RunTerminal")
            const signal = yield* runtime.signal({ runId: cancelled.runId, name: waitId }).pipe(Effect.flip)
            expect(signal._tag).toBe("tenetkit/runtime/RunTerminal")
            const resume = yield* store
              .resume({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
              .pipe(Effect.flip)
            expect(resume._tag).toBe("tenetkit/runtime/RunTerminal")
            expect(yield* store.getProgramOperation({ runId: cancelled.runId, operation: "workers" })).toMatchObject({
              status: "failed",
            })
            expect((yield* store.loadProgramState(cancelled.runId))?.activeSlots).toBe(0)
          }),
        )
      },
    )
  }

  {
    const database5 = postgresDatabase("program-crashed")
    const fixture = programFixture()
    const runtimeLayer = layerPostgres({
      url: database5.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        {
          address: programAddress,
          executable: programExecutable,
          registrations: registrationsFor(programExecutable),
        },
      ],
    })
    layer(database5.provision(runtimeLayer), { excludeTestServices: true })(
      "resolves a crashed non-idempotent Program operation without redispatch",
      (it) => {
        it.effect("resolves a crashed non-idempotent Program operation without redispatch", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "postgres-program-unknown",
              idempotencyKey: "postgres-program-unknown",
              prompt: "run",
            })
            const [initial] = yield* claims.claimReadyRuns({ workerId: "postgres-program-crash", limit: 1 })
            const claim = { runId: receipt.runId, ownerId: initial!.workerId, attemptFence: initial!.attemptFence }
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
            yield* runtime.resolveOperation({
              runId: receipt.runId,
              operationId: "echo",
              idempotencyKey: "postgres-program-resolution",
              resolution: { _tag: "Succeeded", value: "recovered" },
            })
            const [recovery] = yield* claims.claimReadyRuns({ workerId: "postgres-program-recovery", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: recovery!.workerId,
              attemptFence: recovery!.attemptFence,
            })
            expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
              _tag: "Succeeded",
              result: { _tag: "Program", value: "recovered|recovered" },
            })
            expect(fixture.counts().toolCalls).toBe(0)
          }),
        )
      },
    )
  }
})
